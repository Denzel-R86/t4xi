-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: Spijkenisse (tweede standplaats) + vaste route Spijkenisse → Schiphol
-- Datum: 2026-08-24
--
-- Achtergrond: Spijkenisse is de tweede vaste standplaats van T4XI (naast Almere)
-- en kreeg een SEO-landingspagina (taxi-spijkenisse-schiphol). De tarievenkaart
-- op die pagina leest live uit fixed_route_prices; zonder route toonde de pagina
-- alleen de lege staat. Deze migratie zet de stad, de city-location en de vaste
-- luchthavenprijs.
--
-- Prijs: €135 enkel / €243 retour (retour = enkel × 1,8, conform de bestaande
-- stad-kopregels). Bewuste premie boven de Rotterdam-kop (€119 @ 61 km) voor de
-- ~70 km / ~58 min vanaf Voorne-Putten (tweede standplaats, perifeer, aanrij vanaf
-- basis). Afstand + prijs zijn eigenaarsbesluit 2026-08-24.
--
-- Afwijking van de normale werkwijze: vaste prijzen komen doorgaans via de
-- CSV-import (scripts/import-fixed-routes.ts). data/pricing/fixed-routes.master.csv
-- is echter gedrift t.o.v. productie (afstanden/prijzen wijken af), dus die CSV is
-- hier niet leidend. Deze ene route wordt daarom rechtstreeks en idempotent
-- geseed. Coördinaten: PDOK Locatieserver (woonplaats-centroïde Spijkenisse).
--
-- Idempotent: veilig meermaals toe te passen (staging én productie).
-- NIET AUTOMATISCH TOEGEPAST — eerst staging, daarna productie op eigenaarssein.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Stad
insert into public.cities (name, slug, country_code, province, latitude, longitude, active) values
  ('Spijkenisse', 'spijkenisse', 'NL', 'Zuid-Holland', 51.8459, 4.3294, true)
on conflict (slug) do update set
  name = excluded.name, country_code = excluded.country_code, province = excluded.province,
  latitude = excluded.latitude, longitude = excluded.longitude, active = true;

-- 2. City-level location (slug = stad-slug, type 'city').
--    Nodig omdat de rate-card en de import-engine op ACTIEVE locations matchen.
insert into public.locations (city_id, name, slug, location_type, latitude, longitude, active)
select c.id, c.name, c.slug, 'city', c.latitude, c.longitude, true
from public.cities c
where c.slug = 'spijkenisse'
on conflict (slug) do update set
  name = excluded.name, city_id = excluded.city_id, location_type = excluded.location_type,
  latitude = excluded.latitude, longitude = excluded.longitude, active = true;

-- 3. Vaste route Spijkenisse → Schiphol (Executive EV, airport).
--    Idempotent op de unieke routesleutel (pickup, dropoff, vehicle_class) uit
--    migratie 20260719120000_unique_route_key.sql.
insert into public.fixed_route_prices
  (pickup_location_id, dropoff_location_id, vehicle_class_id, service_type,
   price, return_price, distance_km, estimated_duration_min, source_label, active)
select p.id, d.id, v.id, 'airport', 135, 243, 70, 58, 'Spijkenisse → Schiphol', true
from public.locations p, public.locations d, public.vehicle_classes v
where p.slug = 'spijkenisse' and d.slug = 'schiphol-airport' and v.code = 'executive-ev'
on conflict (pickup_location_id, dropoff_location_id, vehicle_class_id) do update set
  service_type = excluded.service_type, price = excluded.price,
  return_price = excluded.return_price, distance_km = excluded.distance_km,
  estimated_duration_min = excluded.estimated_duration_min,
  source_label = excluded.source_label, active = true;

COMMIT;
