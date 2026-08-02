-- ───────────────────────────────────────────────────────────────────────────
-- Migratie: flight_monitoring — vluchtstatus-tracking per boeking (Sprint 7.8A)
-- ───────────────────────────────────────────────────────────────────────────
-- WAAROM
--   Elke luchthavenboeking met een vluchtnummer moet gevolgd kunnen worden: een
--   pollingservice werkt periodiek de status/estimated/actual bij via de bestaande
--   Schiphol-API. Deze tabel is de persistente staat van dat volgen.
--
-- SCOPE & VEILIGHEID
--   PUUR ADDITIEF: één nieuwe tabel, geen wijziging aan bestaande objecten of data.
--   GEEN pricing, GEEN Stripe. RLS aan met BEWUST GEEN anon/authenticated policy →
--   uitsluitend service_role (server-only), zoals public.price_snapshots. Anders dan
--   snapshots is deze tabel NIET immutabel: de poller UPDATE't rijen, dus service_role
--   krijgt óók UPDATE.
--
--   Eén monitoring-rij per boeking (UNIQUE booking_id) → registratie is idempotent
--   (upsert). FK met ON DELETE CASCADE: verdwijnt de boeking, dan verdwijnt de tracking.
--
-- ROLLBACK (veilig — tabel wordt door geen bestaande code gebruikt):
--   begin;
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

  -- Genormaliseerd vluchtnummer (hoofdletters, geen scheidingstekens). Zelfde
  -- formaat als booking/RPC en lib/schiphol.
  flight_number   text not null
                    check (flight_number ~ '^[A-Z0-9]{2,3}[0-9]{1,4}[A-Z]?$'),

  -- Dag van de vlucht (= ritdatum). Nullable: niet elke bron levert 'm gegarandeerd.
  schedule_date   date,

  -- Richting van het gevolgde ritdeel. Server-side afgeleid.
  direction       text check (direction is null or direction in ('arrival', 'departure')),

  -- Laatst bekende status (leesbaar label uit de Schiphol-normalisatie, bv. "Delayed").
  current_status  text,

  -- Verwachte/werkelijke tijd (ISO, timestamptz). Landing bij arrival, off-block bij departure.
  estimated_time  timestamptz,
  actual_time     timestamptz,

  -- Wanneer de poller deze rij voor het laatst controleerde. NULL tot de eerste poll.
  last_checked_at timestamptz,

  -- Actief zolang de vlucht nog gevolgd moet worden. De poller zet dit op false zodra
  -- de vlucht geland/vertrokken/geannuleerd is. Bedient de selectie van te pollen rijen.
  is_active       boolean not null default true,

  created_at      timestamptz not null default now()
);

comment on table public.flight_monitoring is
  'Vluchtstatus-tracking per luchthavenboeking (Sprint 7.8A). Server-only (service_role). Een pollingservice werkt current_status/estimated_time/actual_time/last_checked_at periodiek bij via de Schiphol-API en zet is_active=false bij een terminale status.';
comment on column public.flight_monitoring.booking_id is 'FK → bookings.id, UNIQUE (één rij per boeking), ON DELETE CASCADE.';
comment on column public.flight_monitoring.current_status is 'Laatst bekende, leesbare statuslabel uit de Schiphol-normalisatie.';
comment on column public.flight_monitoring.is_active is 'True zolang gevolgd; false bij geland/vertrokken/geannuleerd. Stuurt de poll-selectie.';

-- ── 2. INDEX ──────────────────────────────────────────────────────────────────
-- Enige verwachte querypatroon: de poller haalt actieve rijen op, oudst-gecontroleerd
-- eerst. Partiële index op de actieve rijen; last_checked_at bedient de sortering.
create index if not exists flight_monitoring_active_idx
  on public.flight_monitoring (last_checked_at nulls first)
  where is_active;

-- ── 3. RLS ────────────────────────────────────────────────────────────────────
-- RLS aan, BEWUST GEEN anon/authenticated policy → deny-by-default. Alle toegang
-- loopt via de server-only service_role (zoals public.price_snapshots).
alter table public.flight_monitoring enable row level security;

-- ── 4. GRANTS ─────────────────────────────────────────────────────────────────
-- service_role: server-only, bypasst RLS. SELECT/INSERT/UPDATE (poller muteert) /
-- DELETE. GEEN TRUNCATE.
grant select, insert, update, delete on public.flight_monitoring to service_role;
revoke truncate on public.flight_monitoring from service_role;
-- Defensief expliciet: publieke rollen krijgen niets.
revoke all on public.flight_monitoring from anon, authenticated;

commit;

-- Controlequeries (ná toepassen):
--   select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='flight_monitoring' order by ordinal_position;
--   select relrowsecurity from pg_class where oid='public.flight_monitoring'::regclass; -- t
