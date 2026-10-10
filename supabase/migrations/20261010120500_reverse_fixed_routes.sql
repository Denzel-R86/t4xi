-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: vaste routes spiegelen (terugrichting aanmaken of heractiveren)
-- Datum: 2026-10-10  —  herzien 2026-10-10 na read-only reconciliatie
--
-- Zie 20261010120000_airport_arrival_surcharge.sql voor de aanleiding en het
-- commerciële akkoord.
--
-- HERZIENING. De eerste opzet deed uitsluitend INSERT en keek daarbij alleen
-- naar ACTIEVE rijen. `fixed_route_prices` bevat echter 89 rijen: 59 actief en
-- 30 INACTIEF, met een unique constraint op
-- (pickup_location_id, dropoff_location_id, vehicle_class_id). Vijf van de 53
-- tegenrichtingen bestaan al als inactieve rij met IDENTIEKE prijzen; een
-- INSERT daarop liep op een unique violation en liet de hele migratie falen.
-- Deze migratie is nooit op productie toegepast, dus rechtstreeks bijgewerkt in
-- plaats van een aparte volgmigratie — zelfde werkwijze als
-- 20260818120000_pickup_approach_fee.
--
-- WAT DEZE MIGRATIE DOET
--   48 ontbrekende tegenrichtingen INVOEGEN met de gespiegelde heenprijs;
--    5 bestaande, inactieve en prijsidentieke tegenrichtingen HERACTIVEREN.
--
-- De vijf heractiveringen behouden hun bestaande rij-id en hun bestaande
-- source_label; er wordt UITSLUITEND `active` en `updated_at` aangepast.
-- Prijzen worden nooit stilzwijgend overschreven: wijkt een bestaande rij af
-- in enkele prijs, retourprijs, voertuigklasse of locaties, dan volgt een
-- exception en rolt de hele transactie terug. Er wordt BEWUST geen generieke
-- `on conflict do update` gebruikt — die zou afwijkende data overschrijven.
--
-- DE VIJF HERACTIVERINGEN (business key, omgevingsonafhankelijk):
--   amsterdam  -> almere       75,00 / 135,00
--   den-haag   -> amsterdam   105,00 / 189,00
--   den-haag   -> rotterdam    55,00 /  99,00
--   utrecht    -> almere       79,00 / 142,00
--   utrecht    -> rotterdam   105,00 / 189,00
--
-- De prijs in de 48 nieuwe rijen is de GESPIEGELDE HEENPRIJS — zonder toeslag.
-- De aankomsttoeslag wordt door de prijsmotor opgeteld
-- (lib/pricing/service.ts -> applyArrivalSurcharge), zodat het bedrag per
-- luchthaven configureerbaar blijft en in de interne prijsopbouw zichtbaar is.
--
-- Afstand en reistijd worden overgenomen van de heenrichting. Bij de routes die
-- vandaag al beide richtingen hebben scheelt de werkelijke afstand hooguit
-- 1-2 km; afstand/reistijd zijn hier uitsluitend presentatie, de prijs komt uit
-- `price`.
--
-- UITGESLOTEN (bewust):
--   • Antwerp Airport en Brussels Airport als vertrekpunt — onvoldoende
--     kostendata voor grensoverschrijdende opstelkosten; blijven op aanvraag.
--   • Elke route die al een ACTIEVE tegenrichting heeft (Amsterdam<->Utrecht,
--     Amsterdam<->Rotterdam) — die blijven volledig onaangeroerd.
--
-- INVARIANT (zeven controles onderaan, elk met volledige rollback):
--   1. inserted_count = 48;
--   2. reactivated_count = 5 (gemeten als EINDTOESTAND, niet als verschil);
--   3. expliciete eligible bronset (eindpunt is geen uitgesloten luchthaven);
--   4. iedere eligible bronroute heeft precies EEN actieve tegenrichting;
--   5. geen gespiegelde rij zonder bijbehorende eligible bronroute;
--   6. Antwerpen/Brussel zijn aantoonbaar NIET gespiegeld;
--   7. de al wederkerige routes (4 GERICHTE rijen: Amsterdam<->Utrecht en
--      Amsterdam<->Rotterdam, elk twee richtingen) zijn onaangeroerd.
--
-- Bewust GEEN globale bewering "geen enkele route zonder tegenrichting": die
-- kan niet kloppen zolang Antwerpen en Brussel op aanvraag blijven.
--
-- IDEMPOTENT. Alle tellingen meten de EINDTOESTAND, niet het verschil. Bij een
-- tweede run is de werkset leeg en blijven de uitkomsten identiek. Bewezen
-- tegen een tijdelijke PostgreSQL met 89 rijen (59 actief, 30 inactief): beide
-- runs leveren 137 rijen, 112 actief, 48 gespiegeld.
--
-- ROLLBACK (forward-only; dit project heeft geen PITR):
--   -- de 48 invoegingen:
--   delete from public.fixed_route_prices
--   where source_label = 'spiegeling-terugrichting-2026-10-10';
--   -- de 5 heractiveringen, op business key (nooit op id):
--   update public.fixed_route_prices f set active = false, updated_at = now()
--   from public.locations p, public.locations d
--   where p.id = f.pickup_location_id and d.id = f.dropoff_location_id
--     and (p.slug, d.slug) in (('amsterdam','almere'), ('den-haag','amsterdam'),
--          ('den-haag','rotterdam'), ('utrecht','almere'), ('utrecht','rotterdam'));
--   -- GEEN cascade, GEEN manipulatie van de migration history.
--
-- NIET AUTOMATISCH TOEGEPAST — eerst review door de eigenaar, daarna pas:
--   supabase db push   (of via MCP apply_migration)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── De vijf heractiveringen, expliciet op business key ───────────────────────
--
-- Deze set is de VERWACHTE uitkomst, niet de stuurinformatie: de UPDATE verderop
-- leidt zijn werkset zelf af. Hij staat hier zodat de controles de EINDTOESTAND
-- kunnen meten in plaats van het verschil — dat maakt de migratie idempotent.
create temporary table _heractiveer_paren (pickup_slug text, dropoff_slug text) on commit drop;
insert into _heractiveer_paren values
  ('amsterdam', 'almere'),
  ('den-haag',  'amsterdam'),
  ('den-haag',  'rotterdam'),
  ('utrecht',   'almere'),
  ('utrecht',   'rotterdam');

-- ── Eligible bronset + classificatie invoegen/heractiveren ───────────────────
--
-- Een bronroute is eligible wanneer ze actief is, haar EINDPUNT geen bewust
-- uitgesloten luchthaven is, en er nog geen ACTIEVE tegenrichting bestaat.
-- De left join vindt een eventueel bestaande INACTIEVE tegenrichting.
create temporary table _spiegel on commit drop as
select
  f.dropoff_location_id            as nieuw_pickup,
  f.pickup_location_id             as nieuw_dropoff,
  f.vehicle_class_id               as vc,
  f.price, f.return_price, f.currency, f.distance_km,
  f.estimated_duration_min, f.vat_rate, f.service_type,
  bestaand.id                      as bestaande_id,
  bestaand.price                   as bestaande_price,
  bestaand.return_price            as bestaande_return,
  bestaand.active                  as bestaande_active
from public.fixed_route_prices f
join public.locations herkomst on herkomst.id = f.dropoff_location_id
left join public.fixed_route_prices bestaand
       on bestaand.pickup_location_id  = f.dropoff_location_id
      and bestaand.dropoff_location_id = f.pickup_location_id
      and bestaand.vehicle_class_id    = f.vehicle_class_id
where f.active
  and herkomst.slug not in ('antwerp-airport', 'brussels-airport')
  and not exists (
    select 1
    from public.fixed_route_prices g
    where g.active
      and g.pickup_location_id  = f.dropoff_location_id
      and g.dropoff_location_id = f.pickup_location_id
      and g.vehicle_class_id    = f.vehicle_class_id
  );

-- ── GUARD VOORAF: nooit een afwijkende bestaande rij aanraken ────────────────
--
-- Alleen een bestaande rij die PRIJSIDENTIEK is aan de gespiegelde heenprijs
-- mag geheractiveerd worden. Voertuigklasse en locaties zijn gelijk door de
-- join-sleutel; dat wordt hieronder alsnog expliciet bevestigd, zodat een
-- latere wijziging van de join die eis niet stilzwijgend kan laten vallen.
do $$
declare
  afwijkend integer;
  reeds_actief integer;
begin
  select count(*) into afwijkend
  from _spiegel s
  where s.bestaande_id is not null
    and (s.bestaande_price  is distinct from s.price
      or s.bestaande_return is distinct from s.return_price);
  if afwijkend > 0 then
    raise exception
      'pricing_reverse_price_mismatch: % bestaande tegenrichting(en) hebben een AFWIJKENDE prijs; niets overschreven, migratie teruggerold',
      afwijkend using errcode = '23514';
  end if;

  select count(*) into afwijkend
  from _spiegel s
  join public.fixed_route_prices x on x.id = s.bestaande_id
  where x.pickup_location_id  is distinct from s.nieuw_pickup
     or x.dropoff_location_id is distinct from s.nieuw_dropoff
     or x.vehicle_class_id    is distinct from s.vc;
  if afwijkend > 0 then
    raise exception
      'pricing_reverse_key_mismatch: % bestaande rij(en) wijken af in locaties of voertuigklasse; migratie teruggerold',
      afwijkend using errcode = '23514';
  end if;

  -- Defensief: een reeds ACTIEVE identieke tegenrichting hoort door de
  -- not-exists-clausule al uitgesloten te zijn (no-op). Belandt er toch een
  -- in de set, dan is de selectie stuk en stoppen we.
  select count(*) into reeds_actief from _spiegel where bestaande_active;
  if reeds_actief > 0 then
    raise exception
      'pricing_reverse_already_active: % reeds actieve tegenrichting(en) in de werkset; selectie is onjuist, migratie teruggerold',
      reeds_actief using errcode = '23514';
  end if;
end $$;

-- ── 1. INVOEGEN: tegenrichtingen die nog helemaal niet bestaan ───────────────
insert into public.fixed_route_prices (
  pickup_location_id, dropoff_location_id, vehicle_class_id,
  price, return_price, currency,
  distance_km, estimated_duration_min, vat_rate,
  source_label, active, service_type
)
select
  s.nieuw_pickup, s.nieuw_dropoff, s.vc,
  s.price, s.return_price, s.currency,
  s.distance_km, s.estimated_duration_min, s.vat_rate,
  'spiegeling-terugrichting-2026-10-10',
  true,
  s.service_type
from _spiegel s
where s.bestaande_id is null;

-- ── 2. HERACTIVEREN: bestaande, inactieve, prijsidentieke tegenrichtingen ────
--
-- UITSLUITEND `active` en `updated_at`. Prijs, retourprijs, afstand, reistijd,
-- service_type, source_label en het rij-id blijven ongemoeid.
update public.fixed_route_prices x
set    active     = true,
       updated_at = now()
from   _spiegel s
where  x.id = s.bestaande_id
  and  s.bestaande_id is not null
  and  x.active = false;

-- ── Controles ────────────────────────────────────────────────────────────────
do $$
declare
  inserted_count            integer;
  reactivated_count         integer;
  unchanged_existing_count  integer;
  eligible_bronnen          integer;
  zonder_tegen              integer;
  dubbele_tegen             integer;
  onverwacht                integer;
  uitgesloten_fout          integer;
begin
  select count(*) into inserted_count
  from public.fixed_route_prices
  where source_label = 'spiegeling-terugrichting-2026-10-10';

  if inserted_count <> 48 then
    raise exception 'Verwachtte 48 ingevoegde tegenrichtingen, kreeg % — migratie teruggerold', inserted_count;
  end if;

  -- EINDTOESTAND, niet het verschil: alle vijf gedocumenteerde paren moeten nu
  -- actief zijn. Bij een tweede run zijn ze dat nog steeds, dus de telling
  -- blijft 5 — daarmee is deze controle idempotent.
  select count(*) into reactivated_count
  from _heractiveer_paren hp
  join public.locations p on p.slug = hp.pickup_slug
  join public.locations d on d.slug = hp.dropoff_slug
  join public.fixed_route_prices x
    on x.pickup_location_id = p.id and x.dropoff_location_id = d.id
  where x.active;

  if reactivated_count <> 5 then
    raise exception 'Verwachtte 5 actieve heractiveringen, kreeg % — migratie teruggerold', reactivated_count;
  end if;

  -- Expliciete eligible bronset: elke actieve route waarvan het eindpunt geen
  -- bewust uitgesloten luchthaven is, en die niet zelf een spiegeling is.
  create temporary table _eligible on commit drop as
  select f.pickup_location_id as p, f.dropoff_location_id as d, f.vehicle_class_id as vc
  from public.fixed_route_prices f
  join public.locations herkomst on herkomst.id = f.dropoff_location_id
  where f.active
    and herkomst.slug not in ('antwerp-airport', 'brussels-airport')
    and f.source_label is distinct from 'spiegeling-terugrichting-2026-10-10';

  select count(*) into eligible_bronnen from _eligible;

  select count(*) into zonder_tegen
  from _eligible e
  where not exists (
    select 1 from public.fixed_route_prices g
    where g.active and g.pickup_location_id = e.d and g.dropoff_location_id = e.p and g.vehicle_class_id = e.vc
  );
  if zonder_tegen <> 0 then
    raise exception '% eligible bronroutes zonder tegenrichting — migratie teruggerold', zonder_tegen;
  end if;

  select count(*) into dubbele_tegen
  from _eligible e
  where (
    select count(*) from public.fixed_route_prices g
    where g.active and g.pickup_location_id = e.d and g.dropoff_location_id = e.p and g.vehicle_class_id = e.vc
  ) > 1;
  if dubbele_tegen <> 0 then
    raise exception '% bronroutes met MEER dan één actieve tegenrichting — migratie teruggerold', dubbele_tegen;
  end if;

  select count(*) into onverwacht
  from public.fixed_route_prices n
  where n.source_label = 'spiegeling-terugrichting-2026-10-10'
    and not exists (
      select 1 from _eligible e
      where e.p = n.dropoff_location_id and e.d = n.pickup_location_id and e.vc = n.vehicle_class_id
    );
  if onverwacht <> 0 then
    raise exception '% gespiegelde rijen zonder eligible bronroute — migratie teruggerold', onverwacht;
  end if;

  select count(*) into uitgesloten_fout
  from public.fixed_route_prices n
  join public.locations vertrek on vertrek.id = n.pickup_location_id
  where n.source_label = 'spiegeling-terugrichting-2026-10-10'
    and vertrek.slug in ('antwerp-airport', 'brussels-airport');
  if uitgesloten_fout <> 0 then
    raise exception 'Antwerpen/Brussel zijn ten onrechte gespiegeld (% rijen) — migratie teruggerold', uitgesloten_fout;
  end if;

  -- De al wederkerige routes: 4 GERICHTE rijen (Amsterdam<->Utrecht en
  -- Amsterdam<->Rotterdam, elk twee richtingen) die noch gespiegeld noch
  -- geheractiveerd zijn. Ook deze telling meet de eindtoestand.
  select count(*) into unchanged_existing_count
  from public.fixed_route_prices a
  join public.locations ap on ap.id = a.pickup_location_id
  join public.locations ad on ad.id = a.dropoff_location_id
  join public.fixed_route_prices b
    on b.active and b.pickup_location_id = a.dropoff_location_id
   and b.dropoff_location_id = a.pickup_location_id and b.vehicle_class_id = a.vehicle_class_id
  join public.locations bp on bp.id = b.pickup_location_id
  join public.locations bd on bd.id = b.dropoff_location_id
  where a.active
    and a.source_label is distinct from 'spiegeling-terugrichting-2026-10-10'
    and b.source_label is distinct from 'spiegeling-terugrichting-2026-10-10'
    and not exists (select 1 from _heractiveer_paren h
                     where (h.pickup_slug, h.dropoff_slug) in ((ap.slug, ad.slug), (bp.slug, bd.slug)));
  if unchanged_existing_count <> 4 then
    raise exception
      'Verwachtte 4 onaangeroerde rijen in de bestaande wederkerige paren, vond % — migratie teruggerold',
      unchanged_existing_count;
  end if;

  raise notice 'Spiegeling OK: inserted_count=%, reactivated_count=%, unchanged_existing_count=%, eligible_bronnen=%',
    inserted_count, reactivated_count, unchanged_existing_count, eligible_bronnen;
end $$;

COMMIT;
