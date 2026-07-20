-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: vluchtnummer bij boekingen
-- Datum: 2026-07-20  (Sprint 11, Fase 0)
--
-- Achtergrond: T4XI belooft "wij volgen uw vluchtstatus en passen het ophaalmoment
-- aan wanneer uw vlucht vertraagd is". Die belofte wordt handmatig uitgevoerd door
-- de dispatch en vereist dus dat het vluchtnummer betrouwbaar wordt vastgelegd.
-- Tot nu toe was er geen veld: het formulier vroeg er niet om en de database kon
-- het niet opslaan.
--
-- Bewust NIET in `notes`: dat veld is vrije tekst en niet doorzoekbaar. Een
-- operationele belofte die afhangt van het uitpluizen van opmerkingenvelden, loopt
-- stuk op het moment dat het ertoe doet.
--
-- SCOPE: één nullable kolom en één extra defaultparameter op create_booking().
-- Geen andere databasewijzigingen.
--
-- ACHTERWAARTS COMPATIBEL: de nieuwe parameter staat achteraan met een default,
-- dus bestaande aanroepen met 16 argumenten blijven ongewijzigd werken. Bestaande
-- rijen krijgen NULL.
--
-- NORMALISATIE in de database, niet alleen in de applicatie: upper + trim, zodat
-- "kl1234" en " KL1234 " dezelfde waarde opleveren ongeacht welke client schrijft.
-- Lege invoer wordt NULL, nooit een lege string.
--
-- TERUGDRAAIEN:
--   alter table public.bookings drop column flight_number;
--   -- en create_booking() herstellen uit 20260707120000_bookings_schema_baseline.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Kolom
alter table public.bookings
  add column if not exists flight_number text;

comment on column public.bookings.flight_number is
  'Vluchtnummer bij luchthavenophalingen, genormaliseerd naar hoofdletters zonder '
  'spaties. NULL wanneer niet van toepassing. Voedt de handmatige vluchtcontrole '
  'door dispatch (Sprint 11).';

-- Index op de aankomende ritten met een vlucht: dispatch filtert hierop.
create index if not exists bookings_flight_number_idx
  on public.bookings (ride_date, flight_number)
  where flight_number is not null;

-- 2. De oude 16-parameter variant verwijderen.
--
--    LET OP: `create or replace function` met een gewijzigde parameterlijst maakt in
--    PostgreSQL een OVERLOAD, geen vervanging. Zonder deze drop blijven er twee
--    functies bestaan en resolvet een aanroep met 16 argumenten naar de oude — die
--    het vluchtnummer stilzwijgend negeert. Dat is precies het soort stille
--    afwijking dat deze migratie moet voorkomen.
--
--    Aanroepen met 16 argumenten blijven werken: de nieuwe functie heeft een default
--    op de zeventiende parameter.
drop function if exists public.create_booking(
  text, text, text, date, time without time zone, text, integer, text, numeric,
  text, text, text, double precision, double precision, double precision, double precision
);

-- 3. create_booking() uitbreiden met p_flight_number (default null, achteraan)
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
  p_flight_number text default null
)
returns table(booking_ref text, booking_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ref    text;
  v_id     uuid;
  v_flight text;
begin
  -- Server-side validatie (vertrouw de client nooit)
  if length(trim(p_from_address)) < 3 then raise exception 'Ongeldig ophaaladres'; end if;
  if length(trim(p_to_address)) < 3 then raise exception 'Ongeldige bestemming'; end if;
  if length(trim(p_customer_name)) < 2 then raise exception 'Ongeldige naam'; end if;
  if p_customer_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Ongeldig e-mailadres'; end if;
  if length(regexp_replace(p_customer_phone, '[^0-9+]', '', 'g')) < 8 then raise exception 'Ongeldig telefoonnummer'; end if;
  if p_ride_date < current_date then raise exception 'Datum ligt in het verleden'; end if;

  -- Vluchtnummer normaliseren: hoofdletters, geen spaties of koppeltekens.
  -- Bewust ruim gevalideerd (2-3 letters/cijfers + 1-4 cijfers, optioneel een
  -- letter erachter) zodat codes als KL1234, U24321, BA2760A en HV5321 passeren.
  v_flight := nullif(upper(regexp_replace(coalesce(p_flight_number, ''), '[^A-Za-z0-9]', '', 'g')), '');
  if v_flight is not null and v_flight !~ '^[A-Z0-9]{2,3}[0-9]{1,4}[A-Z]?$' then
    raise exception 'Ongeldig vluchtnummer';
  end if;

  insert into bookings (
    ride_type, from_address, to_address, ride_date, ride_time,
    vehicle, persons, luggage, price_euros,
    customer_name, customer_phone, customer_email,
    from_lat, from_lon, to_lat, to_lon, flight_number
  ) values (
    coalesce(nullif(trim(p_ride_type), ''), 'direct'),
    trim(p_from_address), trim(p_to_address), p_ride_date, p_ride_time,
    nullif(trim(p_vehicle), ''), greatest(coalesce(p_persons, 1), 1), nullif(trim(p_luggage), ''),
    p_price_euros,
    trim(p_customer_name), trim(p_customer_phone), lower(trim(p_customer_email)),
    p_from_lat, p_from_lon, p_to_lat, p_to_lon, v_flight
  )
  returning bookings.booking_ref, bookings.id into v_ref, v_id;

  return query select v_ref, v_id;
end;
$function$;

COMMIT;

-- Controlequery (ná toepassen):
--
--   select column_name from information_schema.columns
--   where table_schema='public' and table_name='bookings' and column_name='flight_number';
--
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and p.proname='create_booking' and p.pronargs=17;
