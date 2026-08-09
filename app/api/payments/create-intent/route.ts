import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getStripeServer, isStripeConfigured } from "@/lib/payments/stripe";
import {
  parsePaymentRequest,
  createBookingPaymentIntent,
  type BookingForPayment,
} from "@/lib/payments/create-intent";
import { rateLimit, clientIp } from "@/lib/security/rate-limit";

/**
 * POST /api/payments/create-intent  (stap 7.4 — server-trusted koppeling)
 *
 * Server-side only (Node runtime, nooit gecachet). De Stripe-secret en de
 * Supabase service-role key blijven server-side.
 *
 * FLOW: valideren → boeking opzoeken op het interne booking_id (UUID, capability)
 * → bedrag uit de opgeslagen `price_euros` → PaymentIntent aanmaken → koppeling
 * (payment_intent_id ↔ boeking) persisteren via link_booking_payment. Een
 * client-bedrag/currency/status wordt expliciet geweigerd. De sequentiële
 * booking_ref is bewust GEEN lookup-/autorisatie-sleutel.
 *
 * REQUEST (application/json): { bookingId: "<uuid>", locale?: "nl"|"en" }
 * RESPONSE 200: { clientSecret, paymentIntentId, amount, currency }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2048;
const RATE_MAX = 10;
const RATE_WINDOW_MS = 10 * 60_000;
const isDev = process.env.NODE_ENV !== "production";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

function json(status: number, payload: Record<string, unknown>) {
  return NextResponse.json(payload, { status, headers: NO_STORE_HEADERS });
}

/** Service-role client — uitsluitend server-side; key nooit naar de client. */
function serviceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") ?? "unknown";

  const ctype = request.headers.get("content-type") ?? "";
  if (!ctype.includes("application/json")) {
    return json(415, { error: "unsupported_media_type", message: "Content-Type moet application/json zijn." });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    console.warn(`[payments] payload te groot (${rawBody.length} tekens) ip=${ip}`);
    return json(413, { error: "payload_too_large", message: "Aanvraag te groot." });
  }

  const rl = rateLimit(`payments:${ip}|${ua}`, RATE_MAX, RATE_WINDOW_MS);
  if (rl.limited) {
    console.warn(`[payments] rate-limit overschreden ip=${ip}`);
    return NextResponse.json(
      { error: "rate_limited", message: "Te veel betaalpogingen. Probeer het over een paar minuten opnieuw." },
      {
        status: 429,
        headers: { ...NO_STORE_HEADERS, "Retry-After": String(rl.retryAfterSec) },
      }
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "invalid_input", message: "Body is geen geldige JSON." });
  }

  const parsed = parsePaymentRequest(body);
  if (!parsed.ok) return json(400, { error: "invalid_input", message: parsed.error });
  const input = parsed.value;

  if (!isStripeConfigured()) {
    console.error("[payments] STRIPE_SECRET_KEY ontbreekt — kan geen PaymentIntent maken.");
    return json(503, { error: "unavailable", message: "Betalen is tijdelijk niet beschikbaar." });
  }

  const supabase = serviceRoleClient();
  if (!supabase) {
    console.error("[payments] Supabase service-role ontbreekt.");
    return json(503, { error: "unavailable", message: "Betalen is tijdelijk niet beschikbaar." });
  }

  // Boeking server-side opzoeken op het interne UUID (capability). De
  // sequentiële booking_ref wordt hier NIET als lookup-sleutel gebruikt.
  const { data: row, error: lookupErr } = await supabase
    .from("bookings")
    .select("id, booking_ref, price_euros, payment_status, stripe_payment_intent_id")
    .eq("id", input.bookingId)
    .maybeSingle();

  if (lookupErr) {
    console.error(`[payments] booking-lookup faalde: ${lookupErr.message}`);
    return json(500, { error: "server_error", message: "Er ging iets mis." });
  }
  if (!row) {
    // Onbekend/verkeerd UUID → generieke 404, geen data-lek.
    return json(404, { error: "booking_not_found", message: "Boeking niet gevonden." });
  }

  const booking: BookingForPayment = {
    bookingId: row.id as string,
    bookingRef: row.booking_ref as string,
    priceEuros: row.price_euros === null ? null : Number(row.price_euros),
    paymentStatus: (row.payment_status as string) ?? "unpaid",
    stripePaymentIntentId: (row.stripe_payment_intent_id as string | null) ?? null,
  };

  const stripe = getStripeServer();
  const result = await createBookingPaymentIntent({
    input,
    booking,
    createIntent: (params, options) => stripe.paymentIntents.create(params, options),
    linkBooking: async ({ bookingId, paymentIntentId, amountCents, currency }) => {
      const { data, error } = await supabase.rpc("link_booking_payment", {
        p_booking_id: bookingId,
        p_payment_intent_id: paymentIntentId,
        p_amount_due_cents: amountCents,
        p_currency: currency,
      });
      if (error) throw new Error(`link_booking_payment: ${error.message}`);
      // Alleen 'linked' is succesvol. 'pi_conflict'/'already_paid'/'no_price'/
      // 'not_found' → geen betaling starten (geen clientSecret teruggeven).
      if (data !== "linked") throw new Error(`link_booking_payment outcome: ${String(data)}`);
    },
  });

  if (result.ok) {
    return json(200, {
      clientSecret: result.clientSecret,
      paymentIntentId: result.paymentIntentId,
      amount: result.amount,
      currency: result.currency,
    });
  }

  if (result.code === "invalid_booking") {
    if (result.reason === "already_paid") {
      return json(409, { error: "already_paid", message: "Deze boeking is al betaald." });
    }
    return json(400, { error: "no_payable_amount", message: "Voor deze boeking is geen betaalbaar bedrag beschikbaar." });
  }

  // stripe_error / link_error → gesanitized loggen, generieke fout naar de client.
  console.error(`[payments] ${result.code}: ${result.detail}`);
  return json(502, {
    error: "payment_provider_error",
    message: "Betaling kon niet worden voorbereid. Probeer het later opnieuw.",
    ...(isDev ? { detail: result.detail } : {}),
  });
}
