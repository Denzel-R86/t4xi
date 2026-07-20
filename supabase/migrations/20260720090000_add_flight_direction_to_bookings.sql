-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: vluchtrichting bij boekingen (Sprint 11.1, Fase C)
-- Datum: 2026-07-20
--
-- Achtergrond: `flight_number` is richtingloos. Voor een vertrekkende vlucht is
-- het nummer planningscontext; voor een AANKOMENDE vlucht is het de operationele
-- trigger — het bepaalt wanneer de chauffeur rijdt en wanneer de inbegrepen
-- wachttijd van 60 minuten begint. Dat onderscheid was nergens vastgelegd, wat
-- rapportage en dispatch onmogelijk maakt zodra ophalingen vanaf Schiphol live gaan.
--
-- SCOPE: één nullable kolom, één CHECK-constraint, één uitbreiding van
-- create_booking(). GEEN routes, GEEN prijzen, GEEN toeslag.
--
-- ── LES UIT 20260720020000 ─────────────────────────────────────────────────
-- `create or replace function` met een gewijzigde parameterlijst maakt in
-- PostgreSQL een OVERLOAD, geen vervanging. Bij de vorige migratie bleven zo
-- twee functies achter, waarvan de oude het vluchtnummer stilzwijgend negeerde.
-- Daarom wordt de bestaande 17-parameter variant hieronder EERST expliciet
-- gedropt. Geverifieerd vóór het schrijven van deze migratie: er bestaat op dit
-- moment exact één signatuur, met 17 parameters.
--
-- ACHTERWAARTS COMPATIBEL: de nieuwe parameter staat achteraan met een default,
-- dus aanroepen met 16 of 17 argumenten blijven werken. Bestaande rijen krijgen
-- NULL en worden niet aangeraakt.
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────────
--   begin;
--     alter table public.bookings drop constraint if exists bookings_flight_direction_check;
--     alter table public.bookings drop column if exists flight_direction;
--     drop function if exists public.create_booking(
--       text, text, text, date, time without time zone, text, integer, text, numeric,
--       text, text, text, double precision, double precision, double precision,
--       double precision, text, text);
--     -- daarna de 17-parameter versie herstellen uit
--     -- 20260720020000_add_flight_number_to_bookings.sql
--   commit;
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Kolom + constraint
alter table public.bookings
  add column if not exists flight_direction text;

comment on column public.bookings.flight_direction is
  'arrival = ophalen ván een luchthaven (aankomende vlucht, wachttijd start bij '
  'geregistreerde landing). departure = brengen náár een luchthaven (vertrekkende '
  'vlucht). NULL bij ritten zonder luchthaven. Server-side afgeleid; de klant '
  'kiest dit niet zelf.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bookings_flight_direction_check'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_flight_direction_check
      check (flight_direction is null or flight_direction in ('arrival', 'departure'));
  end if;
end $$;

-- Dispatch filtert op aankomsten van vandaag: alleen die rijen indexeren.
create index if not exists bookings_arrival_idx
  on public.bookings (ride_date, flight_number)
  where flight_direction = 'arrival';

-- 2. De bestaande 17-parameter variant verwijderen vóór we de nieuwe aanmaken.
--    Zonder deze drop blijven er twee functies naast elkaar bestaan.
drop function if exists public.create_booking(
  text, text, text, date, time without time zone, text, integer, text, numeric,
  text, text, text, double precision, double precision, double precision, double precision, text
);

-- 3. create_booking() met p_flight_direction (default null, achteraan)
create or replace function public.create_booking(
  p_ride_type text,
  p_from_address text,
  p_to_address text,
  p_ride_date date,
  p_ride_time time without time zone,
  p_vehicle text,
  p_persons integer,
  p_luggage text,
  p_price_euros numeric,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_from_lat double precision default null,
  p_from_lon double precision default null,
  p_to_lat double precision default null,
  p_to_lon double precision default null,
  p_flight_number text default null,
  p_flight_direction text default null
)
returns table(booking_ref text, booking_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ref       text;
  v_id        uuid;
  v_flight    text;
  v_direction text;
begin
  -- Server-side validatie (vertrouw de client nooit)
  if length(trim(p_from_address)) < 3 then raise exception 'Ongeldig ophaaladres'; end if;
  if length(trim(p_to_address)) < 3 then raise exception 'Ongeldige bestemming'; end if;
  if length(trim(p_customer_name)) < 2 then raise exception 'Ongeldige naam'; end if;
  if p_customer_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Ongeldig e-mailadres'; end if;
  if length(regexp_replace(p_customer_phone, '[^0-9+]', '', 'g')) < 8 then raise exception 'Ongeldig telefoonnummer'; end if;
  if p_ride_date < current_date then raise exception 'Datum ligt in het verleden'; end if;

  -- Vluchtnummer normaliseren: hoofdletters, geen scheidingstekens.
  v_flight := nullif(upper(regexp_replace(coalesce(p_flight_number, ''), '[^A-Za-z0-9]', '', 'g')), '');
  if v_flight is not null and v_flight !~ '^[A-Z0-9]{2,3}[0-9]{1,4}[A-Z]?$' then
    raise exception 'Ongeldig vluchtnummer';
  end if;

  -- Richting normaliseren. De CHECK-constraint vangt de rest af, maar een
  -- duidelijke fout hier is bruikbaarder dan een constraint violation.
  v_direction := nullif(lower(trim(coalesce(p_flight_direction, ''))), '');
  if v_direction is not null and v_direction not in ('arrival', 'departure') then
    raise exception 'Ongeldige vluchtrichting';
  end if;

  -- Een richting zonder vluchtnummer is betekenisloos voor dispatch.
  if v_direction is not null and v_flight is null then
    raise exception 'Vluchtrichting zonder vluchtnummer';
  end if;

  insert into bookings (
    ride_type, from_address, to_address, ride_date, ride_time,
    vehicle, persons, luggage, price_euros,
    customer_name, customer_phone, customer_email,
    from_lat, from_lon, to_lat, to_lon, flight_number, flight_direction
  ) values (
    coalesce(nullif(trim(p_ride_type), ''), 'direct'),
    trim(p_from_address), trim(p_to_address), p_ride_date, p_ride_time,
    nullif(trim(p_vehicle), ''), greatest(coalesce(p_persons, 1), 1), nullif(trim(p_luggage), ''),
    p_price_euros,
    trim(p_customer_name), trim(p_customer_phone), lower(trim(p_customer_email)),
    p_from_lat, p_from_lon, p_to_lat, p_to_lon, v_flight, v_direction
  )
  returning bookings.booking_ref, bookings.id into v_ref, v_id;

  return query select v_ref, v_id;
end;
$function$;

COMMIT;

-- Controlequeries (ná toepassen):
--
--   -- moet exact één rij geven, met 18 parameters:
--   select p.pronargs, pg_get_function_identity_arguments(p.oid)
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'create_booking';
--
--   -- constraint aanwezig:
--   select conname from pg_constraint where conname = 'bookings_flight_direction_check';
