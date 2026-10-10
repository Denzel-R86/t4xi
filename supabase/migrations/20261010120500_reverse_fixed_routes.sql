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
-- De migratie faalt hard wanneer het aantal afwijkt (zie controle onderaan).
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

-- ── Controle: exact het verwachte aantal, anders terugrollen ─────────────────
do $$
declare
  aangemaakt integer;
  resterend  integer;
begin
  select count(*) into aangemaakt
  from public.fixed_route_prices
  where source_label = 'spiegeling-terugrichting-2026-10-10';

  if aangemaakt <> 53 then
    raise exception 'Verwachtte 53 gespiegelde routes, kreeg % — migratie teruggerold', aangemaakt;
  end if;

  -- Na deze migratie mag alleen Antwerpen/Brussel nog zonder tegenrichting staan.
  select count(*) into resterend
  from public.fixed_route_prices f
  join public.locations herkomst on herkomst.id = f.dropoff_location_id
  where f.active
    and herkomst.slug not in ('antwerp-airport', 'brussels-airport')
    and not exists (
      select 1 from public.fixed_route_prices g
      where g.active
        and g.pickup_location_id  = f.dropoff_location_id
        and g.dropoff_location_id = f.pickup_location_id
        and g.vehicle_class_id    = f.vehicle_class_id
    );

  if resterend <> 0 then
    raise exception 'Nog % routes zonder tegenrichting na spiegeling — migratie teruggerold', resterend;
  end if;
end $$;

COMMIT;
