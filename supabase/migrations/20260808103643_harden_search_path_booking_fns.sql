-- ─────────────────────────────────────────────────────────────────────────────
-- FORWARD-ONLY correctie op 20260807140000_secure_create_booking_rpc.
--
-- Die migratie zette `SET search_path = ''` op create_booking(), maar:
--   1. de BEFORE INSERT trigger public.generate_booking_ref() erfde de lege
--      search_path en vond de ONGEKWALIFICEERDE sequence booking_ref_seq niet
--      ("relation booking_ref_seq does not exist") → elke boeking brak;
--   2. `RETURNING booking_ref, id` was ambigu met de RETURNS TABLE-outputkolommen.
--
-- Deze correctie hardt de trigger zodat een lege search_path wél werkt, en
-- herdefinieert create_booking() met een ondubbelzinnige, gekwalificeerde RETURNING.
--
-- SECURITY-CONTEXT: alleen rol `postgres` heeft CREATE op schema public
-- (anon/authenticated/service_role/authenticator = false). Onvertrouwde rollen
-- kunnen dus geen shadow-objecten in public plaatsen; met een lege search_path
-- (pg_catalog impliciet eerst) is search_path-injectie niet mogelijk.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Trigger-functie hardenen. Blijft SECURITY INVOKER (DEFINER is niet nodig:
--    de trigger draait in de context van de INSERT en heeft alleen nextval nodig).
--    Lege search_path + expliciet gekwalificeerde sequence public.booking_ref_seq.
--    `now()`/`extract`/`nextval`/`::text` zijn pg_catalog/keyword en resolven
--    impliciet (pg_catalog blijft altijd eerst doorzocht).
create or replace function public.generate_booking_ref()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.booking_ref is null or new.booking_ref = '' then
    new.booking_ref := 'T4XI-' || extract(year from now())::text || '-' || nextval('public.booking_ref_seq')::text;
  end if;
  return new;
end;
$function$;

-- Minimale rechten: een trigger-functie wordt door het systeem aangeroepen, niet
-- direct. Directe EXECUTE is voor niemand nodig.
revoke all on function public.generate_booking_ref() from public, anon, authenticated;

-- 2. create_booking() opnieuw met lege search_path en ONDUBBELZINNIGE, gekwalificeerde
--    RETURNING. Enig user-object (public.bookings) expliciet gekwalificeerd; overige
--    functies/types zijn pg_catalog/keyword-expressies (onshadowbaar via impliciete
--    pg_catalog). Body verder verbatim t.o.v. 20260720090000.
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
set search_path = ''
as $function$
declare
  v_ref       text;
  v_id        uuid;
  v_flight    text;
  v_direction text;
begin
  if length(trim(p_from_address)) < 3 then raise exception 'Ongeldig ophaaladres'; end if;
  if length(trim(p_to_address)) < 3 then raise exception 'Ongeldige bestemming'; end if;
  if length(trim(p_customer_name)) < 2 then raise exception 'Ongeldige naam'; end if;
  if p_customer_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Ongeldig e-mailadres'; end if;
  if length(regexp_replace(p_customer_phone, '[^0-9+]', '', 'g')) < 8 then raise exception 'Ongeldig telefoonnummer'; end if;
  if p_ride_date < current_date then raise exception 'Datum ligt in het verleden'; end if;

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

  insert into public.bookings (
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
  returning public.bookings.booking_ref, public.bookings.id into v_ref, v_id;

  return query select v_ref, v_id;
end;
$function$;

revoke all on function public.create_booking(
  text, text, text, date, time without time zone, text, integer, text, numeric,
  text, text, text, double precision, double precision, double precision, double precision, text, text
) from public, anon, authenticated;
grant execute on function public.create_booking(
  text, text, text, date, time without time zone, text, integer, text, numeric,
  text, text, text, double precision, double precision, double precision, double precision, text, text
) to service_role;

-- Verificatie ná toepassen:
--   -- privileges (anon/authenticated/public=false, service_role=true):
--   select r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE')
--   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--        cross join (values ('anon'),('authenticated'),('service_role')) r(rolname)
--   where n.nspname='public' and p.proname='create_booking';
--   -- lege search_path op beide functies:
--   select proname, proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and proname in ('create_booking','generate_booking_ref');
