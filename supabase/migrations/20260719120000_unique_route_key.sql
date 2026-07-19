-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: unieke routesleutel op fixed_route_prices
-- Datum: 2026-07-19
--
-- Achtergrond (Stap 10c-audit): de import-engine matchte bestaande routes met
-- een filter op active = true, terwijl de matchsleutel (pickup, dropoff,
-- vehicle_class) is. Bij het patroon "eerst inactief staged, later activeren"
-- vond de tweede import geen actieve match en voegde een TWEEDE rij toe voor
-- hetzelfde routepaar. De engine is gefixt (scripts/import-fixed-routes.ts);
-- deze index dwingt dezelfde regel op databaseniveau af, zodat geen enkel
-- ander pad (handmatige SQL, toekomstig script) alsnog duplicaten kan maken.
--
-- Één route per (pickup, dropoff, vehicle_class) — ongeacht `active`.
-- De prijsgeschiedenis zit in brain_route_metrics, niet in dubbele rijen.
--
-- VEILIGHEID: faalt bewust als er al duplicaten staan. Ruim die eerst op; de
-- controlequery hieronder laat zien welke het zijn. Op 2026-07-19 waren er 0.
--
-- NIET AUTOMATISCH TOEGEPAST — eerst review, daarna supabase db push.
-- ═══════════════════════════════════════════════════════════════════════════

-- Controlequery (vóór toepassen draaien; moet 0 rijen geven):
--
--   select pickup_location_id, dropoff_location_id, vehicle_class_id, count(*)
--   from public.fixed_route_prices
--   group by 1, 2, 3
--   having count(*) > 1;

BEGIN;

create unique index if not exists fixed_route_prices_route_key
  on public.fixed_route_prices (pickup_location_id, dropoff_location_id, vehicle_class_id);

comment on index public.fixed_route_prices_route_key is
  'Eén prijsrij per routepaar per voertuigklasse, ongeacht active. Voorkomt '
  'duplicaten bij het staged-dan-activeren importpatroon (Stap 10d).';

COMMIT;
