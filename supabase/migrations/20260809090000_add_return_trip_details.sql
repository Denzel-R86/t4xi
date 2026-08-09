-- Bewaar de tweede helft van een retourboeking expliciet. Voorheen werd alleen
-- het tijdstip van de heenrit opgeslagen, terwijl de klant wel voor een retour
-- betaalde. De kolommen zijn nullable voor bestaande/enkele boekingen.

begin;

alter table public.bookings
  add column if not exists return_date date,
  add column if not exists return_time time without time zone,
  add column if not exists return_flight_number text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_return_schedule_complete'
  ) then
    alter table public.bookings
      add constraint bookings_return_schedule_complete
      check ((return_date is null) = (return_time is null));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'bookings_return_after_departure'
  ) then
    alter table public.bookings
      add constraint bookings_return_after_departure
      check (
        return_date is null
        or return_date > ride_date
        or (return_date = ride_date and return_time > ride_time)
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'bookings_return_flight_number_format'
  ) then
    alter table public.bookings
      add constraint bookings_return_flight_number_format
      check (
        return_flight_number is null
        or return_flight_number ~ '^[A-Z0-9]{2,3}[0-9]{1,4}[A-Z]?$'
      );
  end if;
end $$;

commit;
