import type Stripe from "stripe";

/**
 * Pure webhook-afhandeling (stap 7.4) — testbaar zonder HTTP/Stripe/DB.
 * De route verifieert de signature en injecteert `processEvent` (de RPC).
 *
 * Event → status mapping (gedocumenteerd):
 *   payment_intent.processing      → processing
 *   payment_intent.succeeded       → paid
 *   payment_intent.payment_failed  → failed
 *   payment_intent.canceled        → canceled
 * Overige events worden veilig genegeerd (geen mutatie).
 */
export type PaymentStatus = "processing" | "paid" | "failed" | "canceled";

export const EVENT_STATUS_MAP: Record<string, PaymentStatus> = {
  "payment_intent.processing": "processing",
  "payment_intent.succeeded": "paid",
  "payment_intent.payment_failed": "failed",
  "payment_intent.canceled": "canceled",
};

export function mapEventToStatus(eventType: string): PaymentStatus | null {
  return EVENT_STATUS_MAP[eventType] ?? null;
}

export type ProcessEventFn = (args: {
  eventId: string;
  eventType: string;
  paymentIntentId: string;
  newStatus: PaymentStatus;
  amountReceivedCents: number | null;
  currency: string | null;
}) => Promise<string>;

export type WebhookOutcome =
  | { handled: true; outcome: string }
  | { handled: false; reason: "unsupported_event" };

/**
 * Verwerkt een REEDS SIGNATURE-GEVERIFIEERD event. Amount-verificatie en
 * idempotency gebeuren server-/DB-side in `processEvent` (de RPC). Voor
 * `succeeded` geven we het daadwerkelijk ontvangen bedrag mee ter verificatie.
 */
export async function handleStripeEvent(event: Stripe.Event, processEvent: ProcessEventFn): Promise<WebhookOutcome> {
  const status = mapEventToStatus(event.type);
  if (!status) return { handled: false, reason: "unsupported_event" };

  const pi = event.data.object as Stripe.PaymentIntent;
  const amountReceivedCents =
    typeof pi.amount_received === "number"
      ? pi.amount_received
      : typeof pi.amount === "number"
        ? pi.amount
        : null;

  const outcome = await processEvent({
    eventId: event.id,
    eventType: event.type,
    paymentIntentId: pi.id,
    newStatus: status,
    amountReceivedCents,
    currency: pi.currency ?? null,
  });
  return { handled: true, outcome };
}
