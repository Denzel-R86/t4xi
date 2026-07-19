-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: Zuid-Nederlandse steden + city-locations
-- Datum: 2026-07-19
--
-- Achtergrond (Stap 10c-audit): geen enkele vertrekstad haalde de norm van 3
-- verbindingen naar Zuid-Nederland, omdat Breda, Tilburg, Den Bosch en
-- Roosendaal niet als city bestonden. Eindhoven bestond al en staat hier NIET
-- opnieuw in.
--
-- Coördinaten: PDOK Locatieserver (woonplaats-centroïde), opgehaald 2026-07-19.
-- Deze coördinaten voeden de routeberekening (OSRM) voor afstand en reistijd.
--
-- Arnhem, Nijmegen en Zwolle zijn optioneel en staan uitgecommentarieerd: ze
-- zijn niet nodig voor de Zuid-norm en voegen nu geen commercieel volume toe.
--
-- Alleen cities/locations — GEEN routes, GEEN prijzen. Idempotent.
--
-- NIET AUTOMATISCH TOEGEPAST — eerst review, daarna supabase db push.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Steden
insert into public.cities (name, slug, country_code, province, latitude, longitude, active) values
  ('Breda',            'breda',       'NL', 'Noord-Brabant', 51.5803579, 4.7555726, true),
  ('Tilburg',          'tilburg',     'NL', 'Noord-Brabant', 51.5727491, 5.0452969, true),
  ('''s-Hertogenbosch','den-bosch',   'NL', 'Noord-Brabant', 51.7099749, 5.2957106, true),
  ('Roosendaal',       'roosendaal',  'NL', 'Noord-Brabant', 51.5292592, 4.4586974, true)
  -- Optioneel, nu bewust niet aangezet:
  -- ('Arnhem',        'arnhem',      'NL', 'Gelderland',    52.0011372, 5.8925925, true),
  -- ('Nijmegen',      'nijmegen',    'NL', 'Gelderland',    51.8348197, 5.8332052, true),
  -- ('Zwolle',        'zwolle',      'NL', 'Overijssel',    52.5186857, 6.1183636, true)
on conflict (slug) do update set
  name = excluded.name, country_code = excluded.country_code, province = excluded.province,
  latitude = excluded.latitude, longitude = excluded.longitude, active = true;

-- 2. City-level locations (slug = stad-slug, type 'city')
--    Nodig omdat de import-engine alleen ACTIEVE locations matcht op slug.
insert into public.locations (city_id, name, slug, location_type, latitude, longitude, active)
select c.id, c.name, c.slug, 'city', c.latitude, c.longitude, true
from public.cities c
where c.slug in ('breda', 'tilburg', 'den-bosch', 'roosendaal')
on conflict (slug) do update set
  name = excluded.name, city_id = excluded.city_id, location_type = excluded.location_type,
  latitude = excluded.latitude, longitude = excluded.longitude, active = true;

COMMIT;
