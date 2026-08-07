-- ─────────────────────────────────────────────────────────────────────────────
-- Booking quote-lock: transactionele, idempotente consumptie van een prijs-snapshot
-- bij het aanmaken van een boeking.
--
--   * bookings.quote_id  → nullable verwijzing naar de gelockte prijs-snapshot;
--     partiële UNIEKE index (waar quote_id niet null is) = laatste verdedigingslaag
--     tegen dubbele boekingen uit dezelfde offerte.
--   * price_snapshots.consumed_at + booking_id → snapshot wordt GEMARKEERD als
--     gebruikt en aan de boeking gekoppeld (NIET verwijderd → audit/bewijs blijft).
--   * create_booking_from_snapshot() → één transactie die de snapshot vergrendelt,
--     valideert (bestaan/vervaldatum/ongebruikt/fingerprint/bron/capaciteit), de
--     boeking met exact total_cents aanmaakt, de snapshot koppelt en bij een retry
--     dezelfde boeking teruggeeft. Bij elke fout draait alles terug: er bestaat nooit
--     een geconsumeerde snapshot zonder boeking.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Koppelvelden -------------------------------------------------------------

alter table public.bookings
  add column if not exists quote_id uuid;

alter table public.price_snapshots
  add column if not exists consumed_at timestamptz,
  add column if not exists booking_id uuid;

-- FK's (beide nullable; circulair is toegestaan). Los toevoegen zodat "if not
-- exists" via de catalog-check werkt.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_quote_id_fkey') then
    alter table public.bookings
      add constraint bookings_quote_id_fkey
      foreign key (quote_id) references public.price_snapshots(quote_id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'price_snapshots_booking_id_fkey') then
    alter table public.price_snapshots
      add constraint price_snapshots_booking_id_fkey
      foreign key (booking_id) references public.bookings(id) on delete set null;
  end if;
end $$;

-- Eén boeking per quote_id (nulls uitgezonderd → offerte-op-aanvraag/legacy mag null).
create unique index if not exists bookings_quote_id_key
  on public.bookings (quote_id) where quote_id is not null;

-- 2. Transactionele, idempotente boekingscreatie uit een snapshot -------------

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
set search_path to 'public'
as $function$
declare
  v_snap    price_snapshots%rowtype;
  v_ref     text;
  v_id      uuid;
  v_price   numeric;
  v_max_pax integer;
begin
  -- (1) Snapshot SELECTEREN + VERGRENDELEN (serialiseert gelijktijdige submits).
  select * into v_snap from price_snapshots where quote_id = p_quote_id for update;
  if not found then
    raise exception 'QUOTE_NOT_FOUND';
  end if;

  -- (3) FINGERPRINT EERST — geldt voor ZOWEL een nieuwe boeking als een retry.
  -- Zo kan het bezit van een (geconsumeerde) quoteId zonder de bijbehorende
  -- ritgegevens NOOIT de gekoppelde boeking teruggeven: geen datalek van andermans
  -- boeking-id/-referentie/-bedrag. Defense-in-depth naast de app-laag.
  if (v_snap.route_snapshot->>'fingerprint') is distinct from p_expected_fingerprint then
    raise exception 'QUOTE_MISMATCH';
  end if;

  -- (5-idempotent) Al geconsumeerd → geef DEZELFDE boeking terug (fingerprint is
  -- hierboven al gevalideerd). Geen tweede boeking, geen tweede betaling. Een
  -- gelijktijdige tweede submit belandt hier zodra de eerste transactie de lock
  -- vrijgeeft. Vervaldatum is hier NIET relevant: de boeking bestaat al.
  if v_snap.consumed_at is not null then
    if v_snap.booking_id is null then
      raise exception 'QUOTE_CONSUMED_NO_BOOKING';
    end if;
    select b.booking_ref, b.id, b.price_euros
      into v_ref, v_id, v_price
      from bookings b where b.id = v_snap.booking_id;
    if not found then
      raise exception 'QUOTE_CONSUMED_NO_BOOKING';
    end if;
    return query select v_ref, v_id, v_price, true;
    return;
  end if;

  -- (2) Nieuwe boeking: vervaldatum en prijsbron valideren.
  if v_snap.expires_at <= now() then
    raise exception 'QUOTE_EXPIRED';
  end if;
  if v_snap.pricing_source not in
     ('fixed_route_prices','dynamic','manual','hotel_rate','airport_rate','contract_rate','promotion') then
    raise exception 'QUOTE_INVALID_SOURCE';
  end if;

  -- Capaciteit server-side (vóór creatie). Onbekende klasse blokkeert niet — de
  -- prijs is al gelockt; alleen een AANTOONBARE overschrijding wordt geweigerd.
  select vc.max_passengers into v_max_pax
    from vehicle_classes vc
    where vc.code = (v_snap.route_snapshot->>'vehicleClass') and vc.active
    limit 1;
  if v_max_pax is not null and coalesce(p_persons, 1) > v_max_pax then
    raise exception 'CAPACITY_EXCEEDED';
  end if;

  -- (4) Bindende prijs = exact total_cents uit de snapshot (nooit clientinvoer).
  v_price := round(v_snap.total_cents::numeric / 100.0, 2);

  -- Boeking aanmaken via de bestaande RPC (zelfde transactie → geen duplicatie van
  -- validatie/insert). Faalt deze, dan draait ALLES terug: snapshot blijft ongebruikt.
  select cb.booking_ref, cb.booking_id
    into v_ref, v_id
    from public.create_booking(
      p_ride_type, p_from_address, p_to_address, p_ride_date, p_ride_time,
      p_vehicle, p_persons, p_luggage, v_price,
      p_customer_name, p_customer_phone, p_customer_email,
      p_from_lat, p_from_lon, p_to_lat, p_to_lon, p_flight_number, p_flight_direction
    ) cb;

  -- Koppel quote_id (unieke index = laatste verdediging tegen dubbele boeking).
  update bookings set quote_id = p_quote_id where id = v_id;

  -- (5) Snapshot markeren als gebruikt + koppelen. NIET verwijderen (audit blijft).
  update price_snapshots
    set consumed_at = now(), booking_id = v_id
    where quote_id = p_quote_id;

  return query select v_ref, v_id, v_price, false;
end;
$function$;

-- SECURITY DEFINER-verantwoording: de functie schrijft cross-table naar twee
-- deny-by-default-RLS-tabellen (bookings + price_snapshots) en roept de bestaande
-- SECURITY DEFINER create_booking() aan. DEFINER garandeert consistente,
-- owner-niveau rechten ongeacht toekomstige grant-wijzigingen, net als create_booking.
-- De WERKELIJKE toegangscontrole is de execute-lockdown hieronder: uitsluitend
-- service_role (de server-side booking-route). Er is geen anon/authenticated-pad.
revoke all on function public.create_booking_from_snapshot(
  uuid, text, text, text, text, date, time without time zone, text, integer, text,
  text, text, text, double precision, double precision, double precision, double precision, text, text
) from public, anon, authenticated;
grant execute on function public.create_booking_from_snapshot(
  uuid, text, text, text, text, date, time without time zone, text, integer, text,
  text, text, text, double precision, double precision, double precision, double precision, text, text
) to service_role;
