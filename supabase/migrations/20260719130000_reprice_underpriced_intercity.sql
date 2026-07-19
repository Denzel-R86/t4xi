-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: acht intercitytarieven rechttrekken
-- Datum: 2026-07-19
--
-- Achtergrond (Stap 10c/10d-audit): herrekend op ECHTE reistijden (OSRM) zaten
-- zes routes onder de margedrempel van 15%, waarvan één verliesgevend. De
-- database hanteerde reistijden die gemiddeld 7% optimistischer zijn dan een
-- routeberekening zónder verkeer, waardoor de marge te rooskleurig oogde.
--
-- Twee extra routes gaan mee om ASYMMETRIE te voorkomen: zonder die twee zou
-- de tarievenpagina twee verschillende bedragen tonen voor dezelfde verbinding
-- (Amsterdam↔Utrecht €85 tegen €69, Rotterdam↔Den Haag €55 tegen €49). Beide
-- hebben op zichzelf een gezonde marge; ze worden gelijkgetrokken met de
-- tegenrichting, niet vanwege een margeprobleem.
--
-- Deze tarieven zijn COMMERCIEEL VASTGESTELD door de eigenaar op 2026-07-19.
-- Het zijn geen automatisch toegepaste Brain-adviezen.
--
--   route                   oud            nieuw          marge (echt)
--   Almere → Amsterdam      € 45 / € 81    € 75 / €135    -17,0% → 29,8%
--   Amsterdam → Eindhoven   €139 / €250    €185 / €333      7,1% → 30,2%
--   Rotterdam → Utrecht     € 79 / €142    €105 / €189      8,1% → 30,8%
--   Almere → Utrecht        € 65 / €117    € 79 / €142     10,9% → 26,7%
--   Amsterdam → Den Haag    € 85 / €153    €105 / €189     12,7% → 29,3%
--   Amsterdam → Utrecht     € 69 / €124    € 85 / €153     15,5% → 31,4%
--   Utrecht → Amsterdam     € 69 / €124    € 85 / €153     17,2% → 32,8%   (symmetrie)
--   Rotterdam → Den Haag    € 49 / € 88    € 55 / € 99     29,3% → 37,0%   (symmetrie)
--
-- Retourprijs = round(enkele prijs × 1,8), de conventie die op alle 16
-- bestaande routes exact opgaat (RETURN_MULTIPLIER in de Pricing Brain).
--
-- VEILIGHEID: elke update matcht op de OUDE prijs. Draait de migratie twee keer,
-- of is een tarief intussen met de hand gewijzigd, dan raakt hij niets — de
-- controlequery onderaan laat dan zien dat er minder dan 8 rijen zijn geraakt.
--
-- LET OP — bewust BUITEN scope: distance_km en estimated_duration_min blijven
-- ongewijzigd. De opgeslagen reistijden zijn nog de optimistische waarden, dus
-- brain_route_metrics blijft een te gunstige marge rapporteren. Dat hoort in een
-- aparte migratie thuis, samen met de reistijden van de overige routes.
--
-- NIET AUTOMATISCH TOEGEPAST — eerst review, daarna supabase db push.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

create temporary table _reprice (
  pickup_slug   text not null,
  dropoff_slug  text not null,
  old_price     numeric not null,
  new_price     numeric not null,
  new_return    numeric not null
) on commit drop;

insert into _reprice (pickup_slug, dropoff_slug, old_price, new_price, new_return) values
  -- marge onder de drempel
  ('almere',    'amsterdam', 45,  75,  135),
  ('amsterdam', 'eindhoven', 139, 185, 333),
  ('rotterdam', 'utrecht',   79,  105, 189),
  ('almere',    'utrecht',   65,  79,  142),
  ('amsterdam', 'den-haag',  85,  105, 189),
  ('amsterdam', 'utrecht',   69,  85,  153),
  -- symmetrie: gelijktrekken met de tegenrichting
  ('utrecht',   'amsterdam', 69,  85,  153),
  ('rotterdam', 'den-haag',  49,  55,  99);

update public.fixed_route_prices f
set price        = r.new_price,
    return_price = r.new_return,
    updated_at   = now()
from _reprice r
join public.locations pl on pl.slug = r.pickup_slug
join public.locations dl on dl.slug = r.dropoff_slug
where f.pickup_location_id  = pl.id
  and f.dropoff_location_id = dl.id
  and f.service_type        = 'intercity'
  and f.active              = true
  and f.price               = r.old_price;

COMMIT;

-- Controlequery (ná toepassen draaien; moet exact deze 8 rijen geven):
--
--   select pl.slug, dl.slug, f.price, f.return_price
--   from public.fixed_route_prices f
--   join public.locations pl on pl.id = f.pickup_location_id
--   join public.locations dl on dl.id = f.dropoff_location_id
--   where (pl.slug, dl.slug) in
--     (('almere','amsterdam'), ('amsterdam','eindhoven'), ('rotterdam','utrecht'),
--      ('almere','utrecht'), ('amsterdam','den-haag'), ('amsterdam','utrecht'),
--      ('utrecht','amsterdam'), ('rotterdam','den-haag'))
--   order by pl.slug, dl.slug;
--
-- Symmetriecontrole (moet 0 rijen geven — geen stadspaar met twee prijzen):
--
--   select pa.slug, pb.slug, a.price, b.price
--   from public.fixed_route_prices a
--   join public.locations pa on pa.id = a.pickup_location_id
--   join public.locations da on da.id = a.dropoff_location_id
--   join public.fixed_route_prices b
--     on b.pickup_location_id = da.id and b.dropoff_location_id = pa.id
--    and b.vehicle_class_id = a.vehicle_class_id
--   join public.locations pb on pb.id = b.pickup_location_id
--   where a.active and b.active and a.service_type = 'intercity'
--     and a.price <> b.price and pa.slug < da.slug;
