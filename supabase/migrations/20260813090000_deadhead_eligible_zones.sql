-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: expliciete allowlist van deadhead-eligible economische zones
-- Datum: 2026-08-13
--
-- HOTFIX voor productiebug: sinds PR #15 (merge a95cf8d0) is `classification:
-- 'peripheral'` alleen al voldoende om deadhead te activeren — elke bestaande,
-- herkenbare stad >80 km buiten de high-demand-lijst (bv. kaal "Eindhoven")
-- kreeg zo ongewild dezelfde toeslag als de twee goedgekeurde bestemmingen.
-- Deze migratie voegt een DATAGEDREVEN, server-side allowlist toe;
-- lib/pricing/service.ts vereist voortaan `classification==='peripheral' EN
-- dropoff.city_id ∈ deze allowlist` vóór activering. Bevat GEEN wijziging aan
-- de deadhead-formule/-config, GEEN wijziging aan migratie 20260812120000.
--
-- Zelfde beveiligingspatroon als pricing_high_demand_zones (RLS aan, geen
-- publieke policy, uitsluitend service_role, partial unique index per
-- actieve stad/locatie).
--
-- NIET AUTOMATISCH TOEGEPAST — eerst review door owner, daarna pas:
--   supabase db push   (of via MCP apply_migration)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

create table if not exists public.pricing_deadhead_eligible_zones (
  id uuid primary key default gen_random_uuid(),
  city_id uuid references public.cities(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  label text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint pricing_deadhead_eligible_zones_key_check
    check ((city_id is not null) <> (location_id is not null))
);

-- Database-side afgedwongen: dezelfde stad, resp. dezelfde locatie, mag niet
-- twee keer actief als eligible zone geconfigureerd staan.
create unique index if not exists pricing_deadhead_eligible_zones_city_active_unique
  on public.pricing_deadhead_eligible_zones (city_id)
  where active and city_id is not null;

create unique index if not exists pricing_deadhead_eligible_zones_location_active_unique
  on public.pricing_deadhead_eligible_zones (location_id)
  where active and location_id is not null;

create index if not exists pricing_deadhead_eligible_zones_city_id_idx
  on public.pricing_deadhead_eligible_zones(city_id);
create index if not exists pricing_deadhead_eligible_zones_location_id_idx
  on public.pricing_deadhead_eligible_zones(location_id);

-- RLS: zelfde patroon als de overige pricing-tabellen — GEEN anon/authenticated
-- policy (deny-by-default) → uitsluitend service_role.
alter table public.pricing_deadhead_eligible_zones enable row level security;

-- ─────────────────────────────────────────────────────────────────────────
-- Seed: UITSLUITEND Eindhoven en Roermond. Geen andere stad of locatie.
-- ─────────────────────────────────────────────────────────────────────────

insert into public.pricing_deadhead_eligible_zones (city_id, label)
select c.id, c.name
from public.cities c
where c.slug in ('eindhoven', 'roermond')
on conflict do nothing;

COMMIT;
