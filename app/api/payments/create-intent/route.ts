import { NextResponse } from "next/server";
import { getPricingQuote } from "@/lib/pricing/service";
import { getStripeServer, isStripeConfigured } from "@/lib/payments/stripe";
import { parsePaymentRequest, createRidePaymentIntent } from "@/lib/payments/create-intent";
import { rateLimit, clientIp } from "@/lib/security/rate-limit";

/**
 * POST /api/payments/create-intent  (stap 7.2)
 *
 * Maakt server-side een Stripe PaymentIntent voor een rit. Server-side only
 * (Node runtime, nooit gecachet). De Stripe-secret blijft server-side.
 *
 * KERNPRINCIPE: het te betalen bedrag komt UITSLUITEND uit de Pricing Engine
 * (getPricingQuote — dezelfde bron als /tarieven, /boeken en de quote-API). Een
 * door de client meegestuurd bedrag/currency/status wordt expliciet geweigerd.
 *
 * Deze route doet alleen de HTTP-laag: anti-misbruik → validatie → server-side
 * prijs → PaymentIntent. De reken- en Stripe-logica staat in
 * lib/payments/create-intent.ts (getest zonder echte Stripe/DB).
 *
 * REQUEST (application/json):
 *   pickup            string   verplicht, ≥ 3 tekens
 *   dropoff           string   verplicht, ≥ 3 tekens
 *   attempt           string   VERPLICHT — UUID (RFC 4122). De checkout-UI
 *                              genereert ÉÉN UUID per checkout-sessie en
 *                              hergebruikt die bij elke retry van diezelfde
 *                              poging; zo dedupliceren retries, terwijl twee
 *                              klanten met identieke ritgegevens bij unieke
 *                              UUID's praktisch niet dezelfde PaymentIntent
 *                              delen (UUID-collisions verwaarloosbaar).
 *   returnTrip        boolean  optioneel (default false)
 *   passengers        number   optioneel, 1..8 (default 1)
 *   locale            "nl"|"en" optioneel; ongeldig/ontbrekend → "nl"
 *   bookingReference  string   optioneel correlatielabel (T4-…); NOOIT
 *                              gebruikt als autorisatie- of eigendomsbewijs.
 *   amount/currency/price/tax/payment_status/... → expliciet GEWEIGERD (400).
 *
 * RESPONSE 200: { clientSecret, paymentIntentId, amount, currency }.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2048; // een create-intent-payload is klein
const RATE_MAX = 10; // pogingen
const RATE_WINDOW_MS = 10 * 60_000; // per 10 minuten

const isDev = process.env.NODE_ENV !== "production";

function json(status: number, payload: Record<string, unknown>) {
  return NextResponse.json(payload, { status });
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") ?? "unknown";

  // 0a. Content-type moet JSON zijn.
  const ctype = request.headers.get("content-type") ?? "";
  if (!ctype.includes("application/json")) {
    return json(415, { error: "unsupported_media_type", message: "Content-Type moet application/json zijn." });
  }

  // 0b. Payload-size guard — lees de ruwe body één keer, begrens de grootte.
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    console.warn(`[payments] payload te groot (${rawBody.length} tekens) ip=${ip}`);
    return json(413, { error: "payload_too_large", message: "Aanvraag te groot." });
  }

  // 0c. Rate limiting per IP + user-agent (elke poging telt).
  const rl = rateLimit(`payments:${ip}|${ua}`, RATE_MAX, RATE_WINDOW_MS);
  if (rl.limited) {
    console.warn(`[payments] rate-limit overschreden ip=${ip} ua="${ua.slice(0, 80)}"`);
    return NextResponse.json(
      { error: "rate_limited", message: "Te veel betaalpogingen. Probeer het over een paar minuten opnieuw." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  // 1. Body parsen.
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "invalid_input", message: "Body is geen geldige JSON." });
  }

  // 2. Valideren (client-bedrag wordt hier geweigerd; locale → nl-fallback).
  const parsed = parsePaymentRequest(body);
  if (!parsed.ok) {
    return json(400, { error: "invalid_input", message: parsed.error });
  }
  const input = parsed.value;

  // 3. Stripe geconfigureerd? Zacht falen met 503 i.p.v. een 500 met stacktrace.
  if (!isStripeConfigured()) {
    console.error("[payments] STRIPE_SECRET_KEY ontbreekt — kan geen PaymentIntent maken.");
    return json(503, { error: "unavailable", message: "Betalen is tijdelijk niet beschikbaar." });
  }

  // 4. AUTORITATIEVE prijs — server-side, zelfde engine als de rest.
  const quote = await getPricingQuote({
    pickup: input.pickup,
    dropoff: input.dropoff,
    returnTrip: input.returnTrip,
    passengers: input.passengers,
  });
  if (!quote.available) {
    // Onbekende route / geen vaste prijs → geen betaling, wel een nette 400.
    return json(400, { error: "no_quote", message: "Voor deze route is geen vaste prijs beschikbaar." });
  }

  // 5. PaymentIntent (idempotent). Stripe wordt hier geïnjecteerd.
  const stripe = getStripeServer();
  const result = await createRidePaymentIntent({
    input,
    quote,
    createIntent: (params, options) => stripe.paymentIntents.create(params, options),
  });

  if (result.ok) {
    return json(200, {
      clientSecret: result.clientSecret,
      paymentIntentId: result.paymentIntentId,
      amount: result.amount,
      currency: result.currency,
    });
  }

  if (result.code === "invalid_quote") {
    return json(400, { error: "no_quote", message: "Voor deze route is geen vaste prijs beschikbaar." });
  }

  // stripe_error → gesanitized loggen, generieke fout naar de client.
  console.error(`[payments] Stripe-fout: ${result.detail}`);
  return json(502, {
    error: "payment_provider_error",
    message: "Betaling kon niet worden voorbereid. Probeer het later opnieuw.",
    ...(isDev ? { detail: result.detail } : {}),
  });
}
