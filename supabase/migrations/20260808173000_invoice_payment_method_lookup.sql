BEGIN;

-- Geeft de server-only factuurmailer toegang tot het reeds opgeslagen Stripe
-- PaymentIntent-ID. De mailer leest daarmee uitsluitend het type betaalmethode
-- (bijvoorbeeld iDEAL of kaart); er worden geen kaart- of rekeninggegevens in
-- Supabase opgeslagen.
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
    'stripePaymentIntentId', v_booking.stripe_payment_intent_id,
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

revoke all on function public.claim_booking_invoice(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_booking_invoice(uuid, text) to service_role;

COMMIT;
