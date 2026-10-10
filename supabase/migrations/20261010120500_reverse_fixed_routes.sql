-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: vaste routes spiegelen (terugrichting aanmaken)
-- Datum: 2026-10-10
--
-- Zie 20261010120000_airport_arrival_surcharge.sql voor de aanleiding en het
-- commerciële akkoord. Deze migratie maakt de ONTBREKENDE TEGENRICHTING aan
-- van elke actieve vaste route die er nog geen heeft.
--
-- De prijs in deze rijen is de GESPIEGELDE HEENPRIJS — zonder toeslag. De
-- aankomsttoeslag wordt niet in de rij gebakken maar door de prijsmotor
-- opgeteld (lib/pricing/service.ts → applyArrivalSurcharge), zodat het bedrag
-- per luchthaven configureerbaar blijft en in de interne prijsopbouw zichtbaar
-- is. Een latere wijziging van de toeslag vereist daardoor GEEN herschrijven
-- van deze 53 rijen.
--
-- Afstand en reistijd worden overgenomen van de heenrichting. Bij de vier
-- routes die vandaag al beide richtingen hebben, scheelt de werkelijke afstand
-- heen en terug hooguit 1-2 km (Amsterdam-Utrecht 45/44, Amsterdam-Rotterdam
-- 80/78) — ruim binnen de marge van de prijscurve, en afstand/reistijd zijn
-- hier uitsluitend presentatie: de prijs komt uit `price`, niet uit een
-- herberekening.
--
-- Retourprijs volgt de bestaande vaste factor x1,8 doordat `return_price`
-- eveneens wordt gespiegeld; die verhouding is in de bronrijen al verwerkt.
--
-- UITGESLOTEN (bewust):
--   • Antwerp Airport en Brussels Airport als vertrekpunt — onvoldoende
--     kostendata voor grensoverschrijdende opstelkosten; blijven "Offerte op
--     aanvraag".
--   • Elke route die al een actieve tegenrichting heeft (Amsterdam-Utrecht,
--     Amsterdam-Rotterdam) — `not exists`-clausule hieronder.
--
-- VERWACHT RESULTAAT: 53 nieuwe rijen.
--     Schiphol Airport             -> 38
--     Rotterdam The Hague Airport  ->  3
--     Eindhoven Airport            ->  1
--     intercity (stad -> stad)     -> 11
--
-- INVARIANT (zes controles onderaan, elk met volledige rollback bij afwijking):
--   1. exact 53 nieuwe rijen;
--   2. expliciete eligible bronset = actieve routes waarvan het eindpunt GEEN
--      bewust uitgesloten luchthaven is;
--   3. iedere eligible bronroute heeft precies EEN actieve tegenrichting;
--   4. geen gespiegelde rij zonder bijbehorende eligible bronroute;
--   5. Antwerpen/Brussel zijn aantoonbaar NIET gespiegeld;
--   6. de vier al symmetrische paren (8 rijen) zijn onaangeraakt.
--
-- Bewust GEEN globale bewering "geen enkele route zonder tegenrichting": die
-- kan niet kloppen zolang Antwerpen en Brussel op aanvraag blijven.
--
-- ROLLBACK (forward-only; dit project heeft geen PITR):
--   delete from public.fixed_route_prices
--   where source_label = 'spiegeling-terugrichting-2026-10-10';
--
-- NIET AUTOMATISCH TOEGEPAST — eerst review door de eigenaar, daarna pas:
--   supabase db push   (of via MCP apply_migration)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

insert into public.fixed_route_prices (
  pickup_location_id, dropoff_location_id, vehicle_class_id,
  price, return_price, currency,
  distance_km, estimated_duration_min, vat_rate,
  source_label, active, service_type
)
select
  f.dropoff_location_id,            -- omgedraaid
  f.pickup_location_id,             -- omgedraaid
  f.vehicle_class_id,
  f.price,
  f.return_price,
  f.currency,
  f.distance_km,
  f.estimated_duration_min,
  f.vat_rate,
  'spiegeling-terugrichting-2026-10-10',
  true,
  f.service_type
from public.fixed_route_prices f
join public.locations herkomst on herkomst.id = f.dropoff_location_id
where f.active
  -- Antwerpen/Brussel blijven op aanvraag
  and herkomst.slug not in ('antwerp-airport', 'brussels-airport')
  -- alleen wanneer de tegenrichting nog niet bestaat
  and not exists (
    select 1
    from public.fixed_route_prices g
    where g.active
      and g.pickup_location_id  = f.dropoff_location_id
      and g.dropoff_location_id = f.pickup_location_id
      and g.vehicle_class_id    = f.vehicle_class_id
  );

-- ── Controles: exacte invariant, anders volledige rollback ───────────────────
--
-- De eerdere, globale bewering "na migratie bestaat geen route zonder
-- tegenrichting" kon per definitie niet kloppen: Antwerpen en Brussel blijven
-- bewust op aanvraag en hebben dus nooit een tegenrichting. De guard werkt nu
-- op een EXPLICIETE eligible bronset, en controleert de uitgesloten set apart.
do $$
declare
  aangemaakt        integer;
  eligible_bronnen  integer;
  zonder_tegen      integer;
  dubbele_tegen     integer;
  onverwacht        integer;
  uitgesloten_fout  integer;
  symmetrisch_nu    integer;
begin
  -- 1. Exact het verwachte aantal nieuwe rijen.
  select count(*) into aangemaakt
  from public.fixed_route_prices
  where source_label = 'spiegeling-terugrichting-2026-10-10';

  if aangemaakt <> 53 then
    raise exception 'Verwachtte 53 gespiegelde routes, kreeg % — migratie teruggerold', aangemaakt;
  end if;

  -- 2. De eligible bronset expliciet bepalen: elke actieve route waarvan het
  --    EINDPUNT geen bewust uitgesloten luchthaven is. Alleen die hoort na
  --    afloop een tegenrichting te hebben.
  create temporary table _eligible on commit drop as
  select f.id, f.pickup_location_id as p, f.dropoff_location_id as d, f.vehicle_class_id as vc
  from public.fixed_route_prices f
  join public.locations herkomst on herkomst.id = f.dropoff_location_id
  where f.active
    and herkomst.slug not in ('antwerp-airport', 'brussels-airport')
    and f.source_label is distinct from 'spiegeling-terugrichting-2026-10-10';

  select count(*) into eligible_bronnen from _eligible;

  -- 3. Iedere eligible bronroute heeft PRECIES ÉÉN actieve tegenrichting.
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

  -- 4. Geen onverwachte tegenrichting: elke nieuwe rij moet de spiegeling zijn
  --    van een bestaande eligible bronroute, nooit een verzonnen paar.
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

  -- 5. De uitgesloten set is daadwerkelijk NIET gespiegeld.
  select count(*) into uitgesloten_fout
  from public.fixed_route_prices n
  join public.locations vertrek on vertrek.id = n.pickup_location_id
  where n.source_label = 'spiegeling-terugrichting-2026-10-10'
    and vertrek.slug in ('antwerp-airport', 'brussels-airport');
  if uitgesloten_fout <> 0 then
    raise exception 'Antwerpen/Brussel zijn ten onrechte gespiegeld (% rijen) — migratie teruggerold', uitgesloten_fout;
  end if;

  -- 6. De vier al bestaande symmetrische paren zijn onaangeraakt: ze hadden al
  --    een tegenrichting en mogen er dus geen tweede bij hebben gekregen. Acht
  --    rijen (4 paren x 2 richtingen), geen daarvan met het nieuwe source_label.
  select count(*) into symmetrisch_nu
  from public.fixed_route_prices a
  join public.fixed_route_prices b
    on b.active and b.pickup_location_id = a.dropoff_location_id
   and b.dropoff_location_id = a.pickup_location_id and b.vehicle_class_id = a.vehicle_class_id
  where a.active
    and a.source_label is distinct from 'spiegeling-terugrichting-2026-10-10'
    and b.source_label is distinct from 'spiegeling-terugrichting-2026-10-10';
  if symmetrisch_nu <> 8 then
    raise exception 'Verwachtte 8 reeds-symmetrische rijen (4 paren), vond % — migratie teruggerold', symmetrisch_nu;
  end if;

  raise notice 'Spiegeling OK: % nieuwe rijen, % eligible bronroutes, 4 bestaande paren ongemoeid',
    aangemaakt, eligible_bronnen;
end $$;

COMMIT;
