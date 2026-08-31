BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Booking lifecycle
--
-- `bookings.status` was tot nu toe een dode kolom: elke rij kreeg de default
-- 'pending' en niets las of wijzigde hem daarna ooit. Vanaf nu draagt hij een
-- echte lifecycle mét constraint, zodat er geen willekeurige waarden meer in
-- kunnen belanden.
--
-- Bewust ORTHOGONAAL gehouden: `payment_status` blijft een eigen as (Stripe),
-- vluchtstatus zit in `flight_monitoring` en de communicatiestand volgt uit
-- `communication_deliveries`. Er komt dus nooit een samengestelde waarde als
-- 'confirmed_paid_driver_assigned' in deze kolom.
-- ─────────────────────────────────────────────────────────────────────────────

-- Backfill — EXPLICIET, niet dichtplakken.
--
-- Geverifieerd op productie (2026-08-30): 9 boekingen, allemaal 'pending',
-- aangemaakt tussen 2026-07-25 en 2026-08-02. 'pending' betekende "aanvraag
-- ontvangen, nog niet bevestigd" en is dus exact 'inquiry'.
update public.bookings
  set status = 'inquiry'
  where status is null or status = 'pending';

-- Elke andere waarde is een verrassing en mag NIET stil naar 'inquiry' worden
-- gemapt: dat zou een bevestigde of geannuleerde rit terugzetten naar aanvraag.
-- Liever een afgebroken migratie dan gemangelde data.
do $$
declare
  v_unexpected text;
begin
  select string_agg(distinct b.status, ', ')
    into v_unexpected
    from public.bookings b
    where b.status not in
      ('inquiry', 'quoted', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled');

  if v_unexpected is not null then
    raise exception
      'Migratie afgebroken: onverwachte booking-status aangetroffen (%). Map deze expliciet voordat de constraint live gaat.',
      v_unexpected;
  end if;
end
$$;

alter table public.bookings alter column status set default 'inquiry';

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('inquiry', 'quoted', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled'));

-- Audittrail: elke overgang is herleidbaar naar wie hem deed en waarom.
create table if not exists public.booking_status_transitions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  from_status text not null,
  to_status text not null,
  actor text not null check (length(trim(actor)) between 1 and 120),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists booking_status_transitions_booking_idx
  on public.booking_status_transitions (booking_id, created_at desc);

alter table public.booking_status_transitions enable row level security;
revoke all on table public.booking_status_transitions from public, anon, authenticated;
grant all on table public.booking_status_transitions to service_role;

-- De enige toegestane manier om `status` te wijzigen. De toegestane overgangen
-- staan hier in de database, niet alleen in applicatiecode, zodat geen enkele
-- route, webhook of dashboardactie eromheen kan werken.
--
-- Een overgang naar de huidige status is een geslaagde no-op (`changed:false`).
-- Dat maakt de functie idempotent: een dubbele webhook of een Vercel-retry
-- levert geen tweede transitie en dus ook geen tweede domeinevent op.
create or replace function public.transition_booking_status(
  p_booking_id uuid,
  p_to text,
  p_actor text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_from    text;
  v_actor   text;
  v_allowed text[];
begin
  v_actor := nullif(trim(coalesce(p_actor, '')), '');
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'missing_actor');
  end if;

  select b.status into v_from
    from public.bookings b
    where b.id = p_booking_id
    for update;

  if v_from is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_booking');
  end if;

  if p_to = v_from then
    return jsonb_build_object('ok', true, 'from', v_from, 'to', v_from, 'changed', false);
  end if;

  v_allowed := case v_from
    when 'inquiry'     then array['quoted', 'confirmed', 'cancelled']
    when 'quoted'      then array['confirmed', 'cancelled']
    when 'confirmed'   then array['assigned', 'cancelled']
    when 'assigned'    then array['in_progress', 'cancelled']
    when 'in_progress' then array['completed', 'cancelled']
    else array[]::text[]
  end;

  if not (p_to = any(v_allowed)) then
    return jsonb_build_object(
      'ok', false, 'error', 'forbidden_transition', 'from', v_from, 'to', p_to
    );
  end if;

  update public.bookings set status = p_to where id = p_booking_id;

  insert into public.booking_status_transitions (booking_id, from_status, to_status, actor, reason)
    values (p_booking_id, v_from, p_to, v_actor, nullif(trim(coalesce(p_reason, '')), ''));

  return jsonb_build_object('ok', true, 'from', v_from, 'to', p_to, 'changed', true);
end;
$function$;

revoke all on function public.transition_booking_status(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.transition_booking_status(uuid, text, text, text)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Communicatielog
--
-- Eén regel per bericht per kanaal. De unieke `dedup_key` is de idempotency-rail:
-- claimen gebeurt VÓÓR het verzenden, dus een dubbele webhook of retry vindt een
-- bestaande rij en verstuurt niets.
--
-- Bewust GEEN boekingsinhoud in deze tabel: geen adressen, prijzen, vluchten of
-- berichttekst. Alleen wie/wat/waarheen/welke stand, zodat het log gelezen kan
-- worden zonder de boekingsgegevens te ontsluiten.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.communication_deliveries (
  id uuid primary key default gen_random_uuid(),
  dedup_key text not null unique,
  event_type text not null,
  subject_type text not null check (subject_type in ('booking', 'lead', 'invoice')),
  subject_id text not null,
  booking_id uuid references public.bookings(id) on delete set null,
  template_id text not null,
  audience text not null check (audience in ('customer', 'operations')),
  channel text not null check (channel in ('email', 'whatsapp', 'sms', 'internal')),
  locale text not null check (locale in ('nl', 'en')),
  recipient text not null,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'skipped')),
  skip_reason text,
  provider text,
  provider_message_id text,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  settled_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists communication_deliveries_provider_message_idx
  on public.communication_deliveries (provider_message_id)
  where provider_message_id is not null;
create index if not exists communication_deliveries_booking_idx
  on public.communication_deliveries (booking_id, queued_at desc);
create index if not exists communication_deliveries_status_idx
  on public.communication_deliveries (status, queued_at desc);

alter table public.communication_deliveries enable row level security;
revoke all on table public.communication_deliveries from public, anon, authenticated;
grant all on table public.communication_deliveries to service_role;

-- Claim vóór verzending. Retourneert `claimed:false` wanneer de dedup_key al
-- bestaat — dan heeft een eerdere poging dit bericht al opgepakt.
create or replace function public.claim_communication_delivery(
  p_dedup_key text,
  p_event_type text,
  p_subject_type text,
  p_subject_id text,
  p_booking_id uuid,
  p_template_id text,
  p_audience text,
  p_channel text,
  p_locale text,
  p_recipient text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id     uuid;
  v_status text;
begin
  insert into public.communication_deliveries (
    dedup_key, event_type, subject_type, subject_id, booking_id,
    template_id, audience, channel, locale, recipient, attempts
  ) values (
    p_dedup_key, p_event_type, p_subject_type, p_subject_id, p_booking_id,
    p_template_id, p_audience, p_channel, p_locale, p_recipient, 1
  )
  on conflict (dedup_key) do nothing
  returning id into v_id;

  if v_id is not null then
    return jsonb_build_object('claimed', true, 'id', v_id);
  end if;

  select d.id, d.status into v_id, v_status
    from public.communication_deliveries d
    where d.dedup_key = p_dedup_key;

  return jsonb_build_object('claimed', false, 'id', v_id, 'status', v_status);
end;
$function$;

-- Afronden na de verzendpoging.
create or replace function public.settle_communication_delivery(
  p_id uuid,
  p_status text,
  p_provider text default null,
  p_provider_message_id text default null,
  p_error text default null,
  p_skip_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.communication_deliveries
    set status = p_status,
        provider = coalesce(p_provider, provider),
        provider_message_id = coalesce(p_provider_message_id, provider_message_id),
        last_error = p_error,
        skip_reason = coalesce(p_skip_reason, skip_reason),
        sent_at = case when p_status = 'sent' then pg_catalog.now() else sent_at end,
        settled_at = case when p_status in ('failed', 'skipped') then pg_catalog.now() else settled_at end,
        updated_at = pg_catalog.now()
    where id = p_id;
end;
$function$;

-- Providerstatus uit de Resend-webhook. Alleen voorwaarts: een 'delivered' die
-- ná een 'bounced' binnenkomt overschrijft de eindstand niet.
create or replace function public.record_communication_provider_event(
  p_provider_message_id text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id      uuid;
  v_current text;
begin
  select d.id, d.status into v_id, v_current
    from public.communication_deliveries d
    where d.provider_message_id = p_provider_message_id
    for update;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_message');
  end if;

  if v_current in ('bounced', 'complained') then
    return jsonb_build_object('ok', true, 'changed', false, 'status', v_current);
  end if;

  update public.communication_deliveries
    set status = p_status,
        settled_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    where id = v_id;

  return jsonb_build_object('ok', true, 'changed', true, 'status', p_status);
end;
$function$;

revoke all on function public.claim_communication_delivery(text, text, text, text, uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_communication_delivery(text, text, text, text, uuid, text, text, text, text, text)
  to service_role;

revoke all on function public.settle_communication_delivery(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.settle_communication_delivery(uuid, text, text, text, text, text)
  to service_role;

revoke all on function public.record_communication_provider_event(text, text)
  from public, anon, authenticated;
grant execute on function public.record_communication_provider_event(text, text)
  to service_role;

COMMIT;
