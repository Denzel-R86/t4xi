-- Catch-all-tarieven naar Schiphol gelijkstellen aan het duurste stadsdeel
-- van hun eigen stad.
--
-- AANLEIDING. De rijen op stadsniveau (locations.location_type = 'city') zijn de
-- terugval wanneer een adres niet op een stadsdeel uitkomt. Voor Den Haag en
-- Rotterdam dateren ze van 2026-07-05; hun stadsdelen zijn op 2026-07-19 17:31
-- aangemaakt en diezelfde avond om 23:30 opnieuw geprijsd. De catch-alls zijn
-- voor het laatst aangeraakt om 17:22 en hebben die herprijzing nooit gekregen.
-- Amsterdam is niet verouderd maar stond van meet af aan boven zijn eigen reeks.
--
-- Gevolg: een catch-all kon duurder zijn dan élk benoemd stadsdeel, ook die op
-- grotere afstand. Den Haag stond op €107 voor 48 km terwijl Loosduinen op
-- 53 km €99 kost.
--
-- REGEL. catch-all = prijs van het duurste stadsdeel van dezelfde stad. Nooit
-- goedkoper dan een benoemd stadsdeel (het adres is immers onbekend en kan in
-- de verste wijk liggen), nooit erboven. Spijkenisse voldeed hier al aan.
--
-- OUDE WAARDEN (forward-only rollback; dit project heeft geen PITR):
--   amsterdam  29f7d36c-7393-4dad-b348-ea596cbdb4cb  prijs 69.00  retour 124.00
--   den-haag   d2625b6a-d7a4-4f41-b73c-6258a9fffa55  prijs 107.00 retour 193.00
--   rotterdam  ccc1bfea-f045-4aa5-885e-4c4e0e6ca5a6  prijs 119.00 retour 214.00  (ongewijzigd)
--   spijkenisse 558908a8-3b17-4660-9c7f-4bcafb6cdb53 prijs 135.00 retour 243.00  (ongewijzigd)
--
-- Retourprijs volgt de vaste factor x1,8, afgerond op hele euro's — gelijk aan
-- het stadsdeel waar de prijs van wordt overgenomen.

update public.fixed_route_prices f
set    price        = 99.00,
       return_price = 178.00,
       updated_at   = now()
where  f.id = 'd2625b6a-d7a4-4f41-b73c-6258a9fffa55'
  and  f.price = 107.00;   -- alleen wijzigen als de oude waarde nog staat

update public.fixed_route_prices f
set    price        = 65.00,
       return_price = 117.00,
       updated_at   = now()
where  f.id = '29f7d36c-7393-4dad-b348-ea596cbdb4cb'
  and  f.price = 69.00;
