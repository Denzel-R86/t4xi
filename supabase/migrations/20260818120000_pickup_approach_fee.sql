-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: pickup-aanrijmodel (operationele standplaatsen + servicegebieden)
-- Datum: 2026-08-18
--
-- Commercieel akkoord (2026-08-18): een dynamisch geprijsde rit vanaf een
-- ophaallocatie buiten de operationele standplaatsregio's is voortaan
-- "Offerte op aanvraag" (landelijke beperking, expliciet bevestigd door de
-- eigenaar) — en binnen een toegewezen regio krijgt de rit een aanrijcomponent
-- (T4XI-standplaats → ophaallocatie), berekend met een vloeiende vrijstelling
-- en een cap. Zie lib/pricing/approach-fee.ts / lib/pricing/service-area.ts
-- voor de berekening; deze migratie levert uitsluitend de DATA.
--
-- Drie nieuwe, additieve tabellen — GEEN wijziging aan bestaande vaste routes,
-- destination-deadheadconfig (pricing_deadhead_*) of eerder toegepaste
-- migraties. Zelfde beveiligingspatroon als pricing_deadhead_config/
-- pricing_high_demand_zones/pricing_deadhead_eligible_zones: RLS aan, GEEN
-- publieke policy, uitsluitend service_role.
--
-- Bewust GEEN privé-huisadres opgeslagen: `postcode`/`latitude`/`longitude`
-- zijn het officiële PDOK-postcodecentroïde van de standplaats — een
-- operationeel referentiepunt, geen exact bedrijfsadres.
--
-- NIET AUTOMATISCH TOEGEPAST — eerst review door de eigenaar, daarna pas:
--   supabase db push   (of via MCP apply_migration)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Operationele standplaatsen ───────────────────────────────────────────────

create table if not exists public.pricing_operational_bases (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  label text not null,
  postcode text not null,
  latitude numeric(9, 6) not null,
  longitude numeric(9, 6) not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint pricing_operational_bases_latitude_check check (latitude between -90 and 90),
  constraint pricing_operational_bases_longitude_check check (longitude between -180 and 180)
);

create unique index if not exists pricing_operational_bases_slug_active_unique
  on public.pricing_operational_bases (slug)
  where active;

alter table public.pricing_operational_bases enable row level security;

-- ── Servicegebieden: officiële PDOK-gemeentenaam → standplaats ──────────────
-- Bewust op GEMEENTE, niet op woonplaats/postcode-bereik: "Laren" (Noord-
-- Holland, gemeente Laren) is daarmee al ondubbelzinnig te onderscheiden van
-- de gelijknamige woonplaats "Laren" in gemeente Lochem (Gelderland) — die
-- laatste heeft een eigen, andere gemeentenaam, dus nooit een verkeerde match.

create table if not exists public.pricing_service_areas (
  id uuid primary key default gen_random_uuid(),
  base_id uuid not null references public.pricing_operational_bases(id) on delete cascade,
  gemeente_naam text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Database-side afgedwongen: dezelfde gemeente mag niet twee keer actief aan
-- een (mogelijk andere) standplaats gekoppeld staan.
create unique index if not exists pricing_service_areas_gemeente_active_unique
  on public.pricing_service_areas (lower(gemeente_naam))
  where active;

create index if not exists pricing_service_areas_base_id_idx
  on public.pricing_service_areas (base_id);

alter table public.pricing_service_areas enable row level security;

-- ── Aanrijmodel-configuratie ─────────────────────────────────────────────────

create table if not exists public.pricing_approach_fee_config (
  id uuid primary key default gen_random_uuid(),
  customer_share_pct numeric(4, 3) not null default 0.500,
  free_km numeric(6, 2) not null default 5,
  full_coverage_km numeric(6, 2) not null default 15,
  max_customer_component_cents integer not null default 2500,
  max_approach_km numeric(6, 2) not null default 35,
  per_km_cents integer not null default 65,
  per_min_cents integer not null default 110,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pricing_approach_fee_config_customer_share_pct_check
    check (customer_share_pct > 0 and customer_share_pct <= 1),
  constraint pricing_approach_fee_config_free_km_check check (free_km >= 0),
  constraint pricing_approach_fee_config_full_coverage_km_check
    check (full_coverage_km > free_km),
  constraint pricing_approach_fee_config_max_customer_component_cents_check
    check (max_customer_component_cents > 0),
  constraint pricing_approach_fee_config_max_approach_km_check
    check (max_approach_km > full_coverage_km),
  constraint pricing_approach_fee_config_per_km_cents_check check (per_km_cents >= 0),
  constraint pricing_approach_fee_config_per_min_cents_check check (per_min_cents >= 0)
);

-- Database-side afgedwongen: ten hoogste één actieve configuratierij.
create unique index if not exists pricing_approach_fee_config_one_active
  on public.pricing_approach_fee_config ((true))
  where active;

alter table public.pricing_approach_fee_config enable row level security;

-- ─────────────────────────────────────────────────────────────────────────
-- Seed
-- ─────────────────────────────────────────────────────────────────────────

-- Standplaatsen: officiële PDOK-postcodecentroïden (2026-08-15/18 geverifieerd).
insert into public.pricing_operational_bases (slug, label, postcode, latitude, longitude)
values
  ('almere', 'Almere', '1361BP', 52.342886, 5.139465),
  ('spijkenisse', 'Spijkenisse', '3201LG', 51.852165, 4.335123)
on conflict do nothing;

-- Servicegebieden — uitsluitend de expliciet goedgekeurde gemeenten (2026-08-18).
insert into public.pricing_service_areas (base_id, gemeente_naam)
select b.id, g.gemeente_naam
from public.pricing_operational_bases b
join (
  values
    -- Basis Almere: regio Almere/Flevoland
    ('almere', 'Almere'),
    ('almere', 'Lelystad'),
    -- Basis Almere: regio Amsterdam
    ('almere', 'Amsterdam'),
    ('almere', 'Diemen'),
    ('almere', 'Amstelveen'),
    -- Basis Almere: regio Het Gooi
    ('almere', 'Blaricum'),
    ('almere', 'Hilversum'),
    ('almere', 'Huizen'),
    ('almere', 'Laren'),
    ('almere', 'Eemnes'),
    ('almere', 'Gooise Meren'),
    -- Basis Spijkenisse: regio Rotterdam
    ('spijkenisse', 'Nissewaard'),
    ('spijkenisse', 'Rotterdam'),
    ('spijkenisse', 'Barendrecht'),
    ('spijkenisse', 'Schiedam'),
    ('spijkenisse', 'Vlaardingen'),
    ('spijkenisse', 'Capelle aan den IJssel'),
    ('spijkenisse', 'Voorne aan Zee')
) as g(base_slug, gemeente_naam) on g.base_slug = b.slug
on conflict do nothing;

-- Aanrijmodel-configuratie: exact de door de eigenaar goedgekeurde parameters
-- (2026-08-18) — 50% klantaandeel, 0–5km vrij, 5–15km lineaire uitfasering,
-- €25 cap, >35km offerte op aanvraag, €0,65/km + €1,10/min referentie.
insert into public.pricing_approach_fee_config (
  customer_share_pct, free_km, full_coverage_km,
  max_customer_component_cents, max_approach_km, per_km_cents, per_min_cents
)
select 0.500, 5, 15, 2500, 35, 65, 110
where not exists (select 1 from public.pricing_approach_fee_config where active);

COMMIT;
