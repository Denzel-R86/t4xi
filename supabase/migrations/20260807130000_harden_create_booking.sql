-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY-hardening van de BESTAANDE public.create_booking() RPC.
--
-- AANLEIDING (bewijs via rechten-/bronanalyse, GEEN misbruikboeking gemaakt):
--   create_booking is SECURITY DEFINER, heeft `p_price_euros numeric` als directe
--   parameter en INSERT die waarde ongevalideerd in bookings.price_euros. De functie
--   was uitvoerbaar door `anon` en `authenticated` (pg_proc: roles_with_execute =
--   {anon, authenticated, service_role}). Een directe PostgREST-aanroep
--   `POST /rest/v1/rpc/create_booking` als anon kon dus een ZELFGEKOZEN price_euros
--   indienen en zo een boeking met een willekeurige prijs aanmaken (RLS wordt door
--   DEFINER omzeild). De app-route berekent de prijs server-side, maar de RPC zelf
--   was direct blootgesteld.
--
-- AANROEPPLAATSEN (geverifieerd): uitsluitend server-side service-role code —
--   app/api/bookings/route.ts (no-quoteId-pad) en intern vanuit
--   create_booking_from_snapshot() (draait als owner). GEEN client/anon-aanroep.
--   Daarom is het veilig om execute in te trekken van anon/authenticated.
--
-- HARDENING:
--   1. `SET search_path = ''` (lege search_path). pg_catalog blijft altijd impliciet
--      eerst → built-in functies/types/operatoren zijn onshadowbaar en hoeven niet
--      gekwalificeerd. Het enige user-object (public.bookings) is expliciet
--      gekwalificeerd. (COALESCE/NULLIF/GREATEST/TRIM/CURRENT_DATE zijn SQL-keyword-
--      expressies, geen pg_catalog-functies, en blijven ongekwalificeerd.)
--   2. REVOKE EXECUTE van PUBLIC, anon, authenticated; GRANT alleen aan service_role.
--
-- De functie-BODY is verder ONGEWIJZIGD t.o.v. 20260720090000 (verbatim), zodat dit
-- puur een security-hardening is en geen gedragswijziging.
-- ─────────────────────────────────────────────────────────────────────────────

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
  returning booking_ref, id into v_ref, v_id;

  return query select v_ref, v_id;
end;
$function$;

-- Execute-lockdown: uitsluitend de server-side service-role. De interne aanroep
-- vanuit create_booking_from_snapshot() draait als owner (postgres) en behoudt
-- execute onafhankelijk van deze grants.
revoke all on function public.create_booking(
  text, text, text, date, time without time zone, text, integer, text, numeric,
  text, text, text, double precision, double precision, double precision, double precision, text, text
) from public, anon, authenticated;
grant execute on function public.create_booking(
  text, text, text, date, time without time zone, text, integer, text, numeric,
  text, text, text, double precision, double precision, double precision, double precision, text, text
) to service_role;

-- Verificatie ná toepassen (moet false / {service_role} geven):
--   select has_function_privilege('anon', p.oid, 'EXECUTE')
--   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and p.proname='create_booking';
