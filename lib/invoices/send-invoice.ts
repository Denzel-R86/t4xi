import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { renderInvoiceEmail } from "@/lib/invoices/invoice-email";
import { renderInvoicePdf, type InvoiceData } from "@/lib/invoices/invoice-pdf";
import { getStripeServer } from "@/lib/payments/stripe";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "T4XI <onboarding@resend.dev>";
const DEFAULT_REPLY_TO = "booking@t4xi.nl";

type Claim = InvoiceData & {
  status: "claimed";
  bookingId: string;
  stripePaymentIntentId?: string | null;
};
type ClaimResult = Claim | { status: string; invoiceNumber?: string };

type InvoiceDependencies = {
  resolvePaymentMethod: (paymentIntentId: string | null) => Promise<string | null>;
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  ideal: "iDEAL",
  card: "Creditcard of betaalpas",
  bancontact: "Bancontact",
  sepa_debit: "SEPA-incasso",
  paypal: "PayPal",
  klarna: "Klarna",
  link: "Link",
  eps: "EPS",
};

function paymentMethodLabel(method: Stripe.PaymentMethod): string {
  if (method.type === "card") {
    const wallet = method.card?.wallet?.type;
    if (wallet === "apple_pay") return "Apple Pay";
    if (wallet === "google_pay") return "Google Pay";
  }
  return PAYMENT_METHOD_LABELS[method.type] ?? "Online betaling";
}

async function resolveStripePaymentMethod(paymentIntentId: string | null): Promise<string | null> {
  if (!paymentIntentId) return null;
  try {
    const stripe = getStripeServer();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["payment_method"],
    });
    const method = intent.payment_method;
    if (method && typeof method !== "string") return paymentMethodLabel(method);
    if (typeof method === "string") {
      return paymentMethodLabel(await stripe.paymentMethods.retrieve(method));
    }
  } catch {
    // De factuur blijft best-effort verzendbaar wanneer Stripe tijdelijk niet
    // bereikbaar is; de mail toont dan een neutrale, ware fallback.
  }
  return null;
}

function isClaim(value: unknown): value is Claim {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return row.status === "claimed" && typeof row.bookingId === "string" &&
    typeof row.invoiceNumber === "string" && typeof row.customerEmail === "string" &&
    typeof row.amountPaidCents === "number" &&
    (row.stripePaymentIntentId === undefined || typeof row.stripePaymentIntentId === "string" || row.stripePaymentIntentId === null);
}

export async function trySendInvoice(
  supabase: SupabaseClient,
  lookup: { bookingId?: string; paymentIntentId?: string },
  dependencies: InvoiceDependencies = { resolvePaymentMethod: resolveStripePaymentMethod }
): Promise<{ sent: boolean; status: string; invoiceNumber?: string }> {
  const { data, error } = await supabase.rpc("claim_booking_invoice", {
    p_booking_id: lookup.bookingId ?? null,
    p_payment_intent_id: lookup.paymentIntentId ?? null,
  });
  if (error) return { sent: false, status: "claim_error" };
  const claim = data as ClaimResult;
  if (!isClaim(claim)) {
    return { sent: claim?.status === "already_sent", status: claim?.status ?? "invalid_claim", invoiceNumber: claim?.invoiceNumber };
  }

  let sent = false;
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return { sent: false, status: "not_configured", invoiceNumber: claim.invoiceNumber };
    const stripePaymentIntentId = claim.stripePaymentIntentId ?? lookup.paymentIntentId ?? null;
    const paymentMethod = await dependencies.resolvePaymentMethod(stripePaymentIntentId);
    const invoiceData = { ...claim, paymentMethod: paymentMethod ?? "Online betaling" };
    const pdf = Buffer.from(renderInvoicePdf(invoiceData)).toString("base64");
    const mail = renderInvoiceEmail(invoiceData);
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `invoice/${claim.invoiceNumber}`,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || DEFAULT_FROM,
        to: claim.customerEmail,
        reply_to: DEFAULT_REPLY_TO,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        attachments: [{ filename: `factuur-${claim.invoiceNumber}.pdf`, content: pdf }],
      }),
      cache: "no-store",
    });
    sent = response.ok;
    return { sent, status: sent ? "sent" : `resend_${response.status}`, invoiceNumber: claim.invoiceNumber };
  } catch {
    return { sent: false, status: "send_error", invoiceNumber: claim.invoiceNumber };
  } finally {
    // After a successful Resend response, prefer retrying the database marker
    // over sending the same invoice again on a later webhook invocation.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const completion = await supabase.rpc("complete_booking_invoice", {
        p_booking_id: claim.bookingId,
        p_sent: sent,
      });
      if (!completion.error) break;
    }
  }
}
