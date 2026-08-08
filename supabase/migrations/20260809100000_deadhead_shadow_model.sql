-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: Deadhead-shadowmodel (SHADOW-ONLY)
-- Datum: 2026-08-09
--
-- Doel: server-side observatie van een kandidaat-prijsaanpassing voor lange,
--       perifere ritten (lege terugkilometers) — GEEN wijziging aan de
--       bindende klantprijs. Zie plan: deadhead-shadowanalyse (SHADOW-ONLY).
--
-- Nieuwe tabellen (2):
--   pricing_deadhead_config   — singleton-config (database-afgedwongen: max. 1
--                                actieve rij via een partial unique index)
--   pricing_high_demand_zones — bestemmingen die NOOIT als "perifeer" tellen;
--                                database-afgedwongen: dezelfde stad/locatie
--                                mag niet twee keer actief geconfigureerd staan
--
-- Overige wijziging:
--   pricing_quote_logs.price_source CHECK verbreed met 'distance_tariff' —
--   nodig zodat de shadow-logregels (die alleen bij het afstand-tarief
--   ontstaan) correct worden toegeschreven i.p.v. verkeerd gelabeld.
--
-- NIET AUTOMATISCH TOEGEPAST — eerst review door owner, daarna pas:
--   supabase db push   (of via MCP apply_migration)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. TABELLEN
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.pricing_deadhead_config (
  id uuid primary key default gen_random_uuid(),
  min_distance_km numeric(6, 2) not null default 80
    constraint pricing_deadhead_config_min_distance_km_check check (min_distance_km >= 0),
  -- Fractie van de passagiersafstand die als lege terugrit meetelt. Begrensd op
  -- (0, 1]: 0 zou de hele deadhead-berekening zinledig maken (altijd 0 km), en
  -- >1 zou betekenen dat de "lege terugrit" langer is dan de rit zelf — dat is
  -- geen realistisch operationeel scenario en wijst op een configuratiefout.
  deadhead_factor numeric(4, 3) not null default 0.60
    constraint pricing_deadhead_config_deadhead_factor_check check (deadhead_factor > 0 and deadhead_factor <= 1),
  max_deadhead_km numeric(6, 2) not null default 80
    constraint pricing_deadhead_config_max_deadhead_km_check check (max_deadhead_km >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Database-side afgedwongen: ten hoogste één actieve rij. Index op een
-- constante (true), alleen voor rijen met active=true — een tweede
-- active=true-rij zou botsen op dezelfde indexwaarde. A/B-varianten/cohorten
-- zijn bewust NIET ondersteund door dit schema; die krijgen bij een
-- toekomstige behoefte een eigen, expliciet ontwerp.
create unique index if not exists pricing_deadhead_config_one_active
  on public.pricing_deadhead_config ((true))
  where active;

create table if not exists public.pricing_high_demand_zones (
  id uuid primary key default gen_random_uuid(),
  city_id uuid references public.cities(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  label text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint pricing_high_demand_zones_key_check
    check ((city_id is not null) <> (location_id is not null))
);

-- Database-side afgedwongen: dezelfde stad, resp. dezelfde locatie, mag niet
-- twee keer actief als high-demand-zone geconfigureerd staan.
create unique index if not exists pricing_high_demand_zones_city_active_unique
  on public.pricing_high_demand_zones (city_id)
  where active and city_id is not null;

create unique index if not exists pricing_high_demand_zones_location_active_unique
  on public.pricing_high_demand_zones (location_id)
  where active and location_id is not null;

create index if not exists pricing_high_demand_zones_city_id_idx
  on public.pricing_high_demand_zones(city_id);
create index if not exists pricing_high_demand_zones_location_id_idx
  on public.pricing_high_demand_zones(location_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. updated_at TRIGGER (hergebruikt de bestaande pricing_set_updated_at())
-- ─────────────────────────────────────────────────────────────────────────

drop trigger if exists set_pricing_deadhead_config_updated_at on public.pricing_deadhead_config;
create trigger set_pricing_deadhead_config_updated_at before update on public.pricing_deadhead_config
  for each row execute function public.pricing_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 3. price_source CHECK verbreden met 'distance_tariff'
-- ─────────────────────────────────────────────────────────────────────────

alter table public.pricing_quote_logs
  drop constraint if exists pricing_quote_logs_price_source_check;
alter table public.pricing_quote_logs
  add constraint pricing_quote_logs_price_source_check
    check (price_source in ('fixed_route_prices', 'pricing_rules', 'distance_tariff'));

-- ─────────────────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY — zelfde patroon als de overige pricing-tabellen:
--    GEEN anon/authenticated policy (deny-by-default) → uitsluitend service_role.
--    Dit is interne configuratie/observatiedata, geen publiek te lezen prijsdata.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.pricing_deadhead_config   enable row level security;
alter table public.pricing_high_demand_zones enable row level security;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. SEED — config + high-demand-zones
--    Waarden exact zoals afgesproken: deadhead_factor 0.60, min_distance_km 80,
--    max_deadhead_km 80. High-demand: Amsterdam, Rotterdam, Utrecht (steden)
--    + Schiphol Airport (locatie).
-- ─────────────────────────────────────────────────────────────────────────

insert into public.pricing_deadhead_config (min_distance_km, deadhead_factor, max_deadhead_km, active)
select 80, 0.60, 80, true
where not exists (select 1 from public.pricing_deadhead_config where active);

insert into public.pricing_high_demand_zones (city_id, label)
select c.id, c.name
from public.cities c
where c.slug in ('amsterdam', 'rotterdam', 'utrecht')
on conflict do nothing;

insert into public.pricing_high_demand_zones (location_id, label)
select l.id, l.name
from public.locations l
where l.slug = 'schiphol-airport'
on conflict do nothing;

COMMIT;
