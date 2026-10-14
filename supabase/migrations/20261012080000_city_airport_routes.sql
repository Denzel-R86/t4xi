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
-- WIJKEN WORDEN ONTDEKT, NIET OPGESOMD (herzien 2026-10-14). De wijken van een stad
-- volgen uit de expliciete relatie `locations.city_id` -> `cities.id`. Een eerdere
-- versie gebruikte een slugpatroon voor Almere en een VASTE LIJST voor Utrecht; dat
-- was asymmetrisch en onveilig. `leidsche-rijn` en `de-uithof-science-park` beginnen
-- niet met `utrecht-`, dus een slugconventie mist ze, en een vaste lijst zou een
-- NIEUWE wijk stilzwijgend buiten de MAX-berekening EN buiten de telling laten
-- vallen - precies de stille onderprijzing die deze guard moet voorkomen. Via
-- city_id wordt elke wijk gevonden, ook een die later wordt toegevoegd, en loopt de
-- migratie vast zodra het aantal wijken verandert.
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
-- IDEMPOTENT EN CORRECT (herzien 2026-10-14). `on conflict do nothing` op de
-- business key; alle controles meten de EINDtoestand, niet het verschil. Maar
-- idempotentie alleen is niet genoeg: de unieke index `fixed_route_prices_route_key`
-- is NIET partieel en dekt dus ook INACTIEVE rijen, zodat `do nothing` een
-- afwijkende bestaande rij stil zou overslaan. GUARD 3 vergelijkt daarom elke
-- bestaande rij op een doelsleutel VELD VOOR VELD - prijs, retourprijs, actieve
-- status, herkomst, afstand, reistijd, service_type, valuta en btw - en benoemt bij
-- een afwijking precies welk veld op welke route niet klopt. Een herhaalde
-- uitvoering op een correcte database passeert; elke andere toestand stopt.
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
  bron_wijk text,
  -- aantal wijken dat deze stad NU heeft; de migratie faalt als dat verandert
  verwachte_wijken integer
) on commit drop;

insert into _stadsroute values
  ('almere',           'schiphol-airport', 'executive-ev', 116.00, 209.00, 52.00, 49, 'airport', 'almere-oostvaarders',    7),
  ('schiphol-airport', 'almere',           'executive-ev', 116.00, 209.00, 52.00, 49, 'airport', 'almere-oostvaarders',    7),
  ('utrecht',          'schiphol-airport', 'executive-ev', 117.00, 211.00, 56.00, 52, 'airport', 'de-uithof-science-park', 3),
  ('schiphol-airport', 'utrecht',          'executive-ev', 117.00, 211.00, 56.00, 52, 'airport', 'de-uithof-science-park', 3);

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
-- De wijken worden ONTDEKT via de expliciete stad-wijkrelatie (`locations.city_id`
-- -> `cities.id`), niet via een slugpatroon of een vaste lijst. Dat is wezenlijk:
-- `leidsche-rijn` en `de-uithof-science-park` beginnen niet met `utrecht-`, dus een
-- slugconventie zou ze missen, en een vaste lijst zou een NIEUWE wijk stilzwijgend
-- buiten de MAX laten vallen. Via city_id wordt elke wijk van de stad gevonden,
-- ook een die later wordt toegevoegd.
--
-- Getoetst wordt: (a) de stad heeft een city_id, (b) de bronwijk hoort bij diezelfde
-- stad, (c) de bronwijk is werkelijk de duurste wijk, en (d) de hardgecodeerde prijs
-- en retourprijs zijn identiek aan die van de bronwijk.
do $$
declare
  r record;
  stad_city_id uuid;
  bron_city_id uuid;
  max_wijk_prijs numeric;
  bron_prijs numeric;
  bron_retour numeric;
begin
  for r in
    select distinct on (bron_wijk) bron_wijk, price, return_price, vclass_code,
           case when pickup_slug = 'schiphol-airport' then dropoff_slug else pickup_slug end as stad
    from _stadsroute
  loop
    -- (a) de stad moet aan een city hangen
    select l.city_id into stad_city_id
      from public.locations l
     where l.slug = r.stad and l.location_type = 'city';
    if stad_city_id is null then
      raise exception
        'city_airport_city_unlinked: stad % heeft geen city_id, wijken zijn niet betrouwbaar af te leiden', r.stad
        using errcode = '23502';
    end if;

    -- (b) de bronwijk moet een district van DIE stad zijn
    select l.city_id into bron_city_id
      from public.locations l
     where l.slug = r.bron_wijk and l.location_type = 'district';
    if bron_city_id is distinct from stad_city_id then
      raise exception
        'city_airport_source_other_city: bronwijk % hoort niet bij stad %', r.bron_wijk, r.stad
        using errcode = '23514';
    end if;

    -- (c) hoogste wijkprijs naar Schiphol voor deze stad
    select max(f.price) into max_wijk_prijs
    from public.fixed_route_prices f
    join public.locations p on p.id = f.pickup_location_id
    join public.locations d on d.id = f.dropoff_location_id
    join public.vehicle_classes v on v.id = f.vehicle_class_id
    where d.slug = 'schiphol-airport' and v.code = r.vclass_code and f.active
      and p.location_type = 'district' and p.city_id = stad_city_id;

    if max_wijk_prijs is null then
      raise exception 'city_airport_no_districts: geen actieve wijkroutes naar Schiphol gevonden voor %', r.stad
        using errcode = '23514';
    end if;

    if max_wijk_prijs <> r.price then
      raise exception
        'city_airport_convention_broken: stadsprijs voor % staat op %, maar de duurste wijk kost nu % - conventie stadsprijs = MAX wijk is geschonden, handmatig beoordelen',
        r.stad, r.price, max_wijk_prijs using errcode = '23514';
    end if;

    -- (d) de bronwijk moet die MAX dragen, met dezelfde retourprijs
    select f.price, f.return_price into bron_prijs, bron_retour
    from public.fixed_route_prices f
    join public.locations p on p.id = f.pickup_location_id
    join public.locations d on d.id = f.dropoff_location_id
    join public.vehicle_classes v on v.id = f.vehicle_class_id
    where p.slug = r.bron_wijk and d.slug = 'schiphol-airport' and v.code = r.vclass_code and f.active;

    if bron_prijs is distinct from r.price or bron_retour is distinct from r.return_price then
      raise exception
        'city_airport_source_mismatch: bronwijk % kost nu % / % maar de migratie verwacht % / %',
        r.bron_wijk, bron_prijs, bron_retour, r.price, r.return_price using errcode = '23514';
    end if;
  end loop;
end $$;

-- ── GUARD 3: een bestaande doelroute moet EXACT kloppen, anders stoppen ──────
--
-- WAAROM DIT VERDER GAAT DAN `on conflict do nothing`. De unieke index
-- `fixed_route_prices_route_key` (pickup, dropoff, vehicle_class) is NIET partieel
-- en dekt dus ook INACTIEVE rijen. Een inactieve of anderszins afwijkende rij op
-- een doelsleutel zou de insert stilzwijgend laten overslaan. De telling verderop
-- vangt dat wel af, maar met de melding "Verwachtte 4 stadsroutes, kreeg 3", die de
-- werkelijke oorzaak niet noemt.
--
-- Daarom wordt elke bestaande rij op een doelsleutel hier VELD VOOR VELD vergeleken
-- met wat de migratie zou invoegen. Klopt alles, dan is dit een herhaalde uitvoering
-- en mag `do nothing` zijn werk doen. Wijkt er iets af - prijs, retourprijs, actieve
-- status, herkomst of route-eigenschappen - dan stopt de migratie met een melding die
-- precies benoemt welk veld op welke route afwijkt. Idempotentie is niet hetzelfde
-- als correctheid; dit controleert het tweede.
do $$
declare
  r record;
  afwijkingen text[] := '{}';
  route text;
begin
  for r in
    select p.slug as pickup, d.slug as dropoff,
           f.price, f.return_price, f.active, f.source_label, f.currency, f.vat_rate,
           f.distance_km, f.estimated_duration_min, f.service_type,
           s.price as v_price, s.return_price as v_return, s.distance_km as v_distance,
           s.duration_min as v_duration, s.service_type as v_service
    from _stadsroute s
    join public.locations p on p.slug = s.pickup_slug
    join public.locations d on d.slug = s.dropoff_slug
    join public.vehicle_classes v on v.code = s.vclass_code
    join public.fixed_route_prices f
      on f.pickup_location_id = p.id and f.dropoff_location_id = d.id and f.vehicle_class_id = v.id
  loop
    route := r.pickup || ' -> ' || r.dropoff;
    if r.price is distinct from r.v_price then
      afwijkingen := afwijkingen || format('%s: price %s verwacht %s', route, r.price, r.v_price);
    end if;
    if r.return_price is distinct from r.v_return then
      afwijkingen := afwijkingen || format('%s: return_price %s verwacht %s', route, r.return_price, r.v_return);
    end if;
    if r.active is distinct from true then
      afwijkingen := afwijkingen || format('%s: active=%s verwacht true', route, r.active);
    end if;
    if r.source_label is distinct from 'stadsroute-luchthaven-2026-10-12' then
      afwijkingen := afwijkingen || format('%s: source_label %L verwacht %L', route, r.source_label, 'stadsroute-luchthaven-2026-10-12');
    end if;
    if r.distance_km is distinct from r.v_distance then
      afwijkingen := afwijkingen || format('%s: distance_km %s verwacht %s', route, r.distance_km, r.v_distance);
    end if;
    if r.estimated_duration_min is distinct from r.v_duration then
      afwijkingen := afwijkingen || format('%s: estimated_duration_min %s verwacht %s', route, r.estimated_duration_min, r.v_duration);
    end if;
    if r.service_type is distinct from r.v_service then
      afwijkingen := afwijkingen || format('%s: service_type %L verwacht %L', route, r.service_type, r.v_service);
    end if;
    if r.currency is distinct from 'EUR' then
      afwijkingen := afwijkingen || format('%s: currency %L verwacht EUR', route, r.currency);
    end if;
    if r.vat_rate is distinct from 9 then
      afwijkingen := afwijkingen || format('%s: vat_rate %s verwacht 9', route, r.vat_rate);
    end if;
  end loop;

  if array_length(afwijkingen, 1) > 0 then
    raise exception
      'city_airport_existing_row_differs: bestaande doelroute(s) wijken af, niets overschreven - %',
      array_to_string(afwijkingen, '; ') using errcode = '23514';
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
  r record;
  wijken integer;
  onvolledig integer;
  asymmetrie integer;
  meegeteld_met_48 integer;
begin
  select count(*) into nieuw
  from public.fixed_route_prices
  where source_label = 'stadsroute-luchthaven-2026-10-12';
  if nieuw <> 4 then
    raise exception 'Verwachtte 4 stadsroutes, kreeg % — migratie teruggerold', nieuw;
  end if;

  -- De vier rijen moeten ook INHOUDELIJK kloppen, niet alleen in aantal.
  select count(*) into onvolledig
  from _stadsroute s
  join public.locations p on p.slug = s.pickup_slug
  join public.locations d on d.slug = s.dropoff_slug
  join public.vehicle_classes v on v.code = s.vclass_code
  join public.fixed_route_prices f
    on f.pickup_location_id = p.id and f.dropoff_location_id = d.id and f.vehicle_class_id = v.id
  where f.price is distinct from s.price
     or f.return_price is distinct from s.return_price
     or f.distance_km is distinct from s.distance_km
     or f.estimated_duration_min is distinct from s.duration_min
     or f.service_type is distinct from s.service_type
     or f.currency is distinct from 'EUR'
     or f.vat_rate is distinct from 9
     or f.active is distinct from true
     or f.source_label is distinct from 'stadsroute-luchthaven-2026-10-12';
  if onvolledig > 0 then
    raise exception '% stadsroute(s) staan met afwijkende eigenschappen in de eindstaat', onvolledig;
  end if;

  -- Wijkprijzen moeten ONGEMOEID zijn. De wijken worden via de stad-wijkrelatie
  -- ontdekt (city_id), niet via een slugpatroon of een vaste lijst, zodat een
  -- NIEUWE wijk de controle niet stilzwijgend passeert maar haar laat afbreken.
  for r in
    select distinct
           case when pickup_slug = 'schiphol-airport' then dropoff_slug else pickup_slug end as stad,
           vclass_code, verwachte_wijken
    from _stadsroute
  loop
    select count(distinct p.id) into wijken
    from public.fixed_route_prices f
    join public.locations p on p.id = f.pickup_location_id
    join public.locations d on d.id = f.dropoff_location_id
    join public.vehicle_classes v on v.id = f.vehicle_class_id
    join public.locations c on c.slug = r.stad and c.location_type = 'city'
    where d.slug = 'schiphol-airport' and v.code = r.vclass_code and f.active
      and p.location_type = 'district' and p.city_id = c.city_id;
    if wijken <> r.verwachte_wijken then
      raise exception
        'Verwachtte % actieve wijkroutes naar Schiphol voor %, vond % - is er een wijk bijgekomen of weggevallen? Beoordeel of de stadsprijs nog de MAX is',
        r.verwachte_wijken, r.stad, wijken;
    end if;
  end loop;

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

  raise notice 'Stadsroutes OK: nieuw=%, wijktellingen per stad geverifieerd via city_id, spiegelset=%',
    nieuw, meegeteld_met_48;
end $$;

commit;
