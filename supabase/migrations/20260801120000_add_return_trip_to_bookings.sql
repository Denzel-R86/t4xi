-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: retourgegevens bij boekingen (retourdatum/-tijd + retourvluchtnummer)
-- Datum: 2026-08-01
--
-- Achtergrond: een retourboeking legde tot nu toe alléén de heenrit vast. De
-- retourdatum, -tijd en — bij een retourrit die vanaf een luchthaven vertrekt —
-- het retourvluchtnummer hadden nergens een plek. Dispatch kon de terugrit niet
-- plannen en de aankomst van de retourvlucht niet volgen.
--
-- SCOPE: vier nullable kolommen, één CHECK-constraint, één index, en één
-- uitbreiding van create_booking(). GEEN routes, GEEN prijzen, GEEN toeslag.
--
-- ── LES UIT 20260720020000 / 20260720090000 ────────────────────────────────
-- `create or replace function` met een gewijzigde parameterlijst maakt in
-- PostgreSQL een OVERLOAD, geen vervanging. Daarom wordt de bestaande
-- 18-parameter variant hieronder EERST expliciet gedropt. Geverifieerd vóór het
-- schrijven van deze migratie: er bestaat op dit moment exact één signatuur, met
-- 18 parameters (zie 20260720090000_add_flight_direction_to_bookings.sql).
--
-- ACHTERWAARTS COMPATIBEL: de vier nieuwe parameters staan achteraan met een
-- default, dus aanroepen met 16/17/18 argumenten blijven werken. Bestaande rijen
-- krijgen NULL en worden niet aangeraakt.
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────────
--   begin;
--     drop index if exists public.bookings_return_arrival_idx;
--     alter table public.bookings drop constraint if exists bookings_return_flight_direction_check;
--     alter table public.bookings drop column if exists return_flight_direction;
--     alter table public.bookings drop column if exists return_flight_number;
--     alter table public.bookings drop column if exists return_time;
--     alter table public.bookings drop column if exists return_date;
--     drop function if exists public.create_booking(
--       text, text, text, date, time without time zone, text, integer, text, numeric,
--       text, text, text, double precision, double precision, double precision,
--       double precision, text, text, date, time without time zone, text, text);
--     -- daarna de 18-parameter versie herstellen uit
--     -- 20260720090000_add_flight_direction_to_bookings.sql
--   commit;
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Kolommen + constraint
alter table public.bookings
  add column if not exists return_date date,
  add column if not exists return_time time without time zone,
  add column if not exists return_flight_number text,
  add column if not exists return_flight_direction text;

comment on column public.bookings.return_date is
  'Datum van de retourrit. NULL bij een enkele rit.';
comment on column public.bookings.return_time is
  'Tijd van de retourrit. NULL bij een enkele rit.';
comment on column public.bookings.return_flight_number is
  'Vluchtnummer van de retourrit. Alleen gevuld wanneer de retourrit een '
  'luchthavendeel heeft; genormaliseerd (hoofdletters, geen scheidingstekens).';
comment on column public.bookings.return_flight_direction is
  'arrival = de retourrit vertrekt vanaf een luchthaven (aankomst volgen). '
  'departure = de retourrit gaat náár een luchthaven. NULL zonder retourluchthavendeel. '
  'Server-side afgeleid; de klant kiest dit niet zelf.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bookings_return_flight_direction_check'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_return_flight_direction_check
      check (return_flight_direction is null or return_flight_direction in ('arrival', 'departure'));
  end if;
end $$;

-- Dispatch filtert op retour-aankomsten: alleen die rijen indexeren.
create index if not exists bookings_return_arrival_idx
  on public.bookings (return_date, return_flight_number)
  where return_flight_direction = 'arrival';

-- 2. De bestaande 18-parameter variant verwijderen vóór we de nieuwe aanmaken.
drop function if exists public.create_booking(
  text, text, text, date, time without time zone, text, integer, text, numeric,
  text, text, text, double precision, double precision, double precision,
  double precision, text, text
);

-- 3. create_booking() met retourparameters (defaults null, achteraan)
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
  p_flight_direction text default null,
  p_return_date date default null,
  p_return_time time without time zone default null,
  p_return_flight_number text default null,
  p_return_flight_direction text default null
)
returns table(booking_ref text, booking_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ref              text;
  v_id               uuid;
  v_flight           text;
  v_direction        text;
  v_return_flight    text;
  v_return_direction text;
begin
  -- Server-side validatie (vertrouw de client nooit)
  if length(trim(p_from_address)) < 3 then raise exception 'Ongeldig ophaaladres'; end if;
  if length(trim(p_to_address)) < 3 then raise exception 'Ongeldige bestemming'; end if;
  if length(trim(p_customer_name)) < 2 then raise exception 'Ongeldige naam'; end if;
  if p_customer_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Ongeldig e-mailadres'; end if;
  if length(regexp_replace(p_customer_phone, '[^0-9+]', '', 'g')) < 8 then raise exception 'Ongeldig telefoonnummer'; end if;
  if p_ride_date < current_date then raise exception 'Datum ligt in het verleden'; end if;

  -- Heenrit-vluchtnummer normaliseren: hoofdletters, geen scheidingstekens.
  v_flight := nullif(upper(regexp_replace(coalesce(p_flight_number, ''), '[^A-Za-z0-9]', '', 'g')), '');
  if v_flight is not null and v_flight !~ '^[A-Z0-9]{2,3}[0-9]{1,4}[A-Z]?$' then
    raise exception 'Ongeldig vluchtnummer';
  end if;

  v_direction := nullif(lower(trim(coalesce(p_flight_direction, ''))), '');
  if v_direction is not null and v_direction not in ('arrival', 'departure') then
    raise exception 'Ongeldige vluchtrichting';
  end if;
  if v_direction is not null and v_flight is null then
    raise exception 'Vluchtrichting zonder vluchtnummer';
  end if;

  -- Retourvluchtnummer normaliseren + valideren (zelfde regels als de heenrit).
  v_return_flight := nullif(upper(regexp_replace(coalesce(p_return_flight_number, ''), '[^A-Za-z0-9]', '', 'g')), '');
  if v_return_flight is not null and v_return_flight !~ '^[A-Z0-9]{2,3}[0-9]{1,4}[A-Z]?$' then
    raise exception 'Ongeldig retourvluchtnummer';
  end if;

  v_return_direction := nullif(lower(trim(coalesce(p_return_flight_direction, ''))), '');
  if v_return_direction is not null and v_return_direction not in ('arrival', 'departure') then
    raise exception 'Ongeldige retourvluchtrichting';
  end if;
  if v_return_direction is not null and v_return_flight is null then
    raise exception 'Retourvluchtrichting zonder retourvluchtnummer';
  end if;

  -- Retourdatum/-tijd: samen ingevuld, en strikt later dan de heenrit.
  if p_return_date is not null and p_return_time is null then
    raise exception 'Retourdatum zonder retourtijd';
  end if;
  if p_return_date is null and p_return_time is not null then
    raise exception 'Retourtijd zonder retourdatum';
  end if;
  if p_return_date is not null then
    if (p_return_date + p_return_time) <= (p_ride_date + p_ride_time) then
      raise exception 'Retourrit moet later zijn dan de heenrit';
    end if;
  end if;

  insert into bookings (
    ride_type, from_address, to_address, ride_date, ride_time,
    vehicle, persons, luggage, price_euros,
    customer_name, customer_phone, customer_email,
    from_lat, from_lon, to_lat, to_lon, flight_number, flight_direction,
    return_date, return_time, return_flight_number, return_flight_direction
  ) values (
    coalesce(nullif(trim(p_ride_type), ''), 'direct'),
    trim(p_from_address), trim(p_to_address), p_ride_date, p_ride_time,
    nullif(trim(p_vehicle), ''), greatest(coalesce(p_persons, 1), 1), nullif(trim(p_luggage), ''),
    p_price_euros,
    trim(p_customer_name), trim(p_customer_phone), lower(trim(p_customer_email)),
    p_from_lat, p_from_lon, p_to_lat, p_to_lon, v_flight, v_direction,
    p_return_date, p_return_time, v_return_flight, v_return_direction
  )
  returning bookings.booking_ref, bookings.id into v_ref, v_id;

  return query select v_ref, v_id;
end;
$function$;

COMMIT;

-- Controlequeries (ná toepassen):
--
--   -- moet exact één rij geven, met 22 parameters:
--   select p.pronargs, pg_get_function_identity_arguments(p.oid)
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'create_booking';
--
--   -- kolommen aanwezig:
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'bookings'
--     and column_name like 'return_%';
