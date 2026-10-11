-- ═══════════════════════════════════════════════════════════════════════════
-- Canonieke prijsbaseline v2 — verwachte routestatus NA de spiegeling
-- Datum: 2026-10-10
--
-- WAAROM. `20260928120000_pricing_canonical_baseline` (v1) legde de
-- productiestaat van 28-09 vast: 89 rijen, 59 actief en 30 inactief. Die
-- baseline is door de spiegeling achterhaald. Zou v1 ná de spiegeling nogmaals
-- draaien, dan zette hij de vijf geheractiveerde tegenrichtingen weer op
-- inactief en meldde hij de 48 nieuwe rijen als "extra rows". v2 legt daarom de
-- NIEUWE verwachte eindstaat vast.
--
-- VERSCHIL MET v1 — v2 is een VERIFIER, geen upsert. v1 schreef waarden weg;
-- v2 controleert uitsluitend en faalt bij iedere prijs- of activatieafwijking.
-- Dat past bij zijn rol: hij draait ná de spiegeling en hoort niets meer te
-- hoeven corrigeren. Daarmee kan deze migratie per definitie geen prijs
-- stilzwijgend overschrijven.
--
-- VERWACHTE EINDSTAAT: 137 rijen = 89 (v1) + 48 nieuwe tegenrichtingen.
--   112 actief   (59 bestaand + 48 nieuw + 5 geheractiveerd)
--    25 inactief (30 uit v1 minus de 5 geheractiveerde)
--
-- De 53 tegenrichtingen uit 20261010120500 staan hieronder expliciet
-- gemarkeerd: 48 met `-- nieuw`, 5 met `-- geheractiveerd`.
--
-- UITGESLOTEN. Antwerp Airport en Brussels Airport komen NIET voor als
-- vertrekpunt; die twee routes blijven bewust "Offerte op aanvraag" wegens
-- onvoldoende kostendata voor grensoverschrijdende opstelkosten. Guard 4
-- hieronder bewijst dat.
--
-- NIET DESTRUCTIEF. Er wordt niets verwijderd en niets gedeactiveerd. Rijen die
-- niet in deze canonieke set staan worden gemeld met een waarschuwing en
-- ongemoeid gelaten — onbekende business-state destructief normaliseren is
-- erger dan hem laten staan (zelfde afweging als v1).
--
-- BUSINESS IDENTITEIT. Rijen worden geïdentificeerd op
--   (pickup locations.slug, dropoff locations.slug, vehicle_classes.code)
-- `fixed_route_prices.id` komt hier nergens voor en hoort in geen enkele
-- prijsmigratie voor te komen; hij verschilt per omgeving.
--
-- HERKOMST. Deze set is deterministisch afgeleid uit het v1-bestand in Git,
-- niet uit een productie-uitlezing: v1-rijen met de vijf heractiveringen op
-- `true`, plus de 48 gespiegelde rijen volgens dezelfde regels als
-- 20261010120500. Daarmee is de verwachte eindstaat reproduceerbaar uit
-- versiebeheer alleen.
--
-- IDEMPOTENT. Puur lezend; tweemaal draaien verandert niets.
--
-- ROLLBACK: niet van toepassing — deze migratie schrijft niets.
--
-- NIET AUTOMATISCH TOEGEPAST — eerst review door de eigenaar.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create temporary table _canonical_pricing_v2 (
  pickup_slug text, dropoff_slug text, vclass_code text,
  price numeric, return_price numeric, active boolean, service_type text,
  distance_km numeric, duration_min integer
) on commit drop;

insert into _canonical_pricing_v2 values
  ('almere-buiten','schiphol-airport','executive-ev',114.00,205.00,true,'airport',51.00,47),
  ('almere-haven','schiphol-airport','executive-ev',106.00,191.00,true,'airport',45.00,43),
  ('almere-hout','schiphol-airport','executive-ev',113.00,203.00,true,'airport',49.00,45),
  ('almere-muziekwijk','schiphol-airport','executive-ev',105.00,189.00,true,'airport',43.00,41),
  ('almere-oostvaarders','schiphol-airport','executive-ev',116.00,209.00,true,'airport',52.00,49),
  ('almere-poort','schiphol-airport','executive-ev',102.00,184.00,true,'airport',39.00,38),
  ('almere-stad-centrum','schiphol-airport','executive-ev',106.00,191.00,true,'airport',45.00,46),
  ('almere','amsterdam','executive-ev',75.00,135.00,true,'intercity',35.00,43),
  ('almere','breda','executive-ev',175.00,315.00,false,'intercity',109.00,101),
  ('almere','den-bosch','executive-ev',145.00,261.00,false,'intercity',87.00,83),
  ('almere','den-haag','executive-ev',149.00,268.00,false,'intercity',90.00,86),
  ('almere','eindhoven','executive-ev',195.00,351.00,false,'intercity',121.00,111),
  ('almere','rotterdam','executive-ev',165.00,297.00,false,'intercity',100.00,93),
  ('almere','tilburg','executive-ev',185.00,333.00,false,'intercity',116.00,105),
  ('almere','utrecht','executive-ev',79.00,142.00,true,'intercity',39.00,48),
  ('amsterdam-centrum','schiphol-airport','executive-ev',61.00,110.00,true,'airport',26.00,31),
  ('amsterdam-noord','schiphol-airport','executive-ev',65.00,117.00,true,'airport',30.00,29),
  ('amsterdam-oost','schiphol-airport','executive-ev',60.00,108.00,true,'airport',24.00,29),
  ('amsterdam-oud-zuid-de-pijp','schiphol-airport','executive-ev',55.00,99.00,true,'airport',17.00,23),
  ('amsterdam-zuidas','schiphol-airport','executive-ev',50.00,90.00,true,'airport',17.00,20),
  ('amsterdam-zuidoost-bijlmer','schiphol-airport','executive-ev',60.00,108.00,true,'airport',23.00,25),
  ('amsterdam','almere','executive-ev',75.00,135.00,true,'intercity',34.00,42),  -- geheractiveerd
  ('amsterdam','breda','executive-ev',165.00,297.00,false,'intercity',108.00,89),
  ('amsterdam','den-bosch','executive-ev',135.00,243.00,false,'intercity',87.00,71),
  ('amsterdam','den-haag','executive-ev',105.00,189.00,true,'intercity',64.00,56),
  ('amsterdam','eindhoven','executive-ev',185.00,333.00,true,'intercity',121.00,99),
  ('amsterdam','rotterdam-airport','executive-ev',119.00,214.00,true,'airport',73.00,58),
  ('amsterdam','rotterdam','executive-ev',129.00,232.00,true,'intercity',80.00,70),
  ('amsterdam','schiphol-airport','executive-ev',65.00,117.00,true,'airport',24.00,27),
  ('amsterdam','spijkenisse','executive-ev',145.00,261.00,true,'intercity',88.00,65),  -- nieuw
  ('amsterdam','tilburg','executive-ev',175.00,315.00,false,'intercity',115.00,93),
  ('amsterdam','utrecht','executive-ev',85.00,153.00,true,'intercity',45.00,45),
  ('de-uithof-science-park','schiphol-airport','executive-ev',117.00,211.00,true,'airport',56.00,52),
  ('den-haag-benoordenhout','schiphol-airport','executive-ev',105.00,189.00,true,'airport',44.00,43),
  ('den-haag-centrum','schiphol-airport','executive-ev',110.00,198.00,true,'airport',49.00,46),
  ('den-haag-loosduinen','schiphol-airport','executive-ev',114.00,205.00,true,'airport',53.00,53),
  ('den-haag-scheveningen','schiphol-airport','executive-ev',112.00,202.00,true,'airport',51.00,49),
  ('den-haag-statenkwartier','schiphol-airport','executive-ev',111.00,200.00,true,'airport',50.00,47),
  ('den-haag-ypenburg','schiphol-airport','executive-ev',105.00,189.00,true,'airport',44.00,43),
  ('den-haag','almere','executive-ev',149.00,268.00,false,'intercity',90.00,85),
  ('den-haag','amsterdam','executive-ev',105.00,189.00,true,'intercity',65.00,56),  -- geheractiveerd
  ('den-haag','breda','executive-ev',119.00,214.00,false,'intercity',75.00,63),
  ('den-haag','den-bosch','executive-ev',159.00,286.00,false,'intercity',105.00,85),
  ('den-haag','eindhoven','executive-ev',205.00,369.00,false,'intercity',136.00,110),
  ('den-haag','rotterdam','executive-ev',55.00,99.00,true,'intercity',25.00,29),  -- geheractiveerd
  ('den-haag','schiphol-airport','executive-ev',114.00,205.00,true,'airport',48.00,45),
  ('den-haag','spijkenisse','executive-ev',75.00,135.00,true,'intercity',38.00,35),  -- nieuw
  ('den-haag','tilburg','executive-ev',159.00,286.00,false,'intercity',105.00,86),
  ('den-haag','utrecht','executive-ev',115.00,207.00,false,'intercity',69.00,62),
  ('eindhoven-airport','spijkenisse','executive-ev',169.00,304.00,true,'airport',105.00,70),  -- nieuw
  ('eindhoven','amsterdam','executive-ev',185.00,333.00,true,'intercity',121.00,99),  -- nieuw
  ('eindhoven','spijkenisse','executive-ev',165.00,297.00,true,'intercity',105.00,75),  -- nieuw
  ('leidsche-rijn','schiphol-airport','executive-ev',104.00,187.00,true,'airport',45.00,42),
  ('rotterdam-airport','amsterdam','executive-ev',119.00,214.00,true,'airport',73.00,58),  -- nieuw
  ('rotterdam-airport','rotterdam','executive-ev',39.00,70.00,true,'airport',7.00,9),  -- nieuw
  ('rotterdam-airport','spijkenisse','executive-ev',69.00,124.00,true,'airport',32.00,28),  -- nieuw
  ('rotterdam-blijdorp','schiphol-airport','executive-ev',105.00,189.00,true,'airport',59.00,52),
  ('rotterdam-centrum','schiphol-airport','executive-ev',109.00,196.00,true,'airport',62.00,57),
  ('rotterdam-delfshaven','schiphol-airport','executive-ev',109.00,196.00,true,'airport',62.00,56),
  ('rotterdam-hillegersberg','schiphol-airport','executive-ev',105.00,189.00,true,'airport',61.00,53),
  ('rotterdam-kralingen','schiphol-airport','executive-ev',115.00,207.00,true,'airport',69.00,58),
  ('rotterdam-prins-alexander','schiphol-airport','executive-ev',119.00,214.00,true,'airport',69.00,59),
  ('rotterdam','almere','executive-ev',165.00,297.00,false,'intercity',98.00,90),
  ('rotterdam','amsterdam','executive-ev',129.00,232.00,true,'intercity',78.00,65),
  ('rotterdam','breda','executive-ev',85.00,153.00,false,'intercity',50.00,43),
  ('rotterdam','den-bosch','executive-ev',125.00,225.00,false,'intercity',78.00,65),
  ('rotterdam','den-haag','executive-ev',55.00,99.00,true,'intercity',23.00,25),
  ('rotterdam','eindhoven','executive-ev',165.00,297.00,false,'intercity',110.00,90),
  ('rotterdam','rotterdam-airport','executive-ev',39.00,70.00,true,'airport',7.00,9),
  ('rotterdam','schiphol-airport','executive-ev',119.00,214.00,true,'airport',61.00,54),
  ('rotterdam','spijkenisse','executive-ev',50.00,90.00,true,'intercity',22.00,25),  -- nieuw
  ('rotterdam','tilburg','executive-ev',125.00,225.00,false,'intercity',79.00,66),
  ('rotterdam','utrecht','executive-ev',105.00,189.00,true,'intercity',62.00,55),
  ('schiphol-airport','almere-buiten','executive-ev',114.00,205.00,true,'airport',51.00,47),  -- nieuw
  ('schiphol-airport','almere-haven','executive-ev',106.00,191.00,true,'airport',45.00,43),  -- nieuw
  ('schiphol-airport','almere-hout','executive-ev',113.00,203.00,true,'airport',49.00,45),  -- nieuw
  ('schiphol-airport','almere-muziekwijk','executive-ev',105.00,189.00,true,'airport',43.00,41),  -- nieuw
  ('schiphol-airport','almere-oostvaarders','executive-ev',116.00,209.00,true,'airport',52.00,49),  -- nieuw
  ('schiphol-airport','almere-poort','executive-ev',102.00,184.00,true,'airport',39.00,38),  -- nieuw
  ('schiphol-airport','almere-stad-centrum','executive-ev',106.00,191.00,true,'airport',45.00,46),  -- nieuw
  ('schiphol-airport','amsterdam-centrum','executive-ev',61.00,110.00,true,'airport',26.00,31),  -- nieuw
  ('schiphol-airport','amsterdam-noord','executive-ev',65.00,117.00,true,'airport',30.00,29),  -- nieuw
  ('schiphol-airport','amsterdam-oost','executive-ev',60.00,108.00,true,'airport',24.00,29),  -- nieuw
  ('schiphol-airport','amsterdam-oud-zuid-de-pijp','executive-ev',55.00,99.00,true,'airport',17.00,23),  -- nieuw
  ('schiphol-airport','amsterdam-zuidas','executive-ev',50.00,90.00,true,'airport',17.00,20),  -- nieuw
  ('schiphol-airport','amsterdam-zuidoost-bijlmer','executive-ev',60.00,108.00,true,'airport',23.00,25),  -- nieuw
  ('schiphol-airport','amsterdam','executive-ev',65.00,117.00,true,'airport',24.00,27),  -- nieuw
  ('schiphol-airport','de-uithof-science-park','executive-ev',117.00,211.00,true,'airport',56.00,52),  -- nieuw
  ('schiphol-airport','den-haag-benoordenhout','executive-ev',105.00,189.00,true,'airport',44.00,43),  -- nieuw
  ('schiphol-airport','den-haag-centrum','executive-ev',110.00,198.00,true,'airport',49.00,46),  -- nieuw
  ('schiphol-airport','den-haag-loosduinen','executive-ev',114.00,205.00,true,'airport',53.00,53),  -- nieuw
  ('schiphol-airport','den-haag-scheveningen','executive-ev',112.00,202.00,true,'airport',51.00,49),  -- nieuw
  ('schiphol-airport','den-haag-statenkwartier','executive-ev',111.00,200.00,true,'airport',50.00,47),  -- nieuw
  ('schiphol-airport','den-haag-ypenburg','executive-ev',105.00,189.00,true,'airport',44.00,43),  -- nieuw
  ('schiphol-airport','den-haag','executive-ev',114.00,205.00,true,'airport',48.00,45),  -- nieuw
  ('schiphol-airport','leidsche-rijn','executive-ev',104.00,187.00,true,'airport',45.00,42),  -- nieuw
  ('schiphol-airport','rotterdam-blijdorp','executive-ev',105.00,189.00,true,'airport',59.00,52),  -- nieuw
  ('schiphol-airport','rotterdam-centrum','executive-ev',109.00,196.00,true,'airport',62.00,57),  -- nieuw
  ('schiphol-airport','rotterdam-delfshaven','executive-ev',109.00,196.00,true,'airport',62.00,56),  -- nieuw
  ('schiphol-airport','rotterdam-hillegersberg','executive-ev',105.00,189.00,true,'airport',61.00,53),  -- nieuw
  ('schiphol-airport','rotterdam-kralingen','executive-ev',115.00,207.00,true,'airport',69.00,58),  -- nieuw
  ('schiphol-airport','rotterdam-prins-alexander','executive-ev',119.00,214.00,true,'airport',69.00,59),  -- nieuw
  ('schiphol-airport','rotterdam','executive-ev',119.00,214.00,true,'airport',61.00,54),  -- nieuw
  ('schiphol-airport','spijkenisse-centrum','executive-ev',135.00,243.00,true,'airport',70.00,56),  -- nieuw
  ('schiphol-airport','spijkenisse-de-akkers','executive-ev',137.00,247.00,true,'airport',72.00,58),  -- nieuw
  ('schiphol-airport','spijkenisse-groenewoud','executive-ev',133.00,239.00,true,'airport',69.00,55),  -- nieuw
  ('schiphol-airport','spijkenisse-hoogwerf','executive-ev',135.00,243.00,true,'airport',70.00,56),  -- nieuw
  ('schiphol-airport','spijkenisse-maaswijk','executive-ev',136.00,245.00,true,'airport',71.00,57),  -- nieuw
  ('schiphol-airport','spijkenisse-sterrenkwartier','executive-ev',133.00,239.00,true,'airport',69.00,55),  -- nieuw
  ('schiphol-airport','spijkenisse','executive-ev',137.00,247.00,true,'airport',70.00,58),  -- nieuw
  ('schiphol-airport','utrecht-centrum','executive-ev',110.00,198.00,true,'airport',51.00,49),  -- nieuw
  ('spijkenisse-centrum','schiphol-airport','executive-ev',135.00,243.00,true,'airport',70.00,56),
  ('spijkenisse-de-akkers','schiphol-airport','executive-ev',137.00,247.00,true,'airport',72.00,58),
  ('spijkenisse-groenewoud','schiphol-airport','executive-ev',133.00,239.00,true,'airport',69.00,55),
  ('spijkenisse-hoogwerf','schiphol-airport','executive-ev',135.00,243.00,true,'airport',70.00,56),
  ('spijkenisse-maaswijk','schiphol-airport','executive-ev',136.00,245.00,true,'airport',71.00,57),
  ('spijkenisse-sterrenkwartier','schiphol-airport','executive-ev',133.00,239.00,true,'airport',69.00,55),
  ('spijkenisse','amsterdam','executive-ev',145.00,261.00,true,'intercity',88.00,65),
  ('spijkenisse','antwerp-airport','executive-ev',149.00,268.00,true,'airport',90.00,65),
  ('spijkenisse','brussels-airport','executive-ev',209.00,376.00,true,'airport',135.00,95),
  ('spijkenisse','den-haag','executive-ev',75.00,135.00,true,'intercity',38.00,35),
  ('spijkenisse','eindhoven-airport','executive-ev',169.00,304.00,true,'airport',105.00,70),
  ('spijkenisse','eindhoven','executive-ev',165.00,297.00,true,'intercity',105.00,75),
  ('spijkenisse','rotterdam-airport','executive-ev',69.00,124.00,true,'airport',32.00,28),
  ('spijkenisse','rotterdam','executive-ev',50.00,90.00,true,'intercity',22.00,25),
  ('spijkenisse','schiphol-airport','executive-ev',137.00,247.00,true,'airport',70.00,58),
  ('spijkenisse','utrecht','executive-ev',139.00,250.00,true,'intercity',85.00,60),
  ('utrecht-centrum','schiphol-airport','executive-ev',110.00,198.00,true,'airport',51.00,49),
  ('utrecht','almere','executive-ev',79.00,142.00,true,'intercity',40.00,48),  -- geheractiveerd
  ('utrecht','amsterdam','executive-ev',85.00,153.00,true,'intercity',44.00,44),
  ('utrecht','breda','executive-ev',119.00,214.00,false,'intercity',75.00,66),
  ('utrecht','den-bosch','executive-ev',89.00,160.00,false,'intercity',54.00,48),
  ('utrecht','den-haag','executive-ev',115.00,207.00,false,'intercity',67.00,61),
  ('utrecht','eindhoven','executive-ev',139.00,250.00,false,'intercity',88.00,76),
  ('utrecht','rotterdam','executive-ev',105.00,189.00,true,'intercity',62.00,57),  -- geheractiveerd
  ('utrecht','spijkenisse','executive-ev',139.00,250.00,true,'intercity',85.00,60),  -- nieuw
  ('utrecht','tilburg','executive-ev',129.00,232.00,false,'intercity',82.00,70);

-- ── GUARD 1 — onbekende referenties ─────────────────────────────────────────
do $$
declare ontbrekend int;
begin
  select count(*) into ontbrekend from _canonical_pricing_v2 w
   where not exists (select 1 from public.locations l where l.slug = w.pickup_slug)
      or not exists (select 1 from public.locations l where l.slug = w.dropoff_slug)
      or not exists (select 1 from public.vehicle_classes v where v.code = w.vclass_code);
  if ontbrekend > 0 then
    raise exception 'pricing_canonical_v2_unknown_reference: % canonieke rijen verwijzen naar een onbekende slug of vehicle-class code', ontbrekend
      using errcode = '23503';
  end if;
end $$;

-- ── GUARD 2 — ontbrekende rijen ─────────────────────────────────────────────
do $$
declare ontbreekt int;
begin
  select count(*) into ontbreekt
    from _canonical_pricing_v2 w
    join public.locations p on p.slug = w.pickup_slug
    join public.locations d on d.slug = w.dropoff_slug
    join public.vehicle_classes v on v.code = w.vclass_code
   where not exists (
     select 1 from public.fixed_route_prices f
      where f.pickup_location_id = p.id and f.dropoff_location_id = d.id
        and f.vehicle_class_id = v.id);
  if ontbreekt > 0 then
    raise exception 'pricing_canonical_v2_missing_rows: % verwachte routes ontbreken in de database — is 20261010120500 toegepast?', ontbreekt
      using errcode = '23514';
  end if;
end $$;

-- ── GUARD 3 — prijs- of activatieafwijking ──────────────────────────────────
do $$
declare afwijkend int; voorbeeld text;
begin
  select count(*), min(p.slug || ' -> ' || d.slug) into afwijkend, voorbeeld
    from _canonical_pricing_v2 w
    join public.locations p on p.slug = w.pickup_slug
    join public.locations d on d.slug = w.dropoff_slug
    join public.vehicle_classes v on v.code = w.vclass_code
    join public.fixed_route_prices f
      on f.pickup_location_id = p.id and f.dropoff_location_id = d.id and f.vehicle_class_id = v.id
   where f.price        is distinct from w.price
      or f.return_price is distinct from w.return_price
      or f.active       is distinct from w.active
      or f.service_type is distinct from w.service_type;
  if afwijkend > 0 then
    raise exception 'pricing_canonical_v2_mismatch: % routes wijken af in prijs, retourprijs, activatie of service_type (bijv. %)', afwijkend, voorbeeld
      using errcode = '23514';
  end if;
end $$;

-- ── GUARD 4 — Antwerpen/Brussel blijven uitgesloten ─────────────────────────
do $$
declare fout int;
begin
  select count(*) into fout
    from public.fixed_route_prices f
    join public.locations p on p.id = f.pickup_location_id
   where f.active and p.slug in ('antwerp-airport', 'brussels-airport');
  if fout > 0 then
    raise exception 'pricing_canonical_v2_excluded_airport_active: % actieve route(s) vertrekken vanaf Antwerpen/Brussel; die horen op aanvraag te blijven', fout
      using errcode = '23514';
  end if;
end $$;

-- ── GUARD 5 — tellingen ─────────────────────────────────────────────────────
do $$
declare verwacht int; actief int; gespiegeld int;
begin
  select count(*) into verwacht from _canonical_pricing_v2;
  if verwacht <> 137 then
    raise exception 'pricing_canonical_v2_set_size: canonieke set telt % rijen, verwacht 137', verwacht;
  end if;

  select count(*) into actief from _canonical_pricing_v2 where active;
  if actief <> 112 then
    raise exception 'pricing_canonical_v2_active_count: canonieke set telt % actieve rijen, verwacht 112', actief;
  end if;

  select count(*) into gespiegeld
    from public.fixed_route_prices
   where source_label = 'spiegeling-terugrichting-2026-10-10';
  if gespiegeld <> 48 then
    raise exception 'pricing_canonical_v2_mirror_count: % gespiegelde rijen gevonden, verwacht 48', gespiegeld;
  end if;
end $$;

-- ── GUARD 6 — extra rijen: melden, nooit verwijderen of deactiveren ─────────
do $$
declare extra int;
begin
  select count(*) into extra
    from public.fixed_route_prices f
    join public.locations p on p.id = f.pickup_location_id
    join public.locations d on d.id = f.dropoff_location_id
    join public.vehicle_classes v on v.id = f.vehicle_class_id
   where not exists (
     select 1 from _canonical_pricing_v2 w
      where w.pickup_slug = p.slug and w.dropoff_slug = d.slug and w.vclass_code = v.code);
  if extra > 0 then
    raise warning 'pricing_canonical_v2_extra_rows: % bestaande routes staan niet in de canonieke set en zijn onaangeroerd gelaten', extra;
  end if;
end $$;

commit;
