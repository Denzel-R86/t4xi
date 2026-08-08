BEGIN;

create sequence if not exists public.invoice_number_seq;

create table if not exists public.booking_invoice_details (
  booking_id uuid primary key references public.bookings(id) on delete restrict,
  billing_name text not null,
  billing_address text not null,
  billing_postal_code text not null,
  billing_city text not null,
  billing_country text not null default 'Nederland',
  executing_carrier_name text not null,
  invoice_number text unique,
  invoice_issued_at timestamptz,
  invoice_email_claimed_at timestamptz,
  invoice_email_sent_at timestamptz,
  invoice_email_attempts integer not null default 0 check (invoice_email_attempts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((invoice_number is null) = (invoice_issued_at is null))
);

alter table public.booking_invoice_details enable row level security;
revoke all on table public.booking_invoice_details from public, anon, authenticated;
revoke all on sequence public.invoice_number_seq from public, anon, authenticated;
grant all on table public.booking_invoice_details to service_role;
grant usage, select on sequence public.invoice_number_seq to service_role;

create or replace function public.save_booking_invoice_details(
  p_booking_id uuid,
  p_billing_name text,
  p_billing_address text,
  p_billing_postal_code text,
  p_billing_city text,
  p_billing_country text,
  p_executing_carrier_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invoice_number text;
begin
  if length(trim(coalesce(p_billing_name, ''))) < 2
     or length(trim(coalesce(p_billing_address, ''))) < 3
     or length(trim(coalesce(p_billing_postal_code, ''))) < 4
     or length(trim(coalesce(p_billing_city, ''))) < 2
     or length(trim(coalesce(p_billing_country, ''))) < 2
     or length(trim(coalesce(p_executing_carrier_name, ''))) < 2 then
    return 'invalid_input';
  end if;

  if not exists (select 1 from public.bookings where id = p_booking_id) then
    return 'not_found';
  end if;

  select d.invoice_number into v_invoice_number
    from public.booking_invoice_details d
   where d.booking_id = p_booking_id
   for update;
  if v_invoice_number is not null then return 'invoice_locked'; end if;

  insert into public.booking_invoice_details (
    booking_id, billing_name, billing_address, billing_postal_code, billing_city,
    billing_country, executing_carrier_name, updated_at
  ) values (
    p_booking_id, trim(p_billing_name), trim(p_billing_address),
    upper(replace(trim(p_billing_postal_code), ' ', '')), trim(p_billing_city),
    trim(p_billing_country), trim(p_executing_carrier_name), now()
  )
  on conflict (booking_id) do update set
    billing_name = excluded.billing_name,
    billing_address = excluded.billing_address,
    billing_postal_code = excluded.billing_postal_code,
    billing_city = excluded.billing_city,
    billing_country = excluded.billing_country,
    executing_carrier_name = excluded.executing_carrier_name,
    updated_at = now();

  return 'saved';
end;
$function$;

create or replace function public.claim_booking_invoice(
  p_booking_id uuid,
  p_payment_intent_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_booking public.bookings%rowtype;
  v_details public.booking_invoice_details%rowtype;
  v_number text;
begin
  if (p_booking_id is null) = (p_payment_intent_id is null) then
    return jsonb_build_object('status', 'invalid_lookup');
  end if;

  select b.* into v_booking from public.bookings b
   where (p_booking_id is not null and b.id = p_booking_id)
      or (p_payment_intent_id is not null and b.stripe_payment_intent_id = p_payment_intent_id)
   for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;

  select d.* into v_details from public.booking_invoice_details d
   where d.booking_id = v_booking.id
   for update;

  if v_booking.payment_status <> 'paid' or v_booking.amount_paid_cents is null
     or v_booking.paid_at is null or v_details.booking_id is null then
    return jsonb_build_object('status', 'not_ready');
  end if;
  if v_details.invoice_email_sent_at is not null then
    return jsonb_build_object('status', 'already_sent', 'invoiceNumber', v_details.invoice_number);
  end if;
  if v_details.invoice_email_claimed_at is not null
     and v_details.invoice_email_claimed_at > now() - interval '15 minutes' then
    return jsonb_build_object('status', 'busy');
  end if;

  v_number := v_details.invoice_number;
  if v_number is null then
    v_number := 'F-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.invoice_number_seq')::text, 6, '0');
  end if;

  update public.booking_invoice_details set
    invoice_number = v_number,
    invoice_issued_at = coalesce(invoice_issued_at, now()),
    invoice_email_claimed_at = now(),
    invoice_email_attempts = invoice_email_attempts + 1,
    updated_at = now()
  where booking_id = v_booking.id
  returning * into v_details;

  return jsonb_build_object(
    'status', 'claimed',
    'bookingId', v_booking.id,
    'bookingRef', v_booking.booking_ref,
    'customerName', v_booking.customer_name,
    'customerEmail', v_booking.customer_email,
    'pickup', v_booking.from_address,
    'dropoff', v_booking.to_address,
    'rideDate', v_booking.ride_date,
    'rideTime', v_booking.ride_time,
    'amountPaidCents', v_booking.amount_paid_cents,
    'currency', coalesce(v_booking.payment_currency, 'eur'),
    'paidAt', v_booking.paid_at,
    'invoiceNumber', v_details.invoice_number,
    'invoiceIssuedAt', v_details.invoice_issued_at,
    'billingName', v_details.billing_name,
    'billingAddress', v_details.billing_address,
    'billingPostalCode', v_details.billing_postal_code,
    'billingCity', v_details.billing_city,
    'billingCountry', v_details.billing_country,
    'executingCarrierName', v_details.executing_carrier_name
  );
end;
$function$;

create or replace function public.complete_booking_invoice(
  p_booking_id uuid,
  p_sent boolean
)
returns void
language sql
security definer
set search_path = ''
as $function$
  update public.booking_invoice_details set
    invoice_email_sent_at = case when p_sent then coalesce(invoice_email_sent_at, now()) else invoice_email_sent_at end,
    invoice_email_claimed_at = null,
    updated_at = now()
  where booking_id = p_booking_id;
$function$;

revoke all on function public.save_booking_invoice_details(uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.claim_booking_invoice(uuid, text) from public, anon, authenticated;
revoke all on function public.complete_booking_invoice(uuid, boolean) from public, anon, authenticated;
grant execute on function public.save_booking_invoice_details(uuid, text, text, text, text, text, text) to service_role;
grant execute on function public.claim_booking_invoice(uuid, text) to service_role;
grant execute on function public.complete_booking_invoice(uuid, boolean) to service_role;

COMMIT;
