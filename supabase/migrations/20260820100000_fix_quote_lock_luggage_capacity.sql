-- Herstel de bagagevalidatie van de bindende quote-lock-RPC.
--
-- De publieke formulieren kennen vier bindende categorieën. De oorspronkelijke
-- RPC miste `geen-bagage`, waardoor een normale boeking na een geldige prijslock
-- met INVALID_LUGGAGE faalde. Daarnaast geldt de operationele capaciteitsregel
-- dat drie koffers alleen bindend zijn bij maximaal drie passagiers.
--
-- Append-only vervanging: behoud dezelfde signature, lege search_path en
-- service-role-only execute-rechten als de oorspronkelijke functie.

begin;

create or replace function public.create_booking_from_snapshot(
  p_quote_id uuid,
  p_expected_fingerprint text,
  p_ride_type text,
  p_from_address text,
  p_to_address text,
  p_ride_date date,
  p_ride_time time without time zone,
  p_vehicle text,
  p_persons integer,
  p_luggage text,
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
returns table(booking_ref text, booking_id uuid, price_euros numeric, reused boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_snap          public.price_snapshots%rowtype;
  v_ref           text;
  v_id            uuid;
  v_price         numeric;
  v_max_pax       integer;
  v_max_lug       integer;
  v_persons       integer;
  v_luggage_count integer;
begin
  select *
    into v_snap
    from public.price_snapshots
    where quote_id = p_quote_id
    for update;
  if not found then
    raise exception 'QUOTE_NOT_FOUND';
  end if;

  if (v_snap.route_snapshot->>'fingerprint') is distinct from p_expected_fingerprint then
    raise exception 'QUOTE_MISMATCH';
  end if;

  if v_snap.consumed_at is not null then
    if v_snap.booking_id is null then
      raise exception 'QUOTE_CONSUMED_NO_BOOKING';
    end if;
    select b.booking_ref, b.id, b.price_euros
      into v_ref, v_id, v_price
      from public.bookings b
      where b.id = v_snap.booking_id;
    if not found then
      raise exception 'QUOTE_CONSUMED_NO_BOOKING';
    end if;
    return query select v_ref, v_id, v_price, true;
    return;
  end if;

  if v_snap.expires_at <= pg_catalog.now() then
    raise exception 'QUOTE_EXPIRED';
  end if;
  if v_snap.pricing_source not in
     ('fixed_route_prices','dynamic','manual','hotel_rate','airport_rate','contract_rate','promotion') then
    raise exception 'QUOTE_INVALID_SOURCE';
  end if;

  select vc.max_passengers, vc.max_luggage
    into v_max_pax, v_max_lug
    from public.vehicle_classes vc
    where vc.code = (v_snap.route_snapshot->>'vehicleClass')
      and vc.active
    limit 1;
  if not found then
    raise exception 'INVALID_VEHICLE_CLASS';
  end if;

  v_persons := coalesce(p_persons, 1);
  if v_persons < 1 then
    raise exception 'INVALID_PERSONS';
  end if;
  if v_max_pax is not null and v_persons > v_max_pax then
    raise exception 'CAPACITY_EXCEEDED';
  end if;

  -- Alle en uitsluitend bindende formuliercategorieën. `overleg`, leeg en
  -- onbekend blijven fail-closed via sentinel -1.
  v_luggage_count := case lower(coalesce(trim(p_luggage), ''))
    when 'geen-bagage' then 0
    when 'handbagage'  then 0
    when '1-2-koffers' then 2
    when '3-koffers'   then 3
    else -1
  end;
  if v_luggage_count < 0 then
    raise exception 'INVALID_LUGGAGE';
  end if;
  if v_max_lug is not null and v_luggage_count > v_max_lug then
    raise exception 'CAPACITY_EXCEEDED';
  end if;
  if v_luggage_count = 3 and v_persons > 3 then
    raise exception 'CAPACITY_EXCEEDED';
  end if;

  v_price := pg_catalog.round(v_snap.total_cents::pg_catalog.numeric / 100.0, 2);

  select cb.booking_ref, cb.booking_id
    into v_ref, v_id
    from public.create_booking(
      p_ride_type, p_from_address, p_to_address, p_ride_date, p_ride_time,
      p_vehicle, p_persons, p_luggage, v_price,
      p_customer_name, p_customer_phone, p_customer_email,
      p_from_lat, p_from_lon, p_to_lat, p_to_lon, p_flight_number, p_flight_direction
    ) cb;

  update public.bookings
    set quote_id = p_quote_id
    where id = v_id;

  update public.price_snapshots
    set consumed_at = pg_catalog.now(), booking_id = v_id
    where quote_id = p_quote_id;

  return query select v_ref, v_id, v_price, false;
end;
$function$;

revoke all on function public.create_booking_from_snapshot(
  uuid, text, text, text, text, date, time without time zone, text, integer, text,
  text, text, text, double precision, double precision, double precision, double precision, text, text
) from public, anon, authenticated;

grant execute on function public.create_booking_from_snapshot(
  uuid, text, text, text, text, date, time without time zone, text, integer, text,
  text, text, text, double precision, double precision, double precision, double precision, text, text
) to service_role;

commit;
