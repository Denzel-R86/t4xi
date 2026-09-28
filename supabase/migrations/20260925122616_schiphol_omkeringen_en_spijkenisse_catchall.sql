-- Laatste afwijkingen in de vaste Schipholtarieven wegwerken.
--
-- 1. OMKERINGEN. Op vier plekken kostte een stadsdeel dat VERDER van Schiphol
--    ligt minder dan een stadsdeel dat dichterbij ligt. Niet uit te leggen aan
--    een klant die twee rijen naast elkaar ziet.
--
--      Almere Haven         45km €103  <  Almere Muziekwijk 43km €105
--      Almere Stad Centrum  45km €104  <  Almere Muziekwijk 43km €105
--      Almere Buiten        51km €110  <  Almere Hout       49km €113
--      Amsterdam Centrum    26km €57   <  Amsterdam Oost    24km €60
--                                      <  Amsterdam Zuidoost 23km €60
--
--    Opgelost door de te lage rij op te trekken, niet door de hogere te
--    verlagen — zelfde richting als het besluit over Den Haag. De nieuwe
--    bedragen liggen op of vlak boven de prijscurve van hun eigen stad
--    (Almere €59,70 + €1,034/km; Amsterdam €37,97 + €0,870/km), zodat ze de
--    reeks herstellen zonder hem te verleggen.
--
--    Almere Haven en Almere Stad Centrum liggen beide op 45 km en krijgen
--    daarom dezelfde prijs.
--
-- 2. SPIJKENISSE CATCH-ALL. De terugvalprijs op stadsniveau stond op €135
--    terwijl De Akkers op 72 km €137 kost — €2 onder het duurste stadsdeel.
--    Dezelfde afwijking als bij Den Haag en Amsterdam, alleen andersom.
--    Gelijkgetrokken volgens de regel uit `fix_catchall_schiphol_prices`:
--    catch-all = duurste stadsdeel van dezelfde stad.
--
-- Retourprijs volgt overal de vaste factor x1,8, afgerond op hele euro's.
--
-- OUDE WAARDEN (forward-only rollback; dit project heeft geen PITR):
--   3a5e8e52-bbc4-444a-9047-5ae78f75f69f  Almere Haven        45km 103.00 / 185.00
--   93a7c094-10de-47f2-9ea1-0cd8e3be3db6  Almere Stad Centrum 45km 104.00 / 187.00
--   fd840338-63a2-48d9-9e8a-7ac52af06de8  Almere Buiten       51km 110.00 / 198.00
--   05289948-44f8-4b53-b58e-666e33d48a26  Amsterdam Centrum   26km  57.00 / 103.00
--   558908a8-3b17-4660-9c7f-4bcafb6cdb53  Spijkenisse (stad)  70km 135.00 / 243.00

update public.fixed_route_prices as f
set    price        = v.prijs,
       return_price = v.retour,
       updated_at   = now()
from (values
  ('3a5e8e52-bbc4-444a-9047-5ae78f75f69f'::uuid, 106.00::numeric, 191.00::numeric, 103.00::numeric),
  ('93a7c094-10de-47f2-9ea1-0cd8e3be3db6'::uuid, 106.00,          191.00,          104.00),
  ('fd840338-63a2-48d9-9e8a-7ac52af06de8'::uuid, 114.00,          205.00,          110.00),
  ('05289948-44f8-4b53-b58e-666e33d48a26'::uuid,  61.00,          110.00,           57.00),
  ('558908a8-3b17-4660-9c7f-4bcafb6cdb53'::uuid, 137.00,          247.00,          135.00)
) as v(id, prijs, retour, oude_prijs)
where f.id = v.id
  and f.price = v.oude_prijs;   -- alleen wijzigen als de oude waarde nog staat
