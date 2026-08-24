-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: Spijkenisse — 6 hoofdwijken → Schiphol + vliegvelden + intercity
-- Datum: 2026-08-24
--
-- Volgt op 20260824120000 (stad + Spijkenisse→Schiphol €135). Breidt Spijkenisse
-- (tweede standplaats) uit tot een volwaardig knooppunt, conform de Rotterdam-
-- systematiek (retour = enkel × 1,8; intercity ≈ €24 basis + €1,35/km).
--
-- Toegevoegd:
--   A) 6 hoofdwijk-locations + wijk→Schiphol prijzen (verschijnen op de kaart).
--   B) Andere vliegvelden vanaf Spijkenisse: Rotterdam The Hague Airport,
--      Eindhoven Airport, + NIEUWE airport-locations Antwerpen en Brussel-Zaventem.
--   C) Intercity: Rotterdam, Den Haag, Utrecht, Amsterdam, Eindhoven.
--
-- Afstanden zijn schattingen (eigenaar akkoord: "gebruik mijn schattingen",
-- 2026-08-24); klant-zichtbaar en per route later bij te stellen. Prijzen zijn
-- afgeleid van de bestaande Rotterdam-tarieven, afgerond, retour = enkel × 1,8.
--
-- Idempotent (on conflict). NIET AUTOMATISCH — eerst staging, dan prod op sein.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── A) 6 hoofdwijk-locations (district, gekoppeld aan stad Spijkenisse) ────────
--    Coördinaten = stadscentroïde (compacte stad); de vaste prijs draagt zelf de
--    autoritatieve afstand, dus wijk-coördinaten zijn niet kritisch.
insert into public.locations (city_id, name, slug, location_type, latitude, longitude, active)
select c.id, v.name, v.slug, 'district', 51.8459, 4.3294, true
from public.cities c
cross join (values
  ('Spijkenisse Centrum', 'spijkenisse-centrum'),
  ('Sterrenkwartier',     'spijkenisse-sterrenkwartier'),
  ('De Akkers',           'spijkenisse-de-akkers'),
  ('Maaswijk',            'spijkenisse-maaswijk'),
  ('Groenewoud',          'spijkenisse-groenewoud'),
  ('Hoogwerf',            'spijkenisse-hoogwerf')
) as v(name, slug)
where c.slug = 'spijkenisse'
on conflict (slug) do update set
  name = excluded.name, city_id = excluded.city_id,
  location_type = excluded.location_type, active = true;

-- ── B) Airport-locations garanderen (env-onafhankelijk). Eindhoven Airport
--    bestaat op prod maar niet op staging; de Belgische zijn nieuw. On-conflict
--    maakt dit idempotent op elke omgeving.
insert into public.locations (city_id, name, slug, location_type, latitude, longitude, active)
select c.id, v.name, v.slug, 'airport', v.lat, v.lon, true
from (values
  ('Eindhoven Airport', 'eindhoven-airport', 'eindhoven', 51.4582207, 5.3919407),
  ('Antwerp Airport',   'antwerp-airport',   'antwerpen', 51.1894,    4.4603),
  ('Brussels Airport',  'brussels-airport',  'brussel',   50.9014,    4.4844)
) as v(name, slug, city_slug, lat, lon)
join public.cities c on c.slug = v.city_slug
on conflict (slug) do update set
  name = excluded.name, city_id = excluded.city_id, location_type = 'airport',
  latitude = excluded.latitude, longitude = excluded.longitude, active = true;

-- ── C) Vaste prijzen (Executive EV) ───────────────────────────────────────────
--    Idempotent op de unieke routesleutel (pickup, dropoff, vehicle_class).
with v(pickup_slug, dropoff_slug, service_type, price, return_price, distance_km, duration, label) as (
  values
    -- 6 hoofdwijken → Schiphol
    ('spijkenisse-centrum',         'schiphol-airport', 'airport',   135, 243, 70, 56, 'Spijkenisse Centrum → Schiphol'),
    ('spijkenisse-sterrenkwartier', 'schiphol-airport', 'airport',   133, 239, 69, 55, 'Sterrenkwartier → Schiphol'),
    ('spijkenisse-de-akkers',       'schiphol-airport', 'airport',   137, 247, 72, 58, 'De Akkers → Schiphol'),
    ('spijkenisse-maaswijk',        'schiphol-airport', 'airport',   136, 245, 71, 57, 'Maaswijk → Schiphol'),
    ('spijkenisse-groenewoud',      'schiphol-airport', 'airport',   133, 239, 69, 55, 'Groenewoud → Schiphol'),
    ('spijkenisse-hoogwerf',        'schiphol-airport', 'airport',   135, 243, 70, 56, 'Hoogwerf → Schiphol'),
    -- Andere vliegvelden (vanaf Spijkenisse stad)
    ('spijkenisse', 'rotterdam-airport', 'airport',    69, 124,  32, 28, 'Spijkenisse → Rotterdam The Hague Airport'),
    ('spijkenisse', 'eindhoven-airport', 'airport',   169, 304, 105, 70, 'Spijkenisse → Eindhoven Airport'),
    ('spijkenisse', 'antwerp-airport',   'airport',   149, 268,  90, 65, 'Spijkenisse → Antwerp Airport'),
    ('spijkenisse', 'brussels-airport',  'airport',   209, 376, 135, 95, 'Spijkenisse → Brussels Airport'),
    -- Intercity
    ('spijkenisse', 'rotterdam', 'intercity',  50,  90, 22, 25, 'Spijkenisse → Rotterdam'),
    ('spijkenisse', 'den-haag',  'intercity',  75, 135, 38, 35, 'Spijkenisse → Den Haag'),
    ('spijkenisse', 'utrecht',   'intercity', 139, 250, 85, 60, 'Spijkenisse → Utrecht'),
    ('spijkenisse', 'amsterdam', 'intercity', 145, 261, 88, 65, 'Spijkenisse → Amsterdam'),
    ('spijkenisse', 'eindhoven', 'intercity', 165, 297, 105, 75, 'Spijkenisse → Eindhoven')
)
insert into public.fixed_route_prices
  (pickup_location_id, dropoff_location_id, vehicle_class_id, service_type,
   price, return_price, distance_km, estimated_duration_min, source_label, active)
select p.id, d.id, vc.id, v.service_type, v.price, v.return_price,
       v.distance_km, v.duration, v.label, true
from v
join public.locations p on p.slug = v.pickup_slug
join public.locations d on d.slug = v.dropoff_slug
cross join (select id from public.vehicle_classes where code = 'executive-ev') vc
on conflict (pickup_location_id, dropoff_location_id, vehicle_class_id) do update set
  service_type = excluded.service_type, price = excluded.price,
  return_price = excluded.return_price, distance_km = excluded.distance_km,
  estimated_duration_min = excluded.estimated_duration_min,
  source_label = excluded.source_label, active = true;

COMMIT;
