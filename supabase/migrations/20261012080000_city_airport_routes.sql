-- ═══════════════════════════════════════════════════════════════════════════
-- Stadsroutes naar/van Schiphol voor Almere en Utrecht
-- Datum: 2026-10-12
--
-- AANLEIDING. `Schiphol → Almere` en `Schiphol → Utrecht` leveren geen vaste
-- prijs op. De oorzaak is niet de spiegeling van 20261010120500 maar de
-- routeinventaris: er bestaat GEEN enkele vaste route tussen `almere` of
-- `utrecht` als STAD en een luchthaven, in geen van beide richtingen. Voor
-- luchthavenvervoer zijn die twee steden uitsluitend op WIJKniveau gemodelleerd
-- (7 Almere-wijken; utrecht-centrum, leidsche-rijn, de-uithof-science-park),
-- terwijl Amsterdam, Den Haag, Rotterdam en Spijkenisse wél beide niveaus
-- hebben. Spiegeling kan niets maken wat er niet was.
--
-- Op 2026-10-11 strandden hierdoor echte aanvragen: `Schiphol → Almere` kreeg
-- "offerte op aanvraag" terwijl `Schiphol → 1361BP Almere` (postcode → wijk)
-- wél €117,00 opleverde.
--
-- PRIJSKEUZE — GEEN NIEUW BEDRAG BEDACHT. Voor luchthaventransfers geldt bij
-- alle vier de steden die beide niveaus hebben dezelfde conventie:
--
--     stadsprijs = MAX van de wijkprijzen
--
--     amsterdam     €65,00   wijken €50–65     = MAX
--     den-haag     €114,00   wijken €105–114   = MAX
--     rotterdam    €119,00   wijken €105–119   = MAX
--     spijkenisse  €137,00   wijken €133–137   = MAX
--
-- Vier van vier, geen uitzondering. Enkele prijs, retourprijs, afstand, reistijd
-- en service_type worden daarom VERBATIM overgenomen van de duurste wijk:
--
--     almere  → schiphol-airport  €116,00 / €209,00  (almere-oostvaarders)
--     utrecht → schiphol-airport  €117,00 / €211,00  (de-uithof-science-park)
--
-- De MAX is bewust conservatief: wie de kale stadsnaam invult betaalt nooit
-- minder dan de duurste wijk, dus onderprijzing is uitgesloten. Wie de wijk of
-- postcode invult houdt zijn wijkprijs — die blijven alle zeven respectievelijk
-- drie ongewijzigd.
--
-- GUARD OP DE CONVENTIE. De bedragen staan hieronder hard in de migratie, zodat
-- de prijsstate reproduceerbaar uit Git volgt. Maar ze worden ook GETOETST tegen
-- de werkelijke MAX-wijkprijs: wijkt die af, dan faalt de migratie hard in plaats
-- van stil een verouderde stadsprijs te installeren.
--
-- AANKOMSTTOESLAG. Niet in deze rijen gebakken. De prijsmotor telt hem er bij
-- een luchthaven-PICKUP exact eenmaal bij op (lib/pricing/service.ts →
-- applyArrivalSurcharge, €15,00 voor Schiphol), net als bij de 48 gespiegelde
-- rijen van 20261010120500. Geen codewijziging nodig.
--
-- MIGRATIEVOLGORDE. Deze versie (20261012080000) ligt NA 20261010120500. Bij een
-- verse installatie draait de spiegeling dus eerst en ziet daar nog steeds exact
-- 48 eligible bronroutes, zodat haar hardgecodeerde invarianten blijven kloppen.
-- Een eerdere timestamp zou die migratie bij elke nieuwe installatie laten
-- afbreken. De vier rijen hieronder krijgen een EIGEN source_label en worden
-- daarom nooit met die 48 meegeteld.
--
-- IDEMPOTENT. `on conflict do nothing` op de business key; alle controles meten
-- de EINDtoestand, niet het verschil.
--
-- ROLLBACK (forward-only; dit project heeft geen PITR):
--   delete from public.fixed_route_prices
--   where source_label = 'stadsroute-luchthaven-2026-10-12';
-- Geen cascade, geen manipulatie van de migratiehistorie, geen enkele
-- bestaande rij geraakt.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── De vier rijen, expliciet op business key ─────────────────────────────────
create temporary table _stadsroute (
  pickup_slug text, dropoff_slug text, vclass_code text,
  price numeric, return_price numeric,
  distance_km numeric, duration_min integer, service_type text,
  -- de wijk waarvan de prijs is overgenomen; uitsluitend voor de guard
  bron_wijk text
) on commit drop;

insert into _stadsroute values
  ('almere',           'schiphol-airport', 'executive-ev', 116.00, 209.00, 52.00, 49, 'airport', 'almere-oostvaarders'),
  ('schiphol-airport', 'almere',           'executive-ev', 116.00, 209.00, 52.00, 49, 'airport', 'almere-oostvaarders'),
  ('utrecht',          'schiphol-airport', 'executive-ev', 117.00, 211.00, 56.00, 52, 'airport', 'de-uithof-science-park'),
  ('schiphol-airport', 'utrecht',          'executive-ev', 117.00, 211.00, 56.00, 52, 'airport', 'de-uithof-science-park');

-- ── GUARD 1: elke verwijzing moet bestaan ────────────────────────────────────
do $$
declare ontbrekend integer;
begin
  select count(*) into ontbrekend
    from _stadsroute s
   where not exists (select 1 from public.locations l where l.slug = s.pickup_slug)
      or not exists (select 1 from public.locations l where l.slug = s.dropoff_slug)
      or not exists (select 1 from public.locations l where l.slug = s.bron_wijk)
      or not exists (select 1 from public.vehicle_classes v where v.code = s.vclass_code);
  if ontbrekend > 0 then
    raise exception 'city_airport_unknown_reference: % rij(en) verwijzen naar een onbekende slug of voertuigklasse', ontbrekend
      using errcode = '23503';
  end if;
end $$;

-- ── GUARD 2: de MAX-wijkprijsconventie moet nog gelden ───────────────────────
--
-- Toetst twee dingen per stad: (a) de bronwijk is werkelijk de duurste wijk naar
-- Schiphol, en (b) de hardgecodeerde prijs én retourprijs zijn identiek aan die
-- van die wijk. Wijkt er iets af, dan is de conventie of de wijkprijs veranderd
-- en moet een mens ernaar kijken.
do $$
declare
  r record;
  max_wijk_prijs numeric;
  bron_prijs numeric;
  bron_retour numeric;
begin
  for r in
    select distinct on (bron_wijk) bron_wijk, price, return_price,
           case when pickup_slug = 'schiphol-airport' then dropoff_slug else pickup_slug end as stad
    from _stadsroute
  loop
    -- (a) hoogste wijkprijs naar Schiphol voor deze stad
    select max(f.price) into max_wijk_prijs
    from public.fixed_route_prices f
    join public.locations p on p.id = f.pickup_location_id
    join public.locations d on d.id = f.dropoff_location_id
    join public.vehicle_classes v on v.id = f.vehicle_class_id
    where d.slug = 'schiphol-airport' and v.code = 'executive-ev' and f.active
      and p.location_type = 'district'
      and (case when r.stad = 'almere' then p.slug like 'almere-%'
                else p.slug in ('utrecht-centrum', 'leidsche-rijn', 'de-uithof-science-park') end);

    if max_wijk_prijs is null then
      raise exception 'city_airport_no_districts: geen actieve wijkroutes naar Schiphol gevonden voor %', r.stad
        using errcode = '23514';
    end if;

    if max_wijk_prijs <> r.price then
      raise exception
        'city_airport_convention_broken: stadsprijs voor % staat op %, maar de duurste wijk kost nu % — conventie stadsprijs = MAX wijk is geschonden, handmatig beoordelen',
        r.stad, r.price, max_wijk_prijs using errcode = '23514';
    end if;

    -- (b) de bronwijk moet die MAX dragen, met dezelfde retourprijs
    select f.price, f.return_price into bron_prijs, bron_retour
    from public.fixed_route_prices f
    join public.locations p on p.id = f.pickup_location_id
    join public.locations d on d.id = f.dropoff_location_id
    join public.vehicle_classes v on v.id = f.vehicle_class_id
    where p.slug = r.bron_wijk and d.slug = 'schiphol-airport' and v.code = 'executive-ev' and f.active;

    if bron_prijs is distinct from r.price or bron_retour is distinct from r.return_price then
      raise exception
        'city_airport_source_mismatch: bronwijk % kost nu % / % maar de migratie verwacht % / %',
        r.bron_wijk, bron_prijs, bron_retour, r.price, r.return_price using errcode = '23514';
    end if;
  end loop;
end $$;

-- ── GUARD 3: nooit een bestaande ACTIEVE route overschrijven ─────────────────
do $$
declare bestaat integer;
begin
  select count(*) into bestaat
  from _stadsroute s
  join public.locations p on p.slug = s.pickup_slug
  join public.locations d on d.slug = s.dropoff_slug
  join public.vehicle_classes v on v.code = s.vclass_code
  join public.fixed_route_prices f
    on f.pickup_location_id = p.id and f.dropoff_location_id = d.id and f.vehicle_class_id = v.id
  where f.active
    and (f.price is distinct from s.price or f.return_price is distinct from s.return_price);
  if bestaat > 0 then
    raise exception
      'city_airport_existing_price_differs: % bestaande actieve route(s) hebben een afwijkende prijs; niets overschreven',
      bestaat using errcode = '23514';
  end if;
end $$;

-- ── Invoegen ─────────────────────────────────────────────────────────────────
insert into public.fixed_route_prices (
  pickup_location_id, dropoff_location_id, vehicle_class_id,
  price, return_price, currency,
  distance_km, estimated_duration_min, vat_rate,
  source_label, active, service_type, valid_from
)
select p.id, d.id, v.id,
       s.price, s.return_price, 'EUR',
       s.distance_km, s.duration_min, 9,
       'stadsroute-luchthaven-2026-10-12',
       true, s.service_type, timestamptz '2026-10-12 00:00:00+00'
from _stadsroute s
join public.locations p on p.slug = s.pickup_slug
join public.locations d on d.slug = s.dropoff_slug
join public.vehicle_classes v on v.code = s.vclass_code
on conflict (pickup_location_id, dropoff_location_id, vehicle_class_id) do nothing;

-- ── Controles op de EINDtoestand ─────────────────────────────────────────────
do $$
declare
  nieuw integer;
  wijken_almere integer;
  wijken_utrecht integer;
  asymmetrie integer;
  meegeteld_met_48 integer;
begin
  select count(*) into nieuw
  from public.fixed_route_prices
  where source_label = 'stadsroute-luchthaven-2026-10-12';
  if nieuw <> 4 then
    raise exception 'Verwachtte 4 stadsroutes, kreeg % — migratie teruggerold', nieuw;
  end if;

  -- Wijkprijzen moeten ONGEMOEID zijn: 7 Almere-wijken en 3 Utrechtse wijken
  -- met een actieve route naar Schiphol, precies zoals vóór deze migratie.
  select count(*) into wijken_almere
  from public.fixed_route_prices f
  join public.locations p on p.id = f.pickup_location_id
  join public.locations d on d.id = f.dropoff_location_id
  where d.slug = 'schiphol-airport' and f.active and p.slug like 'almere-%';
  if wijken_almere <> 7 then
    raise exception 'Verwachtte 7 actieve Almere-wijkroutes naar Schiphol, vond %', wijken_almere;
  end if;

  select count(*) into wijken_utrecht
  from public.fixed_route_prices f
  join public.locations p on p.id = f.pickup_location_id
  join public.locations d on d.id = f.dropoff_location_id
  where d.slug = 'schiphol-airport' and f.active
    and p.slug in ('utrecht-centrum', 'leidsche-rijn', 'de-uithof-science-park');
  if wijken_utrecht <> 3 then
    raise exception 'Verwachtte 3 actieve Utrechtse wijkroutes naar Schiphol, vond %', wijken_utrecht;
  end if;

  -- Heen en terug moeten prijsidentiek zijn; de toeslag komt uit de prijsmotor.
  select count(*) into asymmetrie
  from public.fixed_route_prices a
  join public.locations ap on ap.id = a.pickup_location_id
  join public.locations ad on ad.id = a.dropoff_location_id
  join public.fixed_route_prices b
    on b.pickup_location_id = a.dropoff_location_id
   and b.dropoff_location_id = a.pickup_location_id
   and b.vehicle_class_id = a.vehicle_class_id
  where a.source_label = 'stadsroute-luchthaven-2026-10-12'
    and (b.price is distinct from a.price or b.return_price is distinct from a.return_price);
  if asymmetrie > 0 then
    raise exception '% stadsroute(s) zijn niet prijsidentiek aan hun tegenrichting', asymmetrie;
  end if;

  -- De 48 spiegelingen van 20261010120500 mogen niet zijn aangegroeid.
  select count(*) into meegeteld_met_48
  from public.fixed_route_prices
  where source_label = 'spiegeling-terugrichting-2026-10-10';
  if meegeteld_met_48 <> 48 then
    raise exception 'De spiegelset van 10-10 is gewijzigd (% rijen in plaats van 48)', meegeteld_met_48;
  end if;

  raise notice 'Stadsroutes OK: nieuw=%, almere-wijken=%, utrecht-wijken=%, spiegelset=%',
    nieuw, wijken_almere, wijken_utrecht, meegeteld_met_48;
end $$;

commit;
