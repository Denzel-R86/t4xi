-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: buitenlandse day_trip-locations toevoegen
-- Datum: 2026-07-06
--
-- Voegt 5 steden + gelijknamige city-locations toe zodat de day_trip-routes in
-- data/pricing/fixed-routes.master.csv valideren (pickup/dropoff moeten bestaan):
--   Antwerpen, Brussel, Brugge (BE) · Düsseldorf, Keulen (DE)
--
-- Alleen locations/cities — geen routes, geen import. Idempotent (on conflict slug).
--
-- NIET AUTOMATISCH TOEGEPAST — eerst review, daarna supabase db push.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Steden (land BE/DE, realistische coördinaten)
insert into public.cities (name, slug, country_code, province, latitude, longitude, active) values
  ('Antwerpen',  'antwerpen',  'BE', 'Antwerpen',                      51.2194000, 4.4025000, true),
  ('Brussel',    'brussel',    'BE', 'Brussels Hoofdstedelijk Gewest', 50.8503000, 4.3517000, true),
  ('Brugge',     'brugge',     'BE', 'West-Vlaanderen',                51.2093000, 3.2247000, true),
  ('Düsseldorf', 'dusseldorf', 'DE', 'Nordrhein-Westfalen',            51.2277000, 6.7735000, true),
  ('Keulen',     'keulen',     'DE', 'Nordrhein-Westfalen',            50.9375000, 6.9603000, true)
on conflict (slug) do update set
  name = excluded.name, country_code = excluded.country_code, province = excluded.province,
  latitude = excluded.latitude, longitude = excluded.longitude, active = true;

-- 2. City-level locations (slug = stad-slug, type 'city')
insert into public.locations (city_id, name, slug, location_type, latitude, longitude, active)
select c.id, c.name, c.slug, 'city', c.latitude, c.longitude, true
from public.cities c
where c.slug in ('antwerpen', 'brussel', 'brugge', 'dusseldorf', 'keulen')
on conflict (slug) do update set
  name = excluded.name, city_id = excluded.city_id, location_type = excluded.location_type,
  latitude = excluded.latitude, longitude = excluded.longitude, active = true;

COMMIT;
