-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY-HOTFIX voor public.create_booking() — zelfstandig, los van
-- feature/distance-tariff-fallback. Primaire fix: EXECUTE-lockdown.
--
-- AANLEIDING (bewijs via rechten-/bronanalyse; GEEN misbruikboeking gemaakt):
--   create_booking is SECURITY DEFINER, heeft `p_price_euros numeric` als directe
--   parameter en INSERT die waarde ongevalideerd in bookings.price_euros. De functie
--   was uitvoerbaar door `anon` en `authenticated` → een directe PostgREST-aanroep
--   `POST /rest/v1/rpc/create_booking` als anon kon een ZELFGEKOZEN price_euros
--   indienen (DEFINER omzeilt RLS). Enige legitieme aanroep is server-side
--   service-role (app/api/bookings/route.ts). Daarom: execute intrekken van
--   anon/authenticated, alleen service_role behouden.
--
-- SEARCH_PATH — bewuste keuze voor een VASTE 'public' i.p.v. ''.
--   `SET search_path = ''` is hier NIET veilig toepasbaar: de BEFORE INSERT trigger
--   public.generate_booking_ref() heeft geen eigen search_path en verwijst
--   ongekwalificeerd naar sequence booking_ref_seq. Met een lege search_path erft
--   die trigger '' en faalt met "relation booking_ref_seq does not exist", waardoor
--   ELKE boeking breekt. Een VASTE, niet-muteerbare `search_path = public` is niet
--   kwetsbaar voor search_path-injectie (pg_catalog blijft impliciet eerst; user-
--   objecten resolven deterministisch naar public) en houdt de trigger werkend.
--   De functie-body is verbatim t.o.v. 20260720090000 — puur hardening van rechten.
--
--   Een echte lege search_path vereist eerst het harden van generate_booking_ref()
--   (eigen search_path of gekwalificeerde sequence) — aparte follow-up.
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
set search_path to 'public'
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

-- Execute-lockdown: uitsluitend de server-side service-role.
revoke all on function public.create_booking(
  text, text, text, date, time without time zone, text, integer, text, numeric,
  text, text, text, double precision, double precision, double precision, double precision, text, text
) from public, anon, authenticated;
grant execute on function public.create_booking(
  text, text, text, date, time without time zone, text, integer, text, numeric,
  text, text, text, double precision, double precision, double precision, double precision, text, text
) to service_role;

-- Verificatie ná toepassen (anon/authenticated/public = false, service_role = true):
--   select r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE')
--   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--        cross join (values ('anon'),('authenticated'),('service_role')) r(rolname)
--   where n.nspname='public' and p.proname='create_booking';
