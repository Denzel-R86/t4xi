-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: Stripe payment-status + server-trusted booking↔PaymentIntent-koppeling
-- Datum: 2026-07-24  (Sprint 7.4 — webhooks + server-side payment confirmation)
--
-- Doel:
--   · minimale payment-velden op `bookings` (non-destructief, backwards-compatible);
--   · `stripe_webhook_events` voor idempotente webhook-afhandeling (unique PK);
--   · `link_booking_payment(...)` — koppelt bij create-intent server-side een
--     PaymentIntent aan een boeking (SECURITY DEFINER, service_role-only);
--   · `process_stripe_payment_event(...)` — verwerkt een geverifieerd webhook-event
--     idempotent, met guarded statusovergangen (paid is terminaal).
--
-- VEILIGHEID:
--   · geen nieuwe client-policies; anon/authenticated kunnen payment_status NIET zetten;
--   · beide functions: expliciete search_path, execute alleen voor service_role;
--   · bestaande boekingen zonder Stripe blijven geldig (payment_status default 'unpaid').
--
-- NIET AUTOMATISCH GEPUSHT — eerst review, daarna (met akkoord) supabase db push.
-- Volledig IDEMPOTENT: opnieuw toepassen is een no-op.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Payment-velden op bookings (allemaal nullable, veilige defaults) ──────
alter table public.bookings
  add column if not exists stripe_payment_intent_id text,
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists amount_due_cents integer,
  add column if not exists amount_paid_cents integer,
  add column if not exists payment_currency text,
  add column if not exists paid_at timestamptz;

-- Toegestane payment_status-waarden (bewust beperkt).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_payment_status_chk'
  ) then
    alter table public.bookings
      add constraint bookings_payment_status_chk
      check (payment_status in ('unpaid', 'pending', 'processing', 'paid', 'failed', 'canceled'));
  end if;
end $$;

-- Bedragen niet-negatief, currency beperkt, paid_at alleen bij paid.
-- Bestaande rijen: amount_*/currency/paid_at zijn null → alle checks slagen.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_amount_due_positive_chk') then
    alter table public.bookings add constraint bookings_amount_due_positive_chk
      check (amount_due_cents is null or amount_due_cents > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookings_amount_paid_nonneg_chk') then
    alter table public.bookings add constraint bookings_amount_paid_nonneg_chk
      check (amount_paid_cents is null or amount_paid_cents >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookings_payment_currency_chk') then
    alter table public.bookings add constraint bookings_payment_currency_chk
      check (payment_currency is null or payment_currency = 'eur');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookings_paid_at_only_when_paid_chk') then
    alter table public.bookings add constraint bookings_paid_at_only_when_paid_chk
      check (paid_at is null or payment_status = 'paid');
  end if;
end $$;

-- Eén PaymentIntent hoort bij hooguit één boeking → unieke koppeling.
create unique index if not exists uq_bookings_stripe_pi
  on public.bookings (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

-- ── 2. Idempotency-log voor webhook-events ──────────────────────────────────
create table if not exists public.stripe_webhook_events (
  stripe_event_id   text primary key,          -- unieke PK = race-safe idempotency
  event_type        text not null,
  payment_intent_id text,
  processed_at      timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
-- Geen anon/authenticated-policies: alleen service_role (en SECURITY DEFINER-RPC's).
drop policy if exists "stripe_webhook_events_service_all" on public.stripe_webhook_events;
create policy "stripe_webhook_events_service_all" on public.stripe_webhook_events
  for all to service_role using (true) with check (true);

-- ── 3. RPC: link_booking_payment — server-trusted koppeling bij create-intent ─
-- Zoekt de boeking op het INTERNE booking_id (UUID, capability), koppelt de
-- PaymentIntent en zet payment_status 'unpaid' → 'pending'. Downgradet nooit
-- een reeds 'paid'. SECURITY DEFINER hardening: lege search_path + volledig
-- gekwalificeerde objectnamen (Supabase/Postgres-advies).
-- Retourneert een uitkomstcode: 'linked' | 'not_found' | 'already_paid' |
-- 'no_price' | 'pi_conflict'. De route accepteert alleen 'linked'.
create or replace function public.link_booking_payment(
  p_booking_id uuid,
  p_payment_intent_id text,
  p_amount_due_cents integer,
  p_currency text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
  v_existing_pi text;
  v_price numeric;
begin
  if p_amount_due_cents is null or p_amount_due_cents <= 0 then
    raise exception 'Ongeldig bedrag';
  end if;
  if lower(coalesce(p_currency, '')) <> 'eur' then
    raise exception 'Ongeldige currency';
  end if;
  if p_payment_intent_id is null or p_payment_intent_id = '' then
    raise exception 'Ongeldige payment intent';
  end if;

  -- Rijvergrendeling: serialiseert parallelle create-intent-koppelingen op
  -- dezelfde boeking, zodat er geen race ontstaat waarbij twee PI's "winnen".
  select b.payment_status, b.stripe_payment_intent_id, b.price_euros
    into v_status, v_existing_pi, v_price
    from public.bookings b
   where b.id = p_booking_id
   for update;

  if not found then return 'not_found'; end if;
  if v_status = 'paid' then return 'already_paid'; end if;          -- nooit downgraden
  if v_price is null then return 'no_price'; end if;
  if v_existing_pi is not null and v_existing_pi <> p_payment_intent_id then
    return 'pi_conflict';  -- nooit een ANDERE reeds gekoppelde PaymentIntent overschrijven
  end if;

  -- Idempotent: v_existing_pi is null (eerste koppeling) of gelijk aan de PI.
  update public.bookings
     set stripe_payment_intent_id = p_payment_intent_id,
         amount_due_cents = p_amount_due_cents,
         payment_currency = lower(p_currency),
         payment_status = case when payment_status = 'unpaid' then 'pending' else payment_status end
   where id = p_booking_id;

  return 'linked';
end;
$function$;

-- ── 4. RPC: process_stripe_payment_event — idempotent + guarded transitions ──
-- Verwerkt een REEDS SIGNATURE-GEVERIFIEERD event. Idempotent via de PK van
-- stripe_webhook_events; guarded overgangen (paid is terminaal). Retourneert een
-- korte, PII-vrije uitkomstcode voor operationele logging.
create or replace function public.process_stripe_payment_event(
  p_event_id text,
  p_event_type text,
  p_payment_intent_id text,
  p_new_status text,
  p_amount_received_cents integer,
  p_currency text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_inserted integer;
  v_current text;
  v_due integer;
begin
  -- Idempotency: registreer het event; bij dubbel → niets muteren.
  insert into public.stripe_webhook_events (stripe_event_id, event_type, payment_intent_id)
  values (p_event_id, p_event_type, p_payment_intent_id)
  on conflict (stripe_event_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return 'duplicate';
  end if;

  -- Boeking uitsluitend via de server-gepersisteerde PaymentIntent-id (nooit clientdata).
  select b.payment_status, b.amount_due_cents
    into v_current, v_due
    from public.bookings b
   where b.stripe_payment_intent_id = p_payment_intent_id
   for update;

  if v_current is null then
    return 'no_booking'; -- event geregistreerd, geen gekoppelde boeking → geen mutatie
  end if;

  if p_new_status = 'paid' then
    if v_current = 'paid' then
      return 'already_paid';
    end if;
    if lower(coalesce(p_currency, '')) <> 'eur'
       or p_amount_received_cents is null
       or v_due is null
       or p_amount_received_cents <> v_due then
      return 'amount_mismatch'; -- NIET als paid markeren
    end if;
    update public.bookings
       set payment_status = 'paid',
           amount_paid_cents = p_amount_received_cents,
           paid_at = now()
     where stripe_payment_intent_id = p_payment_intent_id;
    return 'paid';

  elsif p_new_status = 'processing' then
    if v_current = 'paid' then return 'noop_terminal'; end if;
    update public.bookings set payment_status = 'processing'
      where stripe_payment_intent_id = p_payment_intent_id;
    return 'processing';

  elsif p_new_status = 'failed' then
    if v_current = 'paid' then return 'noop_terminal'; end if;
    update public.bookings set payment_status = 'failed'
      where stripe_payment_intent_id = p_payment_intent_id;
    return 'failed';

  elsif p_new_status = 'canceled' then
    if v_current = 'paid' then return 'noop_terminal'; end if;
    update public.bookings set payment_status = 'canceled'
      where stripe_payment_intent_id = p_payment_intent_id;
    return 'canceled';
  end if;

  return 'ignored';
end;
$function$;

-- ── 5. Execute-permissies: uitsluitend service_role ─────────────────────────
-- Expliciet intrekken bij PUBLIC én bij de browser-rollen anon/authenticated;
-- daarna alleen service_role toestaan. Geen browser-role kan deze functies draaien.
revoke execute on function public.link_booking_payment(uuid, text, integer, text) from public, anon, authenticated;
revoke execute on function public.process_stripe_payment_event(text, text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.link_booking_payment(uuid, text, integer, text) to service_role;
grant execute on function public.process_stripe_payment_event(text, text, text, text, integer, text) to service_role;

COMMIT;
