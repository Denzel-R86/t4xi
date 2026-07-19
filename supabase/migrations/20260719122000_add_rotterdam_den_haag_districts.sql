-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: stadsdelen voor Rotterdam en Den Haag
-- Datum: 2026-07-19
--
-- Achtergrond (Stap 10c-audit): Amsterdam heeft 7 locations en Almere 8, maar
-- Rotterdam had er 2 (waarvan één de luchthaven) en Den Haag 1. Daardoor kan de
-- tarievenpagina voor deze twee steden nooit dezelfde diepte halen, en kan
-- adres-autocomplete geen wijk-specifieke vaste prijs vinden.
--
-- Conventie gevolgd van de bestaande stadsdelen (Amsterdam/Almere/Utrecht):
-- location_type = 'district', geen coördinaten. De bestaande districts hebben
-- die ook niet — routeafstanden worden op stadsniveau bepaald.
--
-- Alleen locations — GEEN routes, GEEN prijzen. Idempotent.
--
-- LET OP: hierna bestaan er stadsdelen zónder route naar Schiphol. De
-- tarievenpagina toont alleen routes die in fixed_route_prices staan, dus dit
-- is zichtbaar noch brekend — maar de airport-routes per wijk moeten in een
-- volgende stap alsnog berekend en geïmporteerd worden.
--
-- NIET AUTOMATISCH TOEGEPAST — eerst review, daarna supabase db push.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Rotterdam
insert into public.locations (city_id, name, slug, location_type, active)
select c.id, v.name, v.slug, 'district', true
from public.cities c
cross join (values
  ('Rotterdam Centrum',          'rotterdam-centrum'),
  ('Kralingen',                  'rotterdam-kralingen'),
  ('Hillegersberg',              'rotterdam-hillegersberg'),
  ('Blijdorp',                   'rotterdam-blijdorp'),
  ('Delfshaven',                 'rotterdam-delfshaven'),
  ('Prins Alexander',            'rotterdam-prins-alexander')
) as v(name, slug)
where c.slug = 'rotterdam'
on conflict (slug) do update set
  name = excluded.name, city_id = excluded.city_id,
  location_type = excluded.location_type, active = true;

-- Den Haag
insert into public.locations (city_id, name, slug, location_type, active)
select c.id, v.name, v.slug, 'district', true
from public.cities c
cross join (values
  ('Den Haag Centrum',           'den-haag-centrum'),
  ('Scheveningen',               'den-haag-scheveningen'),
  ('Benoordenhout',              'den-haag-benoordenhout'),
  ('Statenkwartier',             'den-haag-statenkwartier'),
  ('Ypenburg',                   'den-haag-ypenburg'),
  ('Loosduinen',                 'den-haag-loosduinen')
) as v(name, slug)
where c.slug = 'den-haag'
on conflict (slug) do update set
  name = excluded.name, city_id = excluded.city_id,
  location_type = excluded.location_type, active = true;

COMMIT;
