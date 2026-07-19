-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: routeafstanden corrigeren + Amsterdam↔Rotterdam herprijzen
-- Datum: 2026-07-19  (Stap 10h)
--
-- Achtergrond: de opgeslagen afstanden en reistijden zijn met de hand ingevoerd
-- en wijken systematisch af van de werkelijke route. Gemeten met OSRM (driving,
-- zonder verkeer) op de coördinaten uit public.locations, aangevuld met PDOK
-- voor de stadsdelen. 30 van de 31 actieve routes wijken af, 11 daarvan met
-- meer dan 5 km. Alleen Rotterdam → Amsterdam klopte exact.
--
-- Waarom dit ertoe doet: het kostenmodel rekent €0,42/km + €0,72/min. Foute
-- afstanden geven dus een foute kostprijs, een foute marge, en daarmee foute
-- Brain-adviezen. De afwijkingen lopen twee kanten op — Rotterdam → Schiphol
-- stond 19 km te hoog, Amsterdam Centrum → Schiphol 12 km te laag.
--
-- ── SCOPE ──────────────────────────────────────────────────────────────────
-- Deel 1: distance_km en estimated_duration_min voor 30 actieve routes.
-- Deel 2: prijs van Amsterdam ↔ Rotterdam, beide richtingen, €109 → €129.
-- Verder NIETS: geen andere prijzen, geen active-vlag, geen staged routes.
--
-- ── DEEL 2 — commercieel besluit ───────────────────────────────────────────
-- Amsterdam → Rotterdam was de enige route die op echte reistijden onder de
-- margedrempel zakte: 16,5% bij €109. De afstand klopte vrijwel (78 → 80 km),
-- maar de reistijd stond op 65 minuten waar de werkelijkheid 70 is.
--
-- Beide richtingen gaan mee om asymmetrie te voorkomen. Rotterdam → Amsterdam
-- meet exact 78 km / 65 min en heeft geen afstandscorrectie nodig, maar zou bij
-- ongewijzigde €109 een zichtbaar verschil met de heenrichting opleveren. Het
-- paarmaximum van de Brain-prijzen (€129 heen, €125 terug) is €129.
--
--   route                    oud            nieuw          marge (echt)
--   Amsterdam → Rotterdam    €109 / €196    €129 / €232    16,5% → 29,5%
--   Rotterdam → Amsterdam    €109 / €196    €129 / €232    20,6% → 32,9%
--
-- Retourprijs = round(129 × 1,8) = 232, conform de bestaande conventie.
-- Vastgesteld door de eigenaar op 2026-07-19.
--
-- Rotterdam → Rotterdam Airport blijft bewust op €39 staan. Die route komt op
-- de gecorrigeerde afstand (7 km / 9 min) op 57,9% marge en de Brain adviseert
-- €29, maar €39 voor een korte luchthaventransfer is een bewuste
-- premiumpositionering en geen margeprobleem.
--
-- ── NA TOEPASSEN ───────────────────────────────────────────────────────────
-- De gerapporteerde marge van vrijwel elke route verandert. Draai daarna
-- brain:analyze opnieuw zodat brain_route_metrics de nieuwe werkelijkheid
-- weergeeft — die tabel bevat nu nog de meting van 2026-07-07.
--
-- VEILIGHEID: deel 1 matcht op de OUDE km én minuten, deel 2 op de OUDE prijs.
-- Twee keer draaien, of een intussen met de hand gewijzigde route, raakt niets.
--
-- NIET AUTOMATISCH TOEGEPAST — eerst review, daarna supabase db push.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Deel 1: afstanden en reistijden ────────────────────────────────────────
create temporary table _fix_distance (
  pickup_slug text not null, dropoff_slug text not null,
  old_km numeric not null, old_min integer not null,
  new_km numeric not null, new_min integer not null
) on commit drop;

insert into _fix_distance (pickup_slug, dropoff_slug, old_km, old_min, new_km, new_min) values
  ('almere', 'amsterdam', 35, 35, 35, 43),
  ('almere', 'utrecht', 42, 42, 39, 48),
  ('almere-buiten', 'schiphol-airport', 44, 45, 51, 47),
  ('almere-haven', 'schiphol-airport', 40, 40, 45, 43),
  ('almere-hout', 'schiphol-airport', 45, 46, 49, 45),
  ('almere-muziekwijk', 'schiphol-airport', 41, 42, 43, 41),
  ('almere-oostvaarders', 'schiphol-airport', 47, 48, 52, 49),
  ('almere-poort', 'schiphol-airport', 39, 40, 39, 38),
  ('almere-stad-centrum', 'schiphol-airport', 40, 40, 45, 46),
  ('amsterdam', 'schiphol-airport', 22, 30, 24, 27),
  ('amsterdam', 'rotterdam-airport', 85, 70, 73, 58),
  ('amsterdam', 'rotterdam', 78, 65, 80, 70),
  ('amsterdam', 'eindhoven', 120, 90, 121, 99),
  ('amsterdam', 'den-haag', 65, 55, 64, 56),
  ('amsterdam', 'utrecht', 40, 35, 45, 45),
  ('amsterdam-centrum', 'schiphol-airport', 14, 25, 26, 31),
  ('amsterdam-noord', 'schiphol-airport', 20, 30, 30, 29),
  ('amsterdam-oost', 'schiphol-airport', 16, 28, 24, 29),
  ('amsterdam-oud-zuid-de-pijp', 'schiphol-airport', 13, 24, 17, 23),
  ('amsterdam-zuidas', 'schiphol-airport', 10, 20, 17, 20),
  ('amsterdam-zuidoost-bijlmer', 'schiphol-airport', 16, 28, 23, 25),
  ('de-uithof-science-park', 'schiphol-airport', 48, 48, 56, 52),
  ('den-haag', 'schiphol-airport', 43, 45, 48, 45),
  ('leidsche-rijn', 'schiphol-airport', 40, 40, 45, 42),
  ('rotterdam', 'schiphol-airport', 80, 65, 61, 54),
  ('rotterdam', 'rotterdam-airport', 12, 20, 7, 9),
  ('rotterdam', 'utrecht', 55, 50, 62, 55),
  ('rotterdam', 'den-haag', 25, 30, 23, 25),
  ('utrecht', 'amsterdam', 40, 40, 44, 44),
  ('utrecht-centrum', 'schiphol-airport', 44, 44, 51, 49);

update public.fixed_route_prices f
set distance_km            = d.new_km,
    estimated_duration_min = d.new_min,
    updated_at             = now()
from _fix_distance d
join public.locations pl on pl.slug = d.pickup_slug
join public.locations dl on dl.slug = d.dropoff_slug
where f.pickup_location_id  = pl.id
  and f.dropoff_location_id = dl.id
  and f.active              = true
  and f.distance_km            = d.old_km
  and f.estimated_duration_min = d.old_min;

-- ── Deel 2: Amsterdam ↔ Rotterdam herprijzen ───────────────────────────────
create temporary table _reprice (
  pickup_slug text not null, dropoff_slug text not null,
  old_price numeric not null, new_price numeric not null, new_return numeric not null
) on commit drop;

insert into _reprice (pickup_slug, dropoff_slug, old_price, new_price, new_return) values
  ('amsterdam', 'rotterdam', 109, 129, 232),
  ('rotterdam', 'amsterdam', 109, 129, 232);

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

-- Controlequery 1 — km/min (moet 30 gecorrigeerde routes tonen):
--
--   select pl.slug, dl.slug, f.distance_km, f.estimated_duration_min
--   from public.fixed_route_prices f
--   join public.locations pl on pl.id = f.pickup_location_id
--   join public.locations dl on dl.id = f.dropoff_location_id
--   where f.active order by pl.slug, dl.slug;
--
-- Controlequery 2 — prijzen (moet exact 2 rijen à €129 / €232 geven):
--
--   select pl.slug, dl.slug, f.price, f.return_price
--   from public.fixed_route_prices f
--   join public.locations pl on pl.id = f.pickup_location_id
--   join public.locations dl on dl.id = f.dropoff_location_id
--   where (pl.slug, dl.slug) in (('amsterdam','rotterdam'), ('rotterdam','amsterdam'));
--
-- Controlequery 3 — symmetrie (moet 0 rijen geven):
--
--   select pa.slug, da.slug, a.price, b.price
--   from public.fixed_route_prices a
--   join public.locations pa on pa.id = a.pickup_location_id
--   join public.locations da on da.id = a.dropoff_location_id
--   join public.fixed_route_prices b
--     on b.pickup_location_id = da.id and b.dropoff_location_id = pa.id
--    and b.vehicle_class_id = a.vehicle_class_id
--   where a.active and b.active and a.service_type = 'intercity'
--     and a.price <> b.price and pa.slug < da.slug;
