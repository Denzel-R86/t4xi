import type { Locale } from "@/i18n/routing";

/**
 * Pure client-flow-logica voor de betaalstap (stap 7.3) — testbaar zonder React
 * of Stripe. De React-component (components/booking/PaymentStep.tsx) bedraadt
 * deze reducer + helpers met de Stripe-hooks en `/api/payments/create-intent`.
 *
 * KERNGARANTIES:
 *   · de client stuurt NOOIT een bedrag of currency mee; het autoritatieve
 *     bedrag komt uit de create-intent-respons (server-side uit getPricingQuote);
 *   · `attempt` is een per-poging gegenereerde UUID (crypto.randomUUID), niet
 *     door de gebruiker invoerbaar en niet zichtbaar in de UI;
 *   · na een geslaagde `confirmPayment` claimt de flow GEEN definitieve
 *     boekingsbevestiging — status "pending" tot een webhook (stap 7.4) dat
 *     server-side bevestigt.
 */

export type PaymentRide = {
  /** Alleen voor de samenvattingsweergave; NIET de prijsautoriteit. */
  pickup: string;
  dropoff: string;
  returnTrip: boolean;
  passengers: number;
  locale: Locale;
  /**
   * Server-trusted capability: het interne booking_id (UUID). create-intent
   * zoekt de boeking hierop op. De publieke, raadbare booking_ref is bewust GEEN
   * lookup-/autorisatie-sleutel.
   */
  bookingId: string;
};

/**
 * Body voor POST /api/payments/create-intent. Bevat GEEN amount/currency én
 * geen ritdata: het bedrag komt server-side uit de opgeslagen boekingsprijs;
 * de boeking wordt geïdentificeerd via het interne `bookingId` (UUID).
 */
export function buildCreateIntentBody(ride: PaymentRide): Record<string, unknown> {
  return {
    bookingId: ride.bookingId,
    locale: ride.locale,
  };
}

/** i18n-sleutels voor klantgerichte foutcopy (nooit ruwe Stripe-excepties). */
export type PaymentErrorKey =
  | "startFailed"
  | "checkDetails"
  | "couldNotComplete"
  | "rateLimited"
  | "unavailable";

/** Mapt een create-intent HTTP-status naar veilige, generieke klantcopy. */
export function mapCreateIntentError(status: number): PaymentErrorKey {
  if (status === 429) return "rateLimited";
  if (status === 503) return "unavailable";
  return "startFailed"; // 400/402/500/502/… → generiek "kon niet worden gestart"
}

/** Mapt een Stripe confirmPayment-fout naar veilige copy op basis van het TYPE. */
export function mapStripeError(errorType: string | undefined): PaymentErrorKey {
  return errorType === "validation_error" || errorType === "card_error"
    ? "checkDetails"
    : "couldNotComplete";
}

export type PaymentIntentInfo = {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
};

export type PaymentStatus =
  | "idle"
  | "creatingIntent"
  | "ready"
  | "processing"
  | "requiresAction"
  | "pending"
  // Server-gereconcilieerde eindtoestanden (stap 7.5) — alleen deze mogen een
  // definitieve betaalclaim tonen; nooit client-side confirmPayment of redirect-params.
  | "confirmed"
  | "failed"
  | "canceled"
  | "unconfirmed"; // polling-timeout: nog in behandeling

export type PaymentState = {
  status: PaymentStatus;
  intent: PaymentIntentInfo | null;
  error: { kind: "config" | "api" | "stripe"; messageKey: PaymentErrorKey } | null;
};

export const initialPaymentState: PaymentState = { status: "idle", intent: null, error: null };

export type PaymentAction =
  | { type: "createStart" }
  | { type: "createSuccess"; intent: PaymentIntentInfo }
  | { type: "createError"; kind: "config" | "api"; messageKey: PaymentErrorKey }
  | { type: "confirmStart" }
  | { type: "confirmError"; messageKey: PaymentErrorKey }
  | { type: "requiresAction" }
  | { type: "confirmPending" }
  // Reconciliation-uitkomsten uit de server-status (polling).
  | { type: "serverConfirmed" }
  | { type: "serverFailed" }
  | { type: "serverCanceled" }
  | { type: "pollTimeout" }
  | { type: "retryPayment" }
  | { type: "reset" };

/**
 * Reducer voor de betaalstap. Bewaakt onder meer dubbele submits: `confirmStart`
 * doet niets tenzij we in "ready" of "requiresAction" staan met een geldige intent.
 */
export function paymentReducer(state: PaymentState, action: PaymentAction): PaymentState {
  switch (action.type) {
    case "createStart":
      return { status: "creatingIntent", intent: null, error: null };
    case "createSuccess":
      return { status: "ready", intent: action.intent, error: null };
    case "createError":
      return { status: "idle", intent: null, error: { kind: action.kind, messageKey: action.messageKey } };
    case "confirmStart":
      // Dubbele submit / dubbelklik: alleen starten vanuit een klaarstaande intent.
      if ((state.status !== "ready" && state.status !== "requiresAction") || !state.intent) {
        return state;
      }
      return { status: "processing", intent: state.intent, error: null };
    case "requiresAction":
      if (!state.intent) return state;
      return { status: "requiresAction", intent: state.intent, error: null };
    case "confirmError":
      // Terug naar "ready" met een foutmelding, zodat de klant opnieuw kan proberen.
      if (!state.intent) return { status: "idle", intent: null, error: { kind: "stripe", messageKey: action.messageKey } };
      return { status: "ready", intent: state.intent, error: { kind: "stripe", messageKey: action.messageKey } };
    case "confirmPending":
      if (!state.intent) return state;
      return { status: "pending", intent: state.intent, error: null };
    // Reconciliation: eindtoestanden komen UITSLUITEND uit de server-status.
    case "serverConfirmed":
      return { status: "confirmed", intent: state.intent, error: null };
    case "serverFailed":
      return { status: "failed", intent: state.intent, error: null };
    case "serverCanceled":
      return { status: "canceled", intent: state.intent, error: null };
    case "pollTimeout":
      // Timeout is geen fout: betaling wordt nog verwerkt (neutraal).
      return { status: "unconfirmed", intent: state.intent, error: null };
    case "retryPayment":
      // Na 'failed' opnieuw proberen op dezelfde PaymentIntent.
      if (!state.intent) return state;
      return { status: "ready", intent: state.intent, error: null };
    case "reset":
      return initialPaymentState;
    default:
      return state;
  }
}

/** Vertaalt de server-payment_status naar de client-reconciliation-uitkomst. */
export function mapServerStatus(apiStatus: string): "confirmed" | "failed" | "canceled" | "keep" {
  if (apiStatus === "paid") return "confirmed";
  if (apiStatus === "failed") return "failed";
  if (apiStatus === "canceled") return "canceled";
  return "keep"; // unpaid / pending / processing → blijven pollen (binnen de limiet)
}

/** Polling-cadans: elke ~2,5s, maximaal ~60s. Geen oneindige polling. */
export const POLL_INTERVAL_MS = 2500;
export const POLL_MAX_MS = 60_000;

/** De betaalknop mag alleen indrukbaar zijn met een klaarstaande intent. */
export function canSubmitPayment(state: PaymentState): boolean {
  return (state.status === "ready" || state.status === "requiresAction") && state.intent !== null;
}

/** Bezig-toestanden: knop/formulier vergrendeld, geen tweede submit. */
export function isBusy(state: PaymentState): boolean {
  return state.status === "creatingIntent" || state.status === "processing";
}

/** Stripe Elements-locale (nl/en worden beide door Stripe ondersteund). */
export function elementsLocale(locale: Locale): "nl" | "en" {
  return locale === "en" ? "en" : "nl";
}

/**
 * Presentatie van het autoritatieve bedrag uit de create-intent-respons.
 * PRESENTATIE, GEEN prijsautoriteit: `amountCents`/`currency` komen uit de server.
 */
export function formatAmount(amountCents: number, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "nl-NL", {
    style: "currency",
    currency: (currency || "eur").toUpperCase(),
  }).format(amountCents / 100);
}
