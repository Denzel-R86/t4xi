import { createHash } from "crypto";
import type Stripe from "stripe";
import { normalizeLocale } from "@/lib/i18n/locale";
import type { Locale } from "@/i18n/routing";

/**
 * Kernlogica voor POST /api/payments/create-intent — server-trusted model
 * (stap 7.4). Testbaar zonder HTTP/Stripe/DB: de route injecteert de echte
 * Stripe-client én de Supabase-lookup/-koppeling hierin.
 *
 * TRUST-MODEL:
 *   · de client identificeert de boeking met het INTERNE `booking_id` (UUID v4).
 *     Dat is de capability/lookup-sleutel: willekeurig en niet-enumereerbaar.
 *     De publieke, sequentiële `booking_ref` (T4XI-<jaar>-<seq>) is BEWUST GEEN
 *     autorisatie meer — alleen klantcommunicatie/operationele herkenning;
 *   · de server zoekt de boeking op id en neemt het BEDRAG uit de opgeslagen
 *     `price_euros` (booking = commitrecord). Nooit een client-bedrag/currency;
 *   · na het aanmaken van de PaymentIntent wordt de koppeling
 *     (payment_intent_id ↔ boeking) SERVER-SIDE gepersisteerd. De webhook zoekt
 *     later uitsluitend op dat gepersisteerde payment_intent_id.
 */

/** RFC 4122 UUID (booking_id = uuid_generate_v4() → versie 4). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreateIntentInput = {
  bookingId: string;
  locale: Locale;
};

export type ParseResult = { ok: true; value: CreateIntentInput } | { ok: false; error: string };

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Valideert de request-body. Weigert expliciet elk client-bedrag/-status. */
export function parsePaymentRequest(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Body moet een JSON-object zijn." };
  }
  const b = body as Record<string, unknown>;

  for (const forbidden of ["amount", "currency", "price", "tax", "payment_status", "paymentIntentId", "clientSecret"]) {
    if (forbidden in b) {
      return { ok: false, error: "Bedrag, currency en betaalstatus worden server-side bepaald en mogen niet worden meegestuurd." };
    }
  }

  const bookingId = str(b.bookingId).toLowerCase();
  if (!UUID_RE.test(bookingId)) {
    return { ok: false, error: "Ongeldige boeking." };
  }
  const locale = normalizeLocale(b.locale);
  return { ok: true, value: { bookingId, locale } };
}

/** De booking-velden die de betaallaag server-side nodig heeft (uit Supabase). */
export type BookingForPayment = {
  bookingId: string;
  /** Publieke referentie — alleen voor metadata/operationele herkenning. */
  bookingRef: string;
  priceEuros: number | null;
  paymentStatus: string;
  stripePaymentIntentId: string | null;
};

export function eurosToCents(euros: number): number {
  return Math.round((euros + Number.EPSILON) * 100);
}

export type AmountResult =
  | { ok: true; amountCents: number; currency: "eur" }
  | { ok: false; code: "already_paid" | "canceled" | "no_price" };

/** Bepaalt het te betalen bedrag UITSLUITEND uit de opgeslagen boekingsprijs. */
export function bookingToAmount(booking: BookingForPayment): AmountResult {
  if (booking.paymentStatus === "paid") return { ok: false, code: "already_paid" };
  if (booking.paymentStatus === "canceled") return { ok: false, code: "canceled" };
  const price = booking.priceEuros;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return { ok: false, code: "no_price" };
  }
  const amountCents = eurosToCents(price);
  if (!Number.isInteger(amountCents) || amountCents <= 0) return { ok: false, code: "no_price" };
  return { ok: true, amountCents, currency: "eur" };
}

/**
 * Stabiele idempotency-key per boeking (UUID) + bedrag. Herhaalde
 * create-intent-calls geven dezelfde PaymentIntent terug (Stripe-replay) → één
 * PaymentIntent per boeking; kaart-retries hergebruiken dezelfde intent. Geen
 * PII in de key.
 */
export function buildIdempotencyKey(bookingId: string, amountCents: number): string {
  const hash = createHash("sha256").update(`booking:${bookingId}:${amountCents}:eur`).digest("hex");
  return `t4xi_pi_${hash}`;
}

const clamp = (v: string, max = 100): string => v.slice(0, max);

/** Veilige metadata: publieke booking_ref (operationele herkenning) + locale. Geen PII. */
export function buildMetadata(bookingRef: string, locale: Locale): Record<string, string> {
  return {
    booking_ref: clamp(bookingRef, 40),
    locale,
    amount_source: "server_stored_booking_price",
  };
}

export function sanitizeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg
    .replace(/sk_(test|live)_[A-Za-z0-9]+/g, "sk_[redacted]")
    .replace(/whsec_[A-Za-z0-9]+/g, "whsec_[redacted]")
    .replace(/pk_(test|live)_[A-Za-z0-9]+/g, "pk_[redacted]")
    .slice(0, 300);
}

export type CreateIntentFn = (
  params: Stripe.PaymentIntentCreateParams,
  options: Stripe.RequestOptions
) => Promise<Pick<Stripe.PaymentIntent, "id" | "client_secret" | "amount" | "currency">>;

/** Persisteert de koppeling booking ↔ PaymentIntent (link_booking_payment RPC, op booking_id). */
export type LinkBookingFn = (args: {
  bookingId: string;
  paymentIntentId: string;
  amountCents: number;
  currency: string;
}) => Promise<void>;

export type CreateIntentResult =
  | { ok: true; clientSecret: string; paymentIntentId: string; amount: number; currency: string }
  | { ok: false; code: "invalid_booking"; reason: "already_paid" | "canceled" | "no_price" }
  | { ok: false; code: "stripe_error"; message: string; detail: string }
  | { ok: false; code: "link_error"; message: string; detail: string };

/**
 * Orkestreert de PaymentIntent-creatie op basis van een REEDS server-side (op
 * booking_id) opgezochte boeking. Stripe én de link-RPC worden geïnjecteerd.
 */
export async function createBookingPaymentIntent(args: {
  input: CreateIntentInput;
  booking: BookingForPayment;
  createIntent: CreateIntentFn;
  linkBooking: LinkBookingFn;
}): Promise<CreateIntentResult> {
  const { booking, createIntent, linkBooking } = args;

  const amount = bookingToAmount(booking);
  if (!amount.ok) return { ok: false, code: "invalid_booking", reason: amount.code };

  const metadata = buildMetadata(booking.bookingRef, args.input.locale);
  const idempotencyKey = buildIdempotencyKey(booking.bookingId, amount.amountCents);

  let pi: Awaited<ReturnType<CreateIntentFn>>;
  try {
    pi = await createIntent(
      {
        amount: amount.amountCents,
        currency: amount.currency,
        automatic_payment_methods: { enabled: true },
        metadata,
      },
      { idempotencyKey }
    );
  } catch (e) {
    return { ok: false, code: "stripe_error", message: "Betaling kon niet worden voorbereid.", detail: sanitizeError(e) };
  }
  if (!pi.client_secret) {
    return { ok: false, code: "stripe_error", message: "Betaling kon niet worden voorbereid.", detail: "missing_client_secret" };
  }

  // Koppeling server-side persisteren VÓÓR we een clientSecret teruggeven: zonder
  // link kan de webhook de boeking niet vinden. Mislukt de link → geen betaling
  // starten (er wordt géén paid-status geclaimd; de PI vervalt vanzelf). Dankzij
  // de stabiele idempotency-key geeft een retry dezelfde PI terug (geen orphans).
  try {
    await linkBooking({ bookingId: booking.bookingId, paymentIntentId: pi.id, amountCents: amount.amountCents, currency: "eur" });
  } catch (e) {
    return { ok: false, code: "link_error", message: "Betaling kon niet worden voorbereid.", detail: sanitizeError(e) };
  }

  return { ok: true, clientSecret: pi.client_secret, paymentIntentId: pi.id, amount: pi.amount, currency: pi.currency };
}
