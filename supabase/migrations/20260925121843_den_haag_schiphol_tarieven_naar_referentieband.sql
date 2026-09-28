-- Den Haag → Schiphol op de referentieband brengen (besluit eigenaar 2026-09-25).
--
-- AANLEIDING. Op gelijke afstand lag Den Haag structureel 20 tot 27 procent
-- onder de andere steden: Den Haag Centrum €89 op 49 km tegenover Almere Hout
-- €113 op diezelfde 49 km; Scheveningen €95 op 51 km tegenover Almere Buiten en
-- Utrecht Centrum, beide €110 op 51 km. Dat verschil was niet te verdedigen
-- zodra een klant twee stadspagina's naast elkaar legt.
--
-- REFERENTIEBAND. Almere en Utrecht zijn de enige steden waarvan het
-- afstandsbereik dat van Den Haag (44-53 km) overlapt. Kleinste-kwadratenfit
-- over hun tien stadsdeeltarieven: €60,76 vast + €1,001 per kilometer.
-- Nieuwe prijs = die band op de afstand van het stadsdeel, afgerond op hele
-- euro's. Retour volgt de vaste factor x1,8, eveneens afgerond.
--
-- De catch-all op stadsniveau schuift mee naar het duurste stadsdeel (€114),
-- volgens dezelfde regel als migratie `fix_catchall_schiphol_prices`. Zonder
-- die stap zou hij goedkoper worden dan elk benoemd stadsdeel.
--
-- Gemiddeld +19,9 procent. Na deze wijziging is er binnen Den Haag geen
-- omkering meer: verder is nooit goedkoper.
--
-- OUDE WAARDEN (forward-only rollback; dit project heeft geen PITR):
--   6e910158-a17f-4bc3-b636-d04f54b487de  Benoordenhout     44km  85.00 / 153.00
--   b94a5f81-d666-4bc3-aef6-7c43f367ecfd  Ypenburg          44km  85.00 / 153.00
--   54c21397-1344-4b49-8321-7f07bc008bac  Den Haag Centrum  49km  89.00 / 160.00
--   a97dc092-f396-4423-b0d3-76fa046bdfdc  Statenkwartier    50km  95.00 / 171.00
--   8af50ffd-a45b-4b25-9f2c-fe5d3a9a29d0  Scheveningen      51km  95.00 / 171.00
--   a152c35e-0a4a-45ee-b3fd-5efa27cc1d85  Loosduinen        53km  99.00 / 178.00
--   d2625b6a-d7a4-4f41-b73c-6258a9fffa55  Den Haag (stad)   48km  99.00 / 178.00
--
-- Lopende boekingen zijn niet geraakt: die hangen aan de quote-lock-snapshot.

update public.fixed_route_prices as f
set    price        = v.prijs,
       return_price = v.retour,
       updated_at   = now()
from (values
  ('6e910158-a17f-4bc3-b636-d04f54b487de'::uuid, 105.00::numeric, 189.00::numeric,  85.00::numeric),
  ('b94a5f81-d666-4bc3-aef6-7c43f367ecfd'::uuid, 105.00,          189.00,           85.00),
  ('54c21397-1344-4b49-8321-7f07bc008bac'::uuid, 110.00,          198.00,           89.00),
  ('a97dc092-f396-4423-b0d3-76fa046bdfdc'::uuid, 111.00,          200.00,           95.00),
  ('8af50ffd-a45b-4b25-9f2c-fe5d3a9a29d0'::uuid, 112.00,          202.00,           95.00),
  ('a152c35e-0a4a-45ee-b3fd-5efa27cc1d85'::uuid, 114.00,          205.00,           99.00),
  ('d2625b6a-d7a4-4f41-b73c-6258a9fffa55'::uuid, 114.00,          205.00,           99.00)
) as v(id, prijs, retour, oude_prijs)
where f.id = v.id
  and f.price = v.oude_prijs;   -- alleen wijzigen als de oude waarde nog staat
