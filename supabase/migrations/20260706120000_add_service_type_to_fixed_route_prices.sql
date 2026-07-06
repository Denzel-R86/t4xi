-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: service_type persistent maken op public.fixed_route_prices
-- Datum: 2026-07-06
--
-- Voegt een service_type-kolom toe zodat routes gefilterd kunnen worden op
-- categorie (airport, intercity, day_trip, hotel_transfer, business_transfer,
-- vip_transfer, hourly_chauffeur). Classificeert de bestaande 31 routes:
--   * route met een luchthaven-eindpunt → 'airport'
--   * overige (stad ↔ stad)             → 'intercity'
--   * day_trip: nog geen rijen in fixed_route_prices (dagtochten volgen later)
--
-- Idempotent: add column if not exists, drop+add constraint, index if not exists,
-- en een update die alleen de default-'airport'-rijen zonder luchthaven herclassificeert.
--
-- NIET AUTOMATISCH TOEGEPAST — eerst review, daarna supabase db push.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Kolom (bestaande rijen krijgen de default 'airport')
alter table public.fixed_route_prices
  add column if not exists service_type text not null default 'airport';

-- 2. Check constraint met de toegestane waarden (drop-then-add voor idempotentie)
alter table public.fixed_route_prices
  drop constraint if exists fixed_route_prices_service_type_check;
alter table public.fixed_route_prices
  add constraint fixed_route_prices_service_type_check
  check (service_type in (
    'airport',
    'intercity',
    'day_trip',
    'hotel_transfer',
    'business_transfer',
    'vip_transfer',
    'hourly_chauffeur'
  ));

-- 3. Index voor filteren op service_type
create index if not exists fixed_route_prices_service_type_idx
  on public.fixed_route_prices(service_type);

-- 4. Bestaande routes classificeren:
--    intercity = geen enkel eindpunt is een luchthaven-locatie.
--    (airport-routes houden de default 'airport'; day_trip = 0 rijen nu.)
update public.fixed_route_prices f
set service_type = 'intercity'
where service_type = 'airport'
  and not exists (
    select 1
    from public.locations l
    where l.id in (f.pickup_location_id, f.dropoff_location_id)
      and l.location_type = 'airport'
  );

COMMIT;
