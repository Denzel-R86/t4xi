-- ───────────────────────────────────────────────────────────────────────────
-- Migratie: bookings.quote_id — koppeling booking → prijs-snapshot (PR 7.6.3D-1)
-- ───────────────────────────────────────────────────────────────────────────
-- WAAROM
--   Om de snapshot bindend te maken (quote-lock) moet een boeking naar de
--   gepersisteerde snapshot kunnen verwijzen. Deze PR legt UITSLUITEND de
--   databasekoppeling neer: een nullable kolom + FK + een uitbreiding van
--   create_booking. GEEN runtime, client, Stripe of prijswijziging (dat is 7.6.3D-2).
--
-- SCOPE & VEILIGHEID
--   PUUR ADDITIEF: nieuwe nullable kolom bookings.quote_id + FK naar
--   price_snapshots(quote_id) ON DELETE RESTRICT (een geboekte snapshot kan zo
--   nooit door de 48u-GC verwijderd worden — dwingt "geboekte snapshots nooit
--   verwijderen" op DB-niveau af). Bestaande boekingen krijgen quote_id = NULL en
--   worden niet aangeraakt.
--
--   create_booking() wordt uitgebreid met een TRAILING p_quote_id (default null).
--   Zoals in 20260720020000/20260720090000: `create or replace` met een gewijzigde
--   parameterlijst maakt een OVERLOAD — daarom wordt de bestaande 18-parameter
--   variant EERST expliciet gedropt. Geverifieerd: er bestaat nu exact één
--   signatuur met 18 parameters. De functiebody is 1-op-1 overgenomen; alleen
--   quote_id wordt aan de insert toegevoegd. Aanroepen met 18 argumenten (zonder
--   p_quote_id) blijven werken → p_quote_id defaultt naar null.
--
-- ROLLBACK:
--   begin;
--     drop function if exists public.create_booking(
--       text, text, text, date, time without time zone, text, integer, text, numeric,
--       text, text, text, double precision, double precision, double precision,
--       double precision, text, text, uuid);
--     -- daarna de 18-parameter versie herstellen uit
--     -- 20260720090000_add_flight_direction_to_bookings.sql
--     alter table public.bookings drop constraint if exists bookings_quote_id_fkey;
--     alter table public.bookings drop column if exists quote_id;
--   commit;
--
-- VALIDATIE: eerst op staging; productie nooit blind muteren.
-- ───────────────────────────────────────────────────────────────────────────

begin;

-- 1. Kolom
alter table public.bookings
  add column if not exists quote_id uuid;

comment on column public.bookings.quote_id is
  'Verwijzing naar de gepersisteerde prijs-snapshot (price_snapshots.quote_id) waarop deze boeking is vastgelegd (quote-lock, Sprint 7.6). NULL voor boekingen zonder gekoppelde snapshot (bestaande + legacy flow tot 7.6.3D-2).';

-- 2. FK → price_snapshots(quote_id) ON DELETE RESTRICT (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bookings_quote_id_fkey'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_quote_id_fkey
      foreign key (quote_id) references public.price_snapshots(quote_id)
      on delete restrict;
  end if;
end $$;

-- 3. De bestaande 18-parameter variant verwijderen vóór we de nieuwe aanmaken.
drop function if exists public.create_booking(
  text, text, text, date, time without time zone, text, integer, text, numeric,
  text, text, text, double precision, double precision, double precision, double precision, text, text
);

-- 4. create_booking() met p_quote_id (default null, achteraan). Body 1-op-1 gelijk
--    aan 20260720090000; enkel quote_id toegevoegd aan de insert.
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
  p_quote_id uuid default null
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

  -- Richting normaliseren.
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
    from_lat, from_lon, to_lat, to_lon, flight_number, flight_direction,
    quote_id
  ) values (
    coalesce(nullif(trim(p_ride_type), ''), 'direct'),
    trim(p_from_address), trim(p_to_address), p_ride_date, p_ride_time,
    nullif(trim(p_vehicle), ''), greatest(coalesce(p_persons, 1), 1), nullif(trim(p_luggage), ''),
    p_price_euros,
    trim(p_customer_name), trim(p_customer_phone), lower(trim(p_customer_email)),
    p_from_lat, p_from_lon, p_to_lat, p_to_lon, v_flight, v_direction,
    p_quote_id
  )
  returning bookings.booking_ref, bookings.id into v_ref, v_id;

  return query select v_ref, v_id;
end;
$function$;

commit;

-- Controlequeries (ná toepassen):
--   -- exact één signatuur, 19 parameters:
--   select p.pronargs from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and p.proname='create_booking';
--   -- FK aanwezig met RESTRICT:
--   select confdeltype from pg_constraint where conname='bookings_quote_id_fkey';
