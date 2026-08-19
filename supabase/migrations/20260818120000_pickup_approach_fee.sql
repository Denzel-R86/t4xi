-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: pickup-aanrijmodel (operationele standplaatsen + servicegebieden)
-- Datum: 2026-08-18 — bijgewerkt 2026-08-18 (derde standplaats Amsterdam-
-- Zuidoost) en 2026-08-19 (maxApproachKm 35→40km, idempotente/conflictveilige
-- seedlogica). Deze migratie is NOG NIET toegepast, dus rechtstreeks
-- bijgewerkt i.p.v. een aparte volgmigratie.
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
-- Seed-inserts zijn BEWUST NIET "on conflict do nothing" (2026-08-19,
-- gecorrigeerd): dat zou een ECHTE botsing — een gemeente die al actief aan
-- een ANDERE standplaats gekoppeld staat, of dezelfde standplaats/config met
-- afwijkende waarden — stilzwijgend negeren. Zie de `do $$ ... $$;`-blokken
-- verderop: per seedrij ontbreekt-dan-invoegen, bestaat-identiek-dan-no-op,
-- bestaat-afwijkend-dan-RAISE EXCEPTION (hele transactie rolt terug). Dat
-- maakt de migratie zowel idempotent (herhaald toepassen met exact dezelfde
-- seed is veilig) als conflictveilig (een echte afwijking faalt hard, wordt
-- nooit stil overschreven).
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
  max_approach_km numeric(6, 2) not null default 40,
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

-- Idempotentie-/conflictbeleid (2026-08-19, derde bijwerking van PR #20): geen
-- van de drie seed-blokken hieronder gebruikt nog "on conflict do nothing" —
-- dat zou een ECHTE botsing (dezelfde gemeente/standplaats/config met
-- AFWIJKENDE waarden) stilzwijgend negeren. In plaats daarvan, per seedrij:
--   • ontbreekt              → invoegen
--   • bestaat, IDENTIEK      → veilige no-op (idempotent — de migratie mag
--                               herhaald worden zonder side effect)
--   • bestaat, AFWIJKEND     → RAISE EXCEPTION, hele transactie rolt terug
-- (BEGIN/COMMIT hierboven) — nooit stilzwijgend overschrijven, nooit blind
-- falen op een reeds-identieke rij.

-- ── Standplaatsen: officiële PDOK-postcodecentroïden ────────────────────────
-- (2026-08-15/18 geverifieerd via api.pdok.nl/bzk/locatieserver — 1102JL:
-- gemeente/woonplaats Amsterdam, centroide_ll POINT(4.95697474 52.31977259).
-- GEEN huisnummer opgeslagen.)
do $$
declare
  seed record;
  existing record;
begin
  for seed in
    select * from (values
      ('almere', 'Almere', '1361BP', 52.342886::numeric(9,6), 5.139465::numeric(9,6)),
      ('amsterdam-zuidoost', 'Amsterdam-Zuidoost', '1102JL', 52.319773::numeric(9,6), 4.956975::numeric(9,6)),
      ('spijkenisse', 'Spijkenisse', '3201LG', 51.852165::numeric(9,6), 4.335123::numeric(9,6))
    ) as s(slug, label, postcode, latitude, longitude)
  loop
    select * into existing from public.pricing_operational_bases where slug = seed.slug and active limit 1;
    if not found then
      insert into public.pricing_operational_bases (slug, label, postcode, latitude, longitude)
      values (seed.slug, seed.label, seed.postcode, seed.latitude, seed.longitude);
    elsif existing.label = seed.label
      and existing.postcode = seed.postcode
      and existing.latitude = seed.latitude
      and existing.longitude = seed.longitude
    then
      null; -- identiek: veilige no-op
    else
      raise exception
        'pricing_operational_bases: actieve standplaats "%" bestaat al met afwijkende waarden (label=%, postcode=%, lat=%, lng=%) terwijl de seed (label=%, postcode=%, lat=%, lng=%) verwacht — migratie afgebroken',
        seed.slug, existing.label, existing.postcode, existing.latitude, existing.longitude,
        seed.label, seed.postcode, seed.latitude, seed.longitude;
    end if;
  end loop;
end $$;

-- ── Servicegebieden — uitsluitend de expliciet goedgekeurde gemeenten ───────
-- (2026-08-19, derde bijwerking: maxApproachKm 35→40km, verder ongewijzigde
-- indeling). Weesp krijgt GEEN eigen rij: sinds de gemeentelijke herindeling
-- van 2022 is de officiële PDOK-gemeente van Weesp al "Amsterdam"
-- (geverifieerd), dus de Amsterdam-rij dekt Weesp automatisch. Zelfde
-- redenering voor Bussum/Naarden/Muiden/Muiderberg, die alle vier officieel
-- onder gemeente "Gooise Meren" vallen.
--
-- Utrecht: UITSLUITEND de officiële gemeente Utrecht zelf — Nieuwegein,
-- Stichtse Vecht, De Bilt, Zeist, Bunnik, Houten, IJsselstein en Woerden zijn
-- elk hun eigen, aparte gemeente en blijven bewust ongeconfigureerd
-- ("unassigned" → Offerte op aanvraag) totdat expliciet toegevoegd.
do $$
declare
  seed record;
  existing record;
  target_base_id uuid;
begin
  for seed in
    select * from (values
      -- Basis Almere: regio Almere/Flevoland
      ('almere', 'Almere'),
      ('almere', 'Lelystad'),
      -- Basis Almere: regio Het Gooi
      ('almere', 'Blaricum'),
      ('almere', 'Hilversum'),
      ('almere', 'Huizen'),
      ('almere', 'Laren'),
      ('almere', 'Eemnes'),
      ('almere', 'Gooise Meren'),
      -- Basis Amsterdam-Zuidoost: regio Amsterdam (incl. Weesp via gemeente Amsterdam)
      ('amsterdam-zuidoost', 'Amsterdam'),
      ('amsterdam-zuidoost', 'Diemen'),
      ('amsterdam-zuidoost', 'Amstelveen'),
      -- Basis Amsterdam-Zuidoost: regio Utrecht (voorlopig uitsluitend de gemeente zelf)
      ('amsterdam-zuidoost', 'Utrecht'),
      -- Basis Spijkenisse: regio Rotterdam
      ('spijkenisse', 'Nissewaard'),
      ('spijkenisse', 'Rotterdam'),
      ('spijkenisse', 'Barendrecht'),
      ('spijkenisse', 'Schiedam'),
      ('spijkenisse', 'Vlaardingen'),
      ('spijkenisse', 'Capelle aan den IJssel'),
      ('spijkenisse', 'Voorne aan Zee')
    ) as s(base_slug, gemeente_naam)
  loop
    select id into target_base_id from public.pricing_operational_bases where slug = seed.base_slug and active limit 1;
    if target_base_id is null then
      raise exception
        'pricing_service_areas: standplaats "%" (voor gemeente "%") is geen actieve standplaats — migratie afgebroken',
        seed.base_slug, seed.gemeente_naam;
    end if;

    select * into existing from public.pricing_service_areas where lower(gemeente_naam) = lower(seed.gemeente_naam) and active limit 1;
    if not found then
      insert into public.pricing_service_areas (base_id, gemeente_naam) values (target_base_id, seed.gemeente_naam);
    elsif existing.base_id = target_base_id then
      null; -- identiek: veilige no-op
    else
      raise exception
        'pricing_service_areas: gemeente "%" is al actief gekoppeld aan een ANDERE standplaats (bestaand base_id=%, gewenst base_id=% voor slug "%") — migratie afgebroken',
        seed.gemeente_naam, existing.base_id, target_base_id, seed.base_slug;
    end if;
  end loop;
end $$;

-- ── Aanrijmodel-configuratie ─────────────────────────────────────────────────
-- Exact de door de eigenaar goedgekeurde parameters (2026-08-19, derde
-- bijwerking) — 50% klantaandeel, 0–5km vrij, 5–15km lineaire uitfasering,
-- €25 cap, >40km offerte op aanvraag (verhoogd van 35km — zie de PR-
-- toelichting), €0,65/km + €1,10/min referentie.
do $$
declare
  existing record;
  seed_customer_share_pct numeric(4,3) := 0.500;
  seed_free_km numeric(6,2) := 5;
  seed_full_coverage_km numeric(6,2) := 15;
  seed_max_customer_component_cents integer := 2500;
  seed_max_approach_km numeric(6,2) := 40;
  seed_per_km_cents integer := 65;
  seed_per_min_cents integer := 110;
begin
  select * into existing from public.pricing_approach_fee_config where active limit 1;
  if not found then
    insert into public.pricing_approach_fee_config (
      customer_share_pct, free_km, full_coverage_km,
      max_customer_component_cents, max_approach_km, per_km_cents, per_min_cents
    ) values (
      seed_customer_share_pct, seed_free_km, seed_full_coverage_km,
      seed_max_customer_component_cents, seed_max_approach_km, seed_per_km_cents, seed_per_min_cents
    );
  elsif existing.customer_share_pct = seed_customer_share_pct
    and existing.free_km = seed_free_km
    and existing.full_coverage_km = seed_full_coverage_km
    and existing.max_customer_component_cents = seed_max_customer_component_cents
    and existing.max_approach_km = seed_max_approach_km
    and existing.per_km_cents = seed_per_km_cents
    and existing.per_min_cents = seed_per_min_cents
  then
    null; -- identiek: veilige no-op
  else
    raise exception
      'pricing_approach_fee_config: er bestaat al een actieve configuratie met afwijkende waarden (customer_share_pct=%, free_km=%, full_coverage_km=%, max_customer_component_cents=%, max_approach_km=%, per_km_cents=%, per_min_cents=%) — pas de bestaande rij eerst handmatig aan of deactiveer die, in plaats van de seed te laten overschrijven',
      existing.customer_share_pct, existing.free_km, existing.full_coverage_km,
      existing.max_customer_component_cents, existing.max_approach_km,
      existing.per_km_cents, existing.per_min_cents;
  end if;
end $$;

COMMIT;
