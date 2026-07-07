-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: Pricing Brain v1 — schema (Stap 8a-A)
-- Datum: 2026-07-06
--
-- Additieve intelligentielaag NAAST de bestaande pricing-engine. Wijzigt GEEN
-- bestaande tabellen. 9 nieuwe brain_* tabellen, allemaal INTERN:
--   RLS aan, GEEN policies → uitsluitend service_role (deny-by-default voor
--   anon/authenticated). Alle brain-data is commercieel gevoelig.
--
-- Route-identiteit = triplet (pickup_location_id, dropoff_location_id,
-- vehicle_class_id) + tekstsnapshots; fixed_route_price_id nullable (traceer).
-- updated_at via de bestaande, geharde functie public.pricing_set_updated_at().
--
-- Idempotent (create if not exists / drop policy if exists). NIET automatisch
-- toegepast — eerst review + dry-run, daarna supabase db push.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. brain_factor_config — gewichten & confidence per factor (versioned) ──
create table if not exists public.brain_factor_config (
  id uuid primary key default gen_random_uuid(),
  factor_key text not null,
  display_name text,
  category text not null check (category in ('structural','cost','market','behavioural','external','brand')),
  weight numeric(8,4) not null default 1,
  max_confidence numeric(4,3) not null default 1 check (max_confidence between 0 and 1),
  enabled boolean not null default true,
  data_status text not null check (data_status in ('active','estimated','stub')),
  config_version integer not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  unique (factor_key, config_version)
);

-- ── 2. brain_route_metrics — berekende KPI-snapshot per route ──
create table if not exists public.brain_route_metrics (
  id uuid primary key default gen_random_uuid(),
  pickup_location_id uuid not null references public.locations(id) on delete cascade,
  dropoff_location_id uuid not null references public.locations(id) on delete cascade,
  vehicle_class_id uuid not null references public.vehicle_classes(id) on delete cascade,
  fixed_route_price_id uuid references public.fixed_route_prices(id) on delete set null,
  pickup_slug text,
  dropoff_slug text,
  vehicle_class_code text,
  service_type text,
  price numeric(10,2),
  estimated_cost numeric(10,2),
  margin numeric(10,2),
  margin_pct numeric(6,2),
  market_low numeric(10,2),
  market_mid numeric(10,2),
  market_high numeric(10,2),
  market_position text check (market_position in ('Budget','Market','Premium','Luxury')),
  recommended_price numeric(10,2),
  psychological_price numeric(10,2),
  overall_confidence numeric(4,3),
  config_version integer,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by text
);

-- ── 3. brain_recommendations — adviezen + approval flow ──
create table if not exists public.brain_recommendations (
  id uuid primary key default gen_random_uuid(),
  pickup_location_id uuid not null references public.locations(id) on delete cascade,
  dropoff_location_id uuid not null references public.locations(id) on delete cascade,
  vehicle_class_id uuid not null references public.vehicle_classes(id) on delete cascade,
  fixed_route_price_id uuid references public.fixed_route_prices(id) on delete set null,
  pickup_slug text,
  dropoff_slug text,
  vehicle_class_code text,
  action text not null check (action in ('RAISE_URGENT','RAISE','LOWER','REPRICE_PSYCH','POSITION_PREMIUM','MANUAL_REVIEW','HOLD')),
  from_price numeric(10,2),
  to_price numeric(10,2),
  from_return_price numeric(10,2),
  to_return_price numeric(10,2),
  rationale text,
  confidence numeric(4,3),
  expected_margin_pct numeric(6,2),
  status text not null default 'open' check (status in ('open','approved','rejected','applied','superseded')),
  reviewer text,
  reviewed_at timestamptz,
  applied_at timestamptz,
  applied_via text,
  config_version integer,
  run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  deleted_at timestamptz
);

-- ── 4. brain_market_observations — echte marktprijzen (vervangt placeholders) ──
create table if not exists public.brain_market_observations (
  id uuid primary key default gen_random_uuid(),
  pickup_location_id uuid not null references public.locations(id) on delete cascade,
  dropoff_location_id uuid not null references public.locations(id) on delete cascade,
  vehicle_class_id uuid references public.vehicle_classes(id) on delete set null,
  provider text not null,
  provider_tier text check (provider_tier in ('budget','comfort','premium')),
  price numeric(10,2) not null,
  currency text not null default 'EUR',
  is_estimate boolean not null default false,
  source_url text,
  observed_at timestamptz not null,
  valid_until timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  deleted_at timestamptz
);

-- ── 5. brain_simulations — what-if runs (immutable log) ──
create table if not exists public.brain_simulations (
  id uuid primary key default gen_random_uuid(),
  scenario_key text not null,
  label text,
  params jsonb not null,
  baseline_config_version integer,
  result jsonb not null,
  result_hash text,
  run_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by text,
  unique (result_hash)
);

-- ── 6. brain_experiments — prijs→conversie (voedt Learning, v2+) ──
create table if not exists public.brain_experiments (
  id uuid primary key default gen_random_uuid(),
  pickup_location_id uuid not null references public.locations(id) on delete cascade,
  dropoff_location_id uuid not null references public.locations(id) on delete cascade,
  vehicle_class_id uuid not null references public.vehicle_classes(id) on delete cascade,
  test_price numeric(10,2) not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  impressions integer not null default 0,
  conversions integer not null default 0,
  conversion_rate numeric(6,4) generated always as (
    case when impressions > 0 then round(conversions::numeric / impressions, 4) else null end
  ) stored,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  unique (pickup_location_id, dropoff_location_id, vehicle_class_id, test_price, window_start)
);

-- ── 7. brain_signal_demand — tijdreeks (leeg in v1) ──
create table if not exists public.brain_signal_demand (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('route','district','city','zone')),
  pickup_location_id uuid references public.locations(id) on delete cascade,
  zone_key text,
  ts timestamptz not null,
  metric text not null check (metric in ('quote_volume','search_volume','booking_volume')),
  value numeric,
  source text,
  created_at timestamptz not null default now()
);

-- ── 8. brain_signal_supply — tijdreeks (leeg in v1) ──
create table if not exists public.brain_signal_supply (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('city','zone','region')),
  zone_key text,
  ts timestamptz not null,
  metric text not null check (metric in ('active_drivers','utilization','idle_ratio')),
  value numeric,
  source text,
  created_at timestamptz not null default now()
);

-- ── 9. brain_signal_external — tijdreeks (leeg in v1) ──
create table if not exists public.brain_signal_external (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('weather','traffic','holiday','event')),
  region text,
  zone_key text,
  ts timestamptz not null,
  key text,
  value numeric,
  value_text text,
  source text,
  created_at timestamptz not null default now()
);

-- ── Indexes ──
create index if not exists brain_factor_config_enabled_idx on public.brain_factor_config(enabled, config_version);

create unique index if not exists brain_route_metrics_snapshot_uniq
  on public.brain_route_metrics(pickup_location_id, dropoff_location_id, vehicle_class_id, computed_at);
create index if not exists brain_route_metrics_route_idx
  on public.brain_route_metrics(pickup_location_id, dropoff_location_id, vehicle_class_id, computed_at desc);
create index if not exists brain_route_metrics_computed_idx on public.brain_route_metrics(computed_at);

create index if not exists brain_recommendations_status_idx on public.brain_recommendations(status);
create index if not exists brain_recommendations_route_idx
  on public.brain_recommendations(pickup_location_id, dropoff_location_id, vehicle_class_id);
create index if not exists brain_recommendations_created_idx on public.brain_recommendations(created_at);
create unique index if not exists brain_recommendations_open_uniq
  on public.brain_recommendations(pickup_location_id, dropoff_location_id, vehicle_class_id, action)
  where status = 'open' and deleted_at is null;

create index if not exists brain_market_obs_lookup_idx
  on public.brain_market_observations(pickup_location_id, dropoff_location_id, provider, observed_at desc);
create index if not exists brain_market_obs_estimate_idx on public.brain_market_observations(is_estimate);

create index if not exists brain_simulations_scenario_idx on public.brain_simulations(scenario_key, run_at desc);

create index if not exists brain_experiments_route_idx
  on public.brain_experiments(pickup_location_id, dropoff_location_id, vehicle_class_id, window_start);

create index if not exists brain_signal_demand_scope_ts_idx on public.brain_signal_demand(scope, ts);
create index if not exists brain_signal_demand_loc_ts_idx on public.brain_signal_demand(pickup_location_id, ts);
create index if not exists brain_signal_supply_scope_ts_idx on public.brain_signal_supply(scope, ts);
create index if not exists brain_signal_external_cat_ts_idx on public.brain_signal_external(category, ts);
create index if not exists brain_signal_external_region_ts_idx on public.brain_signal_external(region, ts);

-- ── updated_at triggers (hergebruik bestaande geharde functie) ──
drop trigger if exists set_brain_factor_config_updated_at on public.brain_factor_config;
create trigger set_brain_factor_config_updated_at before update on public.brain_factor_config
  for each row execute function public.pricing_set_updated_at();

drop trigger if exists set_brain_recommendations_updated_at on public.brain_recommendations;
create trigger set_brain_recommendations_updated_at before update on public.brain_recommendations
  for each row execute function public.pricing_set_updated_at();

drop trigger if exists set_brain_market_obs_updated_at on public.brain_market_observations;
create trigger set_brain_market_obs_updated_at before update on public.brain_market_observations
  for each row execute function public.pricing_set_updated_at();

drop trigger if exists set_brain_experiments_updated_at on public.brain_experiments;
create trigger set_brain_experiments_updated_at before update on public.brain_experiments
  for each row execute function public.pricing_set_updated_at();

-- ── RLS: aan op alle 9, GEEN policies → uitsluitend service_role ──
alter table public.brain_factor_config       enable row level security;
alter table public.brain_route_metrics        enable row level security;
alter table public.brain_recommendations      enable row level security;
alter table public.brain_market_observations  enable row level security;
alter table public.brain_simulations          enable row level security;
alter table public.brain_experiments          enable row level security;
alter table public.brain_signal_demand        enable row level security;
alter table public.brain_signal_supply        enable row level security;
alter table public.brain_signal_external      enable row level security;

COMMIT;
