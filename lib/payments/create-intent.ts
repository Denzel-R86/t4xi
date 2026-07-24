import { createHash } from "crypto";
import type Stripe from "stripe";
import type { PricingQuoteResult } from "@/lib/pricing/service";
import { normalizeLocale } from "@/lib/i18n/locale";
import type { Locale } from "@/i18n/routing";

/**
 * Kernlogica voor POST /api/payments/create-intent (stap 7.2) — testbaar en
 * zonder HTTP/Stripe/DB-afhankelijkheid. De route (route.ts) doet de
 * HTTP-laag (rate-limit, body-size, content-type) en injecteert de echte
 * Stripe-client én de server-side prijsofferte hierin.
 *
 * Uitgangspunten:
 *   · het BEDRAG komt uitsluitend server-side uit de Pricing Engine
 *     (getPricingQuote); een door de client meegestuurd bedrag/currency wordt
 *     expliciet geweigerd;
 *   · de currency wordt server-side vastgezet op "eur";
 *   · metadata bevat geen persoonsgegevens (geen e-mail, telefoon, naam of vrije
 *     notities) — alleen een korte route-identificatie op slug-niveau.
 */

/** Parallel met de boekingsroute: max. 4 passagiers exclusief chauffeur → 8 hard. */
export const MAX_PERSONS = 8;
const MIN_ADDRESS_LEN = 3;
/** Formaat van een T4XI-boekingsreferentie (correlatielabel, geen bewijs van bezit). */
const BOOKING_REF_RE = /^T4-[A-Z0-9]{4,16}$/;
/**
 * RFC 4122 UUID. `attempt` MOET dit formaat hebben: een begrensde, sterke nonce
 * per checkout-sessie. Verplicht, want zonder een per-sessie nonce zou de
 * content-gebaseerde idempotency-key twee klanten met identieke ritgegevens en
 * bedrag binnen het venster naar DEZELFDE PaymentIntent kunnen samenvoegen.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RideInput = {
  pickup: string;
  dropoff: string;
  returnTrip: boolean;
  passengers: number;
  locale: Locale;
  /** Verplichte client-nonce (UUID) per checkout-sessie; basis voor de idempotency-key. */
  attempt: string;
  /** Optioneel, formaat-gevalideerd correlatielabel. Client-opgegeven, niet geverifieerd. */
  bookingReference: string | null;
};

export type ParseResult = { ok: true; value: RideInput } | { ok: false; error: string };

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Valideert de request-body met dezelfde regels als de boekingsroute (adressen
 * ≥ 3 tekens, passagiers 1..MAX_PERSONS). Weigert expliciet een client-bedrag.
 */
export function parsePaymentRequest(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Body moet een JSON-object zijn." };
  }
  const b = body as Record<string, unknown>;

  // Bedrag/currency/prijs/tax/status/Stripe-IDs komen NOOIT van de client.
  for (const forbidden of ["amount", "currency", "price", "tax", "payment_status", "paymentIntentId", "clientSecret"]) {
    if (forbidden in b) {
      return { ok: false, error: "Bedrag, currency en betaalstatus worden server-side bepaald en mogen niet worden meegestuurd." };
    }
  }

  const pickup = str(b.pickup);
  const dropoff = str(b.dropoff);
  if (pickup.length < MIN_ADDRESS_LEN) return { ok: false, error: "Ophaaladres is verplicht (min. 3 tekens)." };
  if (dropoff.length < MIN_ADDRESS_LEN) return { ok: false, error: "Bestemming is verplicht (min. 3 tekens)." };

  let passengers = 1;
  if (b.passengers !== undefined) {
    if (typeof b.passengers !== "number" || !Number.isInteger(b.passengers) || b.passengers < 1) {
      return { ok: false, error: "'passengers' moet een positief geheel getal zijn." };
    }
    if (b.passengers > MAX_PERSONS) return { ok: false, error: `Maximaal ${MAX_PERSONS} passagiers.` };
    passengers = b.passengers;
  }

  const returnTrip = b.returnTrip === true;
  const locale = normalizeLocale(b.locale);

  // Verplichte, sterke, begrensde nonce per checkout-sessie. Ontbreekt of
  // ongeldig → generieke 400 (geen detail over waarom, om niet te sturen).
  const attemptRaw = str(b.attempt);
  if (!UUID_RE.test(attemptRaw)) {
    return { ok: false, error: "Ongeldige aanvraag." };
  }
  const attempt = attemptRaw.toLowerCase();

  const refRaw = str(b.bookingReference).toUpperCase();
  const bookingReference = BOOKING_REF_RE.test(refRaw) ? refRaw : null;

  return { ok: true, value: { pickup, dropoff, returnTrip, passengers, locale, attempt, bookingReference } };
}

/**
 * Euro's → hele centen. Number.EPSILON vangt binaire representatiefouten op
 * (bv. 79.99 * 100 = 7998.9999…), zodat er geen cent verloren gaat.
 */
export function eurosToCents(euros: number): number {
  return Math.round((euros + Number.EPSILON) * 100);
}

export type AmountResult =
  | { ok: true; amountCents: number; currency: "eur" }
  | { ok: false; error: string };

/** Leidt het te betalen bedrag AF UIT de server-offerte; nooit uit clientdata. */
export function quoteToCents(quote: PricingQuoteResult): AmountResult {
  if (!quote.available) return { ok: false, error: "Geen vaste prijs voor deze route." };
  const price = quote.price;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return { ok: false, error: "Ongeldige prijs uit de Pricing Engine." };
  }
  const amountCents = eurosToCents(price);
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { ok: false, error: "Bedrag kon niet veilig worden omgerekend naar centen." };
  }
  // Currency server-side vastgezet; we vertrouwen niet op client of quote-veld.
  return { ok: true, amountCents, currency: "eur" };
}

/**
 * Deterministische idempotency-key over stabiele, genormaliseerde requestdata.
 *
 * · De VERPLICHTE `attempt`-UUID (één per checkout-sessie) is de primaire
 *   ontkoppeling: twee klanten met identieke ritgegevens en bedrag krijgen
 *   verschillende keys omdat hun sessie-UUID verschilt. Bij correct gegenereerde
 *   unieke UUID's kunnen hun betalingen daardoor praktisch niet onbedoeld naar
 *   dezelfde PaymentIntent samenvloeien; UUID-collisions zijn theoretisch
 *   mogelijk maar verwaarloosbaar.
 * · Zelfde poging (zelfde rit + bedrag + attempt) → zelfde key → Stripe
 *   dedupliceert dubbelklikken/retries binnen dezelfde sessie.
 * · Andere ritdata OF een andere geldige attempt → andere key.
 * · De ruwe adrestekst gaat WEL in de hash-invoer, maar NIET in de uitvoer: de
 *   key is een SHA-256 hash, dus er staan geen persoonsgegevens rechtstreeks in.
 * · Geen timestamp/random als basis.
 */
export function buildIdempotencyKey(input: RideInput, amountCents: number, currency: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const basis = JSON.stringify({
    p: norm(input.pickup),
    d: norm(input.dropoff),
    r: input.returnTrip,
    pax: input.passengers,
    loc: input.locale,
    amt: amountCents,
    cur: currency,
    att: input.attempt,
    ref: input.bookingReference ?? "",
  });
  const hash = createHash("sha256").update(basis).digest("hex"); // 64 hex
  return `t4xi_pi_${hash}`; // 72 tekens, ruim binnen Stripe's 255-limiet
}

const clamp = (v: string, max = 100): string => v.slice(0, max);

/**
 * Veilige metadata: korte route-identificatie op slug-niveau (stad/locatie),
 * NOOIT volledige adressen (privacygevoelig en potentieel te lang) en geen
 * persoonsgegevens.
 */
export function buildMetadata(
  input: RideInput,
  quote: Extract<PricingQuoteResult, { available: true }>
): Record<string, string> {
  const md: Record<string, string> = {
    pickup: clamp(quote.route.pickupSlug, 60),
    dropoff: clamp(quote.route.dropoffSlug, 60),
    return_trip: input.returnTrip ? "true" : "false",
    passengers: String(input.passengers),
    locale: input.locale,
    amount_source: "server_pricing_engine",
  };
  if (quote.route.label) md.route_label = clamp(quote.route.label, 100);
  if (input.bookingReference) md.booking_reference = clamp(input.bookingReference, 40);
  return md;
}

/** Verwijdert key-achtige patronen en knipt af — Stripe zet nooit een key in een
 *  message, maar we lekken defensief niets en nooit een stacktrace. */
export function sanitizeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg
    .replace(/sk_(test|live)_[A-Za-z0-9]+/g, "sk_[redacted]")
    .replace(/whsec_[A-Za-z0-9]+/g, "whsec_[redacted]")
    .replace(/pk_(test|live)_[A-Za-z0-9]+/g, "pk_[redacted]")
    .slice(0, 300);
}

/** Alleen het deel van de Stripe-client dat deze laag nodig heeft (injecteerbaar). */
export type CreateIntentFn = (
  params: Stripe.PaymentIntentCreateParams,
  options: Stripe.RequestOptions
) => Promise<Pick<Stripe.PaymentIntent, "id" | "client_secret" | "amount" | "currency">>;

export type CreateIntentResult =
  | { ok: true; clientSecret: string; paymentIntentId: string; amount: number; currency: string }
  | { ok: false; code: "invalid_quote"; message: string }
  | { ok: false; code: "stripe_error"; message: string; detail: string };

/**
 * Orkestreert de PaymentIntent-creatie op basis van een REEDS server-side
 * berekende offerte. Stripe wordt geïnjecteerd (createIntent) zodat tests geen
 * echte PaymentIntent aanmaken.
 */
export async function createRidePaymentIntent(args: {
  input: RideInput;
  quote: PricingQuoteResult;
  createIntent: CreateIntentFn;
}): Promise<CreateIntentResult> {
  const { input, quote, createIntent } = args;

  const amount = quoteToCents(quote);
  if (!amount.ok) return { ok: false, code: "invalid_quote", message: amount.error };
  if (!quote.available) return { ok: false, code: "invalid_quote", message: "Geen vaste prijs voor deze route." };

  const metadata = buildMetadata(input, quote);
  const idempotencyKey = buildIdempotencyKey(input, amount.amountCents, amount.currency);

  try {
    const pi = await createIntent(
      {
        amount: amount.amountCents,
        currency: amount.currency,
        automatic_payment_methods: { enabled: true },
        metadata,
      },
      { idempotencyKey }
    );
    if (!pi.client_secret) {
      return { ok: false, code: "stripe_error", message: "Betaling kon niet worden voorbereid.", detail: "missing_client_secret" };
    }
    return {
      ok: true,
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id,
      amount: pi.amount,
      currency: pi.currency,
    };
  } catch (e) {
    return { ok: false, code: "stripe_error", message: "Betaling kon niet worden voorbereid.", detail: sanitizeError(e) };
  }
}
