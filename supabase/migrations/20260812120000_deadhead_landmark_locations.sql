-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: canonieke landmark-locaties voor deadhead-activering
-- Datum: 2026-08-12
--
-- Doel: Eindhoven Airport en Designer Outlet Roermond herkenbaar maken als
-- specifieke, individuele bestemmingen zodat ze via het bestaande, veilige
-- "peripheral + eligibleForActivation"-pad geprijsd kunnen worden (zie
-- lib/pricing/deadhead-shadow.ts) — in plaats van als "unknown" (nooit
-- activeerbaar). Bevat GEEN prijslogica; uitsluitend locatiedata.
--
-- Veiligheidsvoorwaarden (audit, 2026-08-12):
--   · GEEN city-level `locations`-rij voor Roermond — kale "Roermond" blijft
--     "unknown"/niet-activeerbaar; alleen het specifieke outlet-gebouw
--     resolveert. (Zie lib/pricing/deadhead-activation.e2e.test.ts.)
--   · `location_type='airport'` voor Eindhoven Airport, GEEN rij in de
--     `airports`-tabel (die is uitsluitend voor vluchtmonitoring, hier bewust
--     niet toegevoegd) — `airportContext()`/de vluchtnummerplicht in
--     app/api/bookings/route.ts lezen uitsluitend `locations.location_type`.
--   · Beide locaties blijven buiten `pricing_high_demand_zones`.
--   · Idempotent (`on conflict do nothing`), maar een bestaande rij op
--     dezelfde slug met AFWIJKENDE data laat de hele migratie falen
--     (RAISE EXCEPTION → transactie rolt terug) i.p.v. stilzwijgend
--     overschrijven. Read-only tegen productie gecontroleerd (2026-08-12):
--     geen van de drie slugs bestaat al.
--
-- Rollback: de locaties op inactief zetten raakt geen andere data:
--   update public.locations set active = false
--     where slug in ('eindhoven-airport', 'designer-outlet-roermond');
--
-- NIET AUTOMATISCH TOEGEPAST — eerst review door owner, daarna pas:
--   supabase db push   (of via MCP apply_migration)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Roermond als stad — uitsluitend FK-metadata voor de outlet-locatie
--    hieronder. BEWUST GEEN city-level `locations`-rij (zie boven).
-- ─────────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (
    select 1 from public.cities
    where slug = 'roermond'
      and (name, country_code, province) is distinct from ('Roermond', 'NL', 'Limburg')
  ) then
    raise exception 'slugconflict: cities.slug=roermond bestaat al met afwijkende data';
  end if;
end $$;

insert into public.cities (name, slug, country_code, province, latitude, longitude, active)
values ('Roermond', 'roermond', 'NL', 'Limburg', 51.1942000, 6.0083000, true)
on conflict (slug) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Eindhoven Airport (PDOK-anker: Luchthavenweg 25, 5657EA Eindhoven)
-- ─────────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (
    select 1 from public.locations
    where slug = 'eindhoven-airport'
      and (name, location_type) is distinct from ('Eindhoven Airport', 'airport')
  ) then
    raise exception 'slugconflict: locations.slug=eindhoven-airport bestaat al met afwijkende data';
  end if;
end $$;

insert into public.locations (city_id, name, slug, location_type, latitude, longitude, active)
select c.id, 'Eindhoven Airport', 'eindhoven-airport', 'airport', 51.4582207, 5.3919407, true
from public.cities c
where c.slug = 'eindhoven'
on conflict (slug) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Designer Outlet Roermond (PDOK-anker: Stadsweide 2/2A, 6041TD Roermond)
-- ─────────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (
    select 1 from public.locations
    where slug = 'designer-outlet-roermond'
      and (name, location_type) is distinct from ('Designer Outlet Roermond', 'landmark')
  ) then
    raise exception 'slugconflict: locations.slug=designer-outlet-roermond bestaat al met afwijkende data';
  end if;
end $$;

insert into public.locations (city_id, name, slug, location_type, latitude, longitude, active)
select c.id, 'Designer Outlet Roermond', 'designer-outlet-roermond', 'landmark', 51.1997594, 5.9888032, true
from public.cities c
where c.slug = 'roermond'
on conflict (slug) do nothing;

COMMIT;
