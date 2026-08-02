-- ───────────────────────────────────────────────────────────────────────────
-- Migratie: flight_monitoring — vluchtstatus-tracking per boeking (Sprint 7.8A)
-- ───────────────────────────────────────────────────────────────────────────
-- WAAROM
--   Elke luchthavenboeking met een vluchtnummer moet gevolgd kunnen worden: een
--   pollingservice werkt periodiek de status/estimated/actual bij via de bestaande
--   Schiphol-API. Deze tabel is de persistente staat van dat volgen.
--
-- CONCURRENCY (B1)
--   De poller CLAIMT rijen atomair via `claim_flights_for_monitoring` met
--   `FOR UPDATE SKIP LOCKED` + een `next_check_at`-vervaltijd. Twee gelijktijdige
--   runs krijgen zo disjuncte rijen (SKIP LOCKED) en een geclaimde rij is pas na
--   `next_check_at` opnieuw claimbaar → geen overlappende/dubbele polling en geen
--   ouder-overschrijft-nieuwer (één verwerker per rij per cyclus).
--
-- SCOPE & VEILIGHEID
--   PUUR ADDITIEF: één nieuwe tabel + twee SECURITY DEFINER RPC's. GEEN pricing,
--   GEEN Stripe. RLS aan met BEWUST GEEN anon/authenticated policy → uitsluitend
--   service_role (server-only), zoals public.price_snapshots. De poller UPDATE't
--   rijen, dus service_role krijgt óók UPDATE.
--
-- ROLLBACK (veilig — tabel/functies worden door geen bestaande code gebruikt):
--   begin;
--     drop function if exists public.claim_flights_for_monitoring(integer, integer);
--     drop function if exists public.register_flight_monitoring(uuid, text, date, text);
--     drop table if exists public.flight_monitoring;
--   commit;
--
-- VALIDATIE: eerst op staging toepassen en de DROP-rollback bewijzen; productie
--   nooit blind muteren.
-- ───────────────────────────────────────────────────────────────────────────

begin;

-- ── 1. TABEL ──────────────────────────────────────────────────────────────────
create table if not exists public.flight_monitoring (
  id              uuid primary key default gen_random_uuid(),

  -- Eén tracking-rij per boeking. Cascade: tracking volgt de levensduur van de boeking.
  booking_id      uuid not null unique references public.bookings(id) on delete cascade,

  -- Genormaliseerd vluchtnummer (hoofdletters, geen scheidingstekens).
  flight_number   text not null
                    check (flight_number ~ '^[A-Z0-9]{2,3}[0-9]{1,4}[A-Z]?$'),

  -- Dag van de vlucht (= ritdatum). Nullable: niet elke bron levert 'm gegarandeerd.
  schedule_date   date,

  -- Richting van het gevolgde ritdeel. Server-side afgeleid.
  direction       text check (direction is null or direction in ('arrival', 'departure')),

  -- Laatst bekende status (leesbaar label uit de Schiphol-normalisatie, bv. "Delayed").
  current_status  text,

  -- Verwachte/werkelijke tijd. Landing bij arrival, off-block bij departure.
  estimated_time  timestamptz,
  actual_time     timestamptz,

  -- Wanneer de poller deze rij voor het laatst controleerde. NULL tot de eerste poll.
  last_checked_at timestamptz,

  -- Wanneer de rij WEER gepolld mag worden (due-tijd). NULL/verleden = due. Stuurt de
  -- claim-selectie + backoff. Nieuwe rijen zijn direct due (default now()).
  next_check_at   timestamptz default now(),

  -- Opeenvolgende mislukte pogingen (voor exponentiële backoff). Reset bij succes.
  retry_count     integer not null default 0 check (retry_count >= 0),

  -- Actief zolang de vlucht nog gevolgd moet worden. De poller zet dit op false zodra
  -- de vlucht terminaal is (geannuleerd/vertrokken, of geland ná de timeout) of te oud.
  is_active       boolean not null default true,

  created_at      timestamptz not null default now()
);

comment on table public.flight_monitoring is
  'Vluchtstatus-tracking per luchthavenboeking (Sprint 7.8A). Server-only (service_role). Een pollingservice claimt rijen atomair (claim_flights_for_monitoring) en werkt status/tijden bij via de Schiphol-API; is_active=false bij een terminale of te oude vlucht.';
comment on column public.flight_monitoring.next_check_at is 'Due-tijd voor de volgende poll. Claim bumpt dit vooruit (backoff/interval) zodat een geclaimde rij niet direct opnieuw wordt opgepakt.';
comment on column public.flight_monitoring.is_active is 'True zolang gevolgd; false bij geannuleerd/vertrokken/geland-na-timeout/te-oud. Stuurt de claim-selectie.';

-- ── 2. INDEX ──────────────────────────────────────────────────────────────────
-- Claim-selectie: due, actieve rijen, oudst-due eerst. Partieel op actieve rijen.
create index if not exists flight_monitoring_due_idx
  on public.flight_monitoring (next_check_at nulls first)
  where is_active;

-- ── 3. RLS ────────────────────────────────────────────────────────────────────
-- RLS aan, BEWUST GEEN anon/authenticated policy → deny-by-default. Alle toegang
-- loopt via de server-only service_role (zoals public.price_snapshots).
alter table public.flight_monitoring enable row level security;

-- ── 4. GRANTS (tabel) ─────────────────────────────────────────────────────────
grant select, insert, update, delete on public.flight_monitoring to service_role;
revoke truncate on public.flight_monitoring from service_role;
revoke all on public.flight_monitoring from anon, authenticated;

-- ── 5. RPC: registratie (idempotent, reactiveert GEEN terminale rijen) ─────────
-- Insert met defaults; bij conflict op booking_id worden UITSLUITEND de
-- identiteitsvelden ververst. is_active/next_check_at/status blijven ongemoeid →
-- een al terminale rij wordt nooit heropgestart door herregistratie.
create or replace function public.register_flight_monitoring(
  p_booking_id uuid,
  p_flight_number text,
  p_schedule_date date default null,
  p_direction text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_flight text;
  v_dir    text;
begin
  v_flight := nullif(upper(regexp_replace(coalesce(p_flight_number, ''), '[^A-Za-z0-9]', '', 'g')), '');
  if v_flight is null or v_flight !~ '^[A-Z0-9]{2,3}[0-9]{1,4}[A-Z]?$' then
    raise exception 'Ongeldig vluchtnummer';
  end if;
  v_dir := nullif(lower(trim(coalesce(p_direction, ''))), '');
  if v_dir is not null and v_dir not in ('arrival', 'departure') then
    raise exception 'Ongeldige vluchtrichting';
  end if;

  insert into flight_monitoring (booking_id, flight_number, schedule_date, direction)
  values (p_booking_id, v_flight, p_schedule_date, v_dir)
  on conflict (booking_id) do update
    set flight_number = excluded.flight_number,
        schedule_date = excluded.schedule_date,
        direction     = excluded.direction;
  -- BEWUST NIET: is_active, next_check_at, current_status, retry_count.
end;
$function$;

-- ── 6. RPC: atomair claimen (concurrency-veilig) ──────────────────────────────
-- Selecteert due, actieve rijen met FOR UPDATE SKIP LOCKED, bumpt last_checked_at
-- en next_check_at (provisioneel, tot de poller het echte resultaat wegschrijft) en
-- geeft ze terug. Disjuncte sets voor gelijktijdige runs; geen dubbele verwerking.
create or replace function public.claim_flights_for_monitoring(
  p_limit integer,
  p_next_interval_seconds integer
)
returns table (
  id uuid,
  booking_id uuid,
  flight_number text,
  schedule_date date,
  direction text,
  created_at timestamptz,
  retry_count integer
)
language sql
security definer
set search_path to 'public'
as $function$
  update flight_monitoring m
     set last_checked_at = now(),
         next_check_at   = now() + make_interval(secs => greatest(p_next_interval_seconds, 1))
   where m.id in (
     select c.id
       from flight_monitoring c
      where c.is_active
        and (c.next_check_at is null or c.next_check_at <= now())
      order by c.next_check_at asc nulls first
      limit greatest(p_limit, 0)
      for update skip locked
   )
  returning m.id, m.booking_id, m.flight_number, m.schedule_date, m.direction, m.created_at, m.retry_count;
$function$;

-- ── 7. GRANTS (functies) — server-only ────────────────────────────────────────
revoke all on function public.register_flight_monitoring(uuid, text, date, text) from public, anon, authenticated;
revoke all on function public.claim_flights_for_monitoring(integer, integer)     from public, anon, authenticated;
grant execute on function public.register_flight_monitoring(uuid, text, date, text) to service_role;
grant execute on function public.claim_flights_for_monitoring(integer, integer)     to service_role;

commit;

-- Controlequeries (ná toepassen):
--   select column_name from information_schema.columns
--   where table_schema='public' and table_name='flight_monitoring' order by ordinal_position;
--   select proname, prosecdef from pg_proc where proname in
--     ('register_flight_monitoring','claim_flights_for_monitoring');
