-- Canonieke prijsbaseline voor vaste routes.
--
-- WAAROM DEZE MIGRATIE BESTAAT. Productie draagt 89 vaste-routetarieven; een verse
-- installatie van de migratieketen leverde er 47. Het verschil was niet zichtbaar
-- in versiebeheer, om twee redenen die beide in de keten zelf staan:
--
--   1. `20260719121000_add_south_nl_cities` en `20260719122000_add_rotterdam_den_haag_districts`
--      zeggen expliciet "Alleen locations — GEEN routes, GEEN prijzen". De locaties
--      zijn dus wel gemigreerd, de bijbehorende tarieven niet. Die zijn daarna
--      rechtstreeks op productie gezet: 12 stadsdeelroutes en 30 intercityroutes.
--   2. De drie migraties van 2026-09-25 corrigeerden zeven tarieven, maar deden dat
--      op hard-coded `fixed_route_prices.id`. Omdat `20260705230000_pricing_engine_integrated`
--      die id's met `gen_random_uuid()` aanmaakt, zijn ze per installatie anders en
--      raken die migraties buiten productie nul rijen.
--
-- Het gevolg was dat de prijsstate van productie niet reproduceerbaar was uit Git.
-- Deze migratie herstelt dat. Ze legt geen nieuw tarief vast: elk bedrag hieronder is
-- exact wat productie op 2026-09-28 draait, read-only uitgelezen en geverifieerd via
-- een business-fingerprint (33f15a3daf68e071ad363791ea529c68).
--
-- BUSINESS IDENTITEIT. Rijen worden geïdentificeerd op
--   (pickup locations.slug, dropoff locations.slug, vehicle_classes.code)
-- Alle drie zijn UNIQUE en identiek tussen omgevingen. De onderliggende
-- `unique (pickup_location_id, dropoff_location_id, vehicle_class_id)` bestond al en
-- wordt hier als conflictdoel gebruikt; er komt geen nieuwe sleutelkolom bij.
-- `fixed_route_prices.id` blijft een technische PK en mag per omgeving verschillen —
-- hij komt in deze migratie nergens voor, en hoort in geen enkele toekomstige
-- prijsmigratie voor te komen.
--
-- IDEMPOTENT. Tweemaal draaien verandert niets: de `on conflict`-tak schrijft alleen
-- wanneer een prijsveld werkelijk afwijkt. Op productie is deze migratie
-- business-semantisch een no-op.
begin;

create temporary table _canonical_pricing (
  pickup_slug text, dropoff_slug text, vclass_code text,
  price numeric, return_price numeric, active boolean, service_type text,
  distance_km numeric, duration_min integer
) on commit drop;

insert into _canonical_pricing values
  ('almere','amsterdam','executive-ev',75.00,135.00,true,'intercity',35.00,43),
  ('almere','breda','executive-ev',175.00,315.00,false,'intercity',109.00,101),
  ('almere','den-bosch','executive-ev',145.00,261.00,false,'intercity',87.00,83),
  ('almere','den-haag','executive-ev',149.00,268.00,false,'intercity',90.00,86),
  ('almere','eindhoven','executive-ev',195.00,351.00,false,'intercity',121.00,111),
  ('almere','rotterdam','executive-ev',165.00,297.00,false,'intercity',100.00,93),
  ('almere','tilburg','executive-ev',185.00,333.00,false,'intercity',116.00,105),
  ('almere','utrecht','executive-ev',79.00,142.00,true,'intercity',39.00,48),
  ('almere-buiten','schiphol-airport','executive-ev',114.00,205.00,true,'airport',51.00,47),
  ('almere-haven','schiphol-airport','executive-ev',106.00,191.00,true,'airport',45.00,43),
  ('almere-hout','schiphol-airport','executive-ev',113.00,203.00,true,'airport',49.00,45),
  ('almere-muziekwijk','schiphol-airport','executive-ev',105.00,189.00,true,'airport',43.00,41),
  ('almere-oostvaarders','schiphol-airport','executive-ev',116.00,209.00,true,'airport',52.00,49),
  ('almere-poort','schiphol-airport','executive-ev',102.00,184.00,true,'airport',39.00,38),
  ('almere-stad-centrum','schiphol-airport','executive-ev',106.00,191.00,true,'airport',45.00,46),
  ('amsterdam','almere','executive-ev',75.00,135.00,false,'intercity',34.00,42),
  ('amsterdam','breda','executive-ev',165.00,297.00,false,'intercity',108.00,89),
  ('amsterdam','den-bosch','executive-ev',135.00,243.00,false,'intercity',87.00,71),
  ('amsterdam','den-haag','executive-ev',105.00,189.00,true,'intercity',64.00,56),
  ('amsterdam','eindhoven','executive-ev',185.00,333.00,true,'intercity',121.00,99),
  ('amsterdam','rotterdam','executive-ev',129.00,232.00,true,'intercity',80.00,70),
  ('amsterdam','rotterdam-airport','executive-ev',119.00,214.00,true,'airport',73.00,58),
  ('amsterdam','schiphol-airport','executive-ev',65.00,117.00,true,'airport',24.00,27),
  ('amsterdam','tilburg','executive-ev',175.00,315.00,false,'intercity',115.00,93),
  ('amsterdam','utrecht','executive-ev',85.00,153.00,true,'intercity',45.00,45),
  ('amsterdam-centrum','schiphol-airport','executive-ev',61.00,110.00,true,'airport',26.00,31),
  ('amsterdam-noord','schiphol-airport','executive-ev',65.00,117.00,true,'airport',30.00,29),
  ('amsterdam-oost','schiphol-airport','executive-ev',60.00,108.00,true,'airport',24.00,29),
  ('amsterdam-oud-zuid-de-pijp','schiphol-airport','executive-ev',55.00,99.00,true,'airport',17.00,23),
  ('amsterdam-zuidas','schiphol-airport','executive-ev',50.00,90.00,true,'airport',17.00,20),
  ('amsterdam-zuidoost-bijlmer','schiphol-airport','executive-ev',60.00,108.00,true,'airport',23.00,25),
  ('de-uithof-science-park','schiphol-airport','executive-ev',117.00,211.00,true,'airport',56.00,52),
  ('den-haag','almere','executive-ev',149.00,268.00,false,'intercity',90.00,85),
  ('den-haag','amsterdam','executive-ev',105.00,189.00,false,'intercity',65.00,56),
  ('den-haag','breda','executive-ev',119.00,214.00,false,'intercity',75.00,63),
  ('den-haag','den-bosch','executive-ev',159.00,286.00,false,'intercity',105.00,85),
  ('den-haag','eindhoven','executive-ev',205.00,369.00,false,'intercity',136.00,110),
  ('den-haag','rotterdam','executive-ev',55.00,99.00,false,'intercity',25.00,29),
  ('den-haag','schiphol-airport','executive-ev',114.00,205.00,true,'airport',48.00,45),
  ('den-haag','tilburg','executive-ev',159.00,286.00,false,'intercity',105.00,86),
  ('den-haag','utrecht','executive-ev',115.00,207.00,false,'intercity',69.00,62),
  ('den-haag-benoordenhout','schiphol-airport','executive-ev',105.00,189.00,true,'airport',44.00,43),
  ('den-haag-centrum','schiphol-airport','executive-ev',110.00,198.00,true,'airport',49.00,46),
  ('den-haag-loosduinen','schiphol-airport','executive-ev',114.00,205.00,true,'airport',53.00,53),
  ('den-haag-scheveningen','schiphol-airport','executive-ev',112.00,202.00,true,'airport',51.00,49),
  ('den-haag-statenkwartier','schiphol-airport','executive-ev',111.00,200.00,true,'airport',50.00,47),
  ('den-haag-ypenburg','schiphol-airport','executive-ev',105.00,189.00,true,'airport',44.00,43),
  ('leidsche-rijn','schiphol-airport','executive-ev',104.00,187.00,true,'airport',45.00,42),
  ('rotterdam','almere','executive-ev',165.00,297.00,false,'intercity',98.00,90),
  ('rotterdam','amsterdam','executive-ev',129.00,232.00,true,'intercity',78.00,65),
  ('rotterdam','breda','executive-ev',85.00,153.00,false,'intercity',50.00,43),
  ('rotterdam','den-bosch','executive-ev',125.00,225.00,false,'intercity',78.00,65),
  ('rotterdam','den-haag','executive-ev',55.00,99.00,true,'intercity',23.00,25),
  ('rotterdam','eindhoven','executive-ev',165.00,297.00,false,'intercity',110.00,90),
  ('rotterdam','rotterdam-airport','executive-ev',39.00,70.00,true,'airport',7.00,9),
  ('rotterdam','schiphol-airport','executive-ev',119.00,214.00,true,'airport',61.00,54),
  ('rotterdam','tilburg','executive-ev',125.00,225.00,false,'intercity',79.00,66),
  ('rotterdam','utrecht','executive-ev',105.00,189.00,true,'intercity',62.00,55),
  ('rotterdam-blijdorp','schiphol-airport','executive-ev',105.00,189.00,true,'airport',59.00,52),
  ('rotterdam-centrum','schiphol-airport','executive-ev',109.00,196.00,true,'airport',62.00,57),
  ('rotterdam-delfshaven','schiphol-airport','executive-ev',109.00,196.00,true,'airport',62.00,56),
  ('rotterdam-hillegersberg','schiphol-airport','executive-ev',105.00,189.00,true,'airport',61.00,53),
  ('rotterdam-kralingen','schiphol-airport','executive-ev',115.00,207.00,true,'airport',69.00,58),
  ('rotterdam-prins-alexander','schiphol-airport','executive-ev',119.00,214.00,true,'airport',69.00,59),
  ('spijkenisse','amsterdam','executive-ev',145.00,261.00,true,'intercity',88.00,65),
  ('spijkenisse','antwerp-airport','executive-ev',149.00,268.00,true,'airport',90.00,65),
  ('spijkenisse','brussels-airport','executive-ev',209.00,376.00,true,'airport',135.00,95),
  ('spijkenisse','den-haag','executive-ev',75.00,135.00,true,'intercity',38.00,35),
  ('spijkenisse','eindhoven','executive-ev',165.00,297.00,true,'intercity',105.00,75),
  ('spijkenisse','eindhoven-airport','executive-ev',169.00,304.00,true,'airport',105.00,70),
  ('spijkenisse','rotterdam','executive-ev',50.00,90.00,true,'intercity',22.00,25),
  ('spijkenisse','rotterdam-airport','executive-ev',69.00,124.00,true,'airport',32.00,28),
  ('spijkenisse','schiphol-airport','executive-ev',137.00,247.00,true,'airport',70.00,58),
  ('spijkenisse','utrecht','executive-ev',139.00,250.00,true,'intercity',85.00,60),
  ('spijkenisse-centrum','schiphol-airport','executive-ev',135.00,243.00,true,'airport',70.00,56),
  ('spijkenisse-de-akkers','schiphol-airport','executive-ev',137.00,247.00,true,'airport',72.00,58),
  ('spijkenisse-groenewoud','schiphol-airport','executive-ev',133.00,239.00,true,'airport',69.00,55),
  ('spijkenisse-hoogwerf','schiphol-airport','executive-ev',135.00,243.00,true,'airport',70.00,56),
  ('spijkenisse-maaswijk','schiphol-airport','executive-ev',136.00,245.00,true,'airport',71.00,57),
  ('spijkenisse-sterrenkwartier','schiphol-airport','executive-ev',133.00,239.00,true,'airport',69.00,55),
  ('utrecht','almere','executive-ev',79.00,142.00,false,'intercity',40.00,48),
  ('utrecht','amsterdam','executive-ev',85.00,153.00,true,'intercity',44.00,44),
  ('utrecht','breda','executive-ev',119.00,214.00,false,'intercity',75.00,66),
  ('utrecht','den-bosch','executive-ev',89.00,160.00,false,'intercity',54.00,48),
  ('utrecht','den-haag','executive-ev',115.00,207.00,false,'intercity',67.00,61),
  ('utrecht','eindhoven','executive-ev',139.00,250.00,false,'intercity',88.00,76),
  ('utrecht','rotterdam','executive-ev',105.00,189.00,false,'intercity',62.00,57),
  ('utrecht','tilburg','executive-ev',129.00,232.00,false,'intercity',82.00,70),
  ('utrecht-centrum','schiphol-airport','executive-ev',110.00,198.00,true,'airport',51.00,49);

-- GUARD 1 — onbekende verwijzing. Een slug of code die niet bestaat betekent dat de
-- locatieketen en deze baseline uit elkaar gelopen zijn. Dan stoppen we, want stil
-- overslaan zou precies de onzichtbare drift opleveren die deze migratie opheft.
do $$
declare ontbrekend int;
begin
  select count(*) into ontbrekend
    from _canonical_pricing w
   where not exists (select 1 from public.locations l where l.slug = w.pickup_slug)
      or not exists (select 1 from public.locations l where l.slug = w.dropoff_slug)
      or not exists (select 1 from public.vehicle_classes v where v.code = w.vclass_code);
  if ontbrekend > 0 then
    raise exception 'pricing_canonical_unknown_reference: % canonieke rijen verwijzen naar een onbekende slug of vehicle-class code', ontbrekend
      using errcode = '23503';
  end if;
end $$;

-- GUARD 2 — onverwachte extra routes. Rijen die wel in de database staan maar niet in
-- deze canonieke set worden NIET verwijderd en NIET overschreven; ze worden gemeld.
-- Onbekende business-state destructief normaliseren is erger dan hem laten staan.
do $$
declare extra int;
begin
  select count(*) into extra
    from public.fixed_route_prices f
    join public.locations p on p.id = f.pickup_location_id
    join public.locations d on d.id = f.dropoff_location_id
    join public.vehicle_classes v on v.id = f.vehicle_class_id
   where not exists (
     select 1 from _canonical_pricing w
      where w.pickup_slug = p.slug and w.dropoff_slug = d.slug and w.vclass_code = v.code);
  if extra > 0 then
    raise warning 'pricing_canonical_extra_rows: % bestaande routes staan niet in de canonieke set en zijn onaangeroerd gelaten', extra;
  end if;
end $$;

-- Upsert op de natural key, met environment-lokale UUID-resolutie via de slugs.
insert into public.fixed_route_prices
  (pickup_location_id, dropoff_location_id, vehicle_class_id,
   price, return_price, active, service_type, distance_km, estimated_duration_min,
   vat_rate, currency, valid_from)
select p.id, d.id, v.id,
       w.price, w.return_price, w.active, w.service_type, w.distance_km, w.duration_min,
       9, 'EUR', timestamptz '2026-07-05 00:00:00+00'
from _canonical_pricing w
join public.locations p on p.slug = w.pickup_slug
join public.locations d on d.slug = w.dropoff_slug
join public.vehicle_classes v on v.code = w.vclass_code
on conflict (pickup_location_id, dropoff_location_id, vehicle_class_id) do update
set price        = excluded.price,
    return_price = excluded.return_price,
    active       = excluded.active,
    service_type = excluded.service_type,
    updated_at   = now()
where fixed_route_prices.price        is distinct from excluded.price
   or fixed_route_prices.return_price is distinct from excluded.return_price
   or fixed_route_prices.active       is distinct from excluded.active
   or fixed_route_prices.service_type is distinct from excluded.service_type;

comment on index fixed_route_prices_route_key is
  'Business key voor vaste routes. Prijsmigraties identificeren rijen via locations.slug + vehicle_classes.code en resolven daarmee naar deze drie kolommen; nooit via fixed_route_prices.id, dat per omgeving verschilt.';

commit;
