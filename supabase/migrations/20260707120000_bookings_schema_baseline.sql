-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: bookings-schema BASELINE (tracked reproductie van bestaande remote)
-- Datum: 2026-07-07  (Stap 9b)
--
-- Waarom: het bookings-schema bestond al op de remote database (aangemaakt in
-- een eerdere fase, buiten de repo-migraties om). Deze migratie legt die
-- objecten alsnog vast in versiebeheer zodat de boekingsflow reproduceerbaar is
-- (repo = source of truth). Volledig IDEMPOTENT: opnieuw toepassen op de remote
-- die deze objecten al heeft, is een no-op.
--
-- Bevat UITSLUITEND de bookings-gerelateerde objecten. Het losse address-systeem
-- (addresses, address_search_cache, popular_locations, find_nearest_addresses,
-- increment_address_usage) is aparte drift en wordt in een latere stap vastgelegd.
--
-- NIET AUTOMATISCH GEPUSHT — eerst review, daarna (met akkoord) supabase db push.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- uuid_generate_v4() vereist de uuid-ossp extensie (reeds aanwezig op remote).
create extension if not exists "uuid-ossp";

-- ── Sequence voor het booking-referentienummer ──────────────────────────────
create sequence if not exists public.booking_ref_seq start with 1000;

-- ── Tabel ───────────────────────────────────────────────────────────────────
create table if not exists public.bookings (
  id             uuid primary key default uuid_generate_v4(),
  booking_ref    text not null unique,
  ride_type      text not null default 'direct',
  from_address   text not null,
  to_address     text not null,
  from_lat       double precision,
  from_lon       double precision,
  to_lat         double precision,
  to_lon         double precision,
  ride_date      date not null,
  ride_time      time without time zone not null,
  vehicle        text,
  persons        integer default 1,
  luggage        text,
  price_euros    numeric(10, 2),
  customer_name  text not null,
  customer_phone text not null,
  customer_email text not null,
  status         text not null default 'pending',
  email_sent     boolean not null default false,
  notes          text,
  created_at     timestamptz not null default now()
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists idx_bookings_date on public.bookings (ride_date, ride_time);
create index if not exists idx_bookings_status on public.bookings (status) where status = 'pending';
create index if not exists idx_bookings_email on public.bookings (customer_email);

-- ── Trigger: genereer booking_ref (T4XI-<jaar>-<seq>) ───────────────────────
create or replace function public.generate_booking_ref()
returns trigger
language plpgsql
as $function$
begin
  if new.booking_ref is null or new.booking_ref = '' then
    new.booking_ref := 'T4XI-' || extract(year from now())::text || '-' || nextval('booking_ref_seq')::text;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_booking_ref on public.bookings;
create trigger trg_booking_ref
  before insert on public.bookings
  for each row execute function public.generate_booking_ref();

-- ── RLS: deny-by-default; service_role beheert, anon mag uitsluitend inserten ─
alter table public.bookings enable row level security;

-- LET OP: bookings_insert_anon staat een ongevalideerde anon-insert toe
-- (WITH CHECK true). De applicatie schrijft via de service-role RPC en gebruikt
-- deze policy NIET. Dichttimmeren/afvoeren = aparte hardening-stap (audit H5).
drop policy if exists "bookings_insert_anon" on public.bookings;
create policy "bookings_insert_anon" on public.bookings
  for insert to anon, authenticated
  with check (true);

drop policy if exists "bookings_service_all" on public.bookings;
create policy "bookings_service_all" on public.bookings
  for all to service_role
  using (true) with check (true);

-- ── RPC: create_booking — server-side gevalideerde insert (SECURITY DEFINER) ─
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
  p_to_lon double precision default null
)
returns table(booking_ref text, booking_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ref text;
  v_id  uuid;
begin
  -- Server-side validatie (vertrouw de client nooit)
  if length(trim(p_from_address)) < 3 then raise exception 'Ongeldig ophaaladres'; end if;
  if length(trim(p_to_address)) < 3 then raise exception 'Ongeldige bestemming'; end if;
  if length(trim(p_customer_name)) < 2 then raise exception 'Ongeldige naam'; end if;
  if p_customer_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Ongeldig e-mailadres'; end if;
  if length(regexp_replace(p_customer_phone, '[^0-9+]', '', 'g')) < 8 then raise exception 'Ongeldig telefoonnummer'; end if;
  if p_ride_date < current_date then raise exception 'Datum ligt in het verleden'; end if;

  insert into bookings (
    ride_type, from_address, to_address, ride_date, ride_time,
    vehicle, persons, luggage, price_euros,
    customer_name, customer_phone, customer_email,
    from_lat, from_lon, to_lat, to_lon
  ) values (
    coalesce(nullif(trim(p_ride_type), ''), 'direct'),
    trim(p_from_address), trim(p_to_address), p_ride_date, p_ride_time,
    nullif(trim(p_vehicle), ''), greatest(coalesce(p_persons, 1), 1), nullif(trim(p_luggage), ''),
    p_price_euros,
    trim(p_customer_name), trim(p_customer_phone), lower(trim(p_customer_email)),
    p_from_lat, p_from_lon, p_to_lat, p_to_lon
  )
  returning bookings.booking_ref, bookings.id into v_ref, v_id;

  return query select v_ref, v_id;
end;
$function$;

COMMIT;
