import type { SupabaseClient } from "@supabase/supabase-js";
import { renderInvoicePdf, type InvoiceData } from "@/lib/invoices/invoice-pdf";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "T4XI <onboarding@resend.dev>";
const DEFAULT_REPLY_TO = "booking@t4xi.nl";

type Claim = InvoiceData & { status: "claimed"; bookingId: string };
type ClaimResult = Claim | { status: string; invoiceNumber?: string };

function isClaim(value: unknown): value is Claim {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return row.status === "claimed" && typeof row.bookingId === "string" &&
    typeof row.invoiceNumber === "string" && typeof row.customerEmail === "string" &&
    typeof row.amountPaidCents === "number";
}

export async function trySendInvoice(
  supabase: SupabaseClient,
  lookup: { bookingId?: string; paymentIntentId?: string }
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
    const pdf = Buffer.from(renderInvoicePdf(claim)).toString("base64");
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
        subject: `Factuur T4XI - ${claim.invoiceNumber}`,
        html: `<p>Beste ${escapeHtml(claim.billingName)},</p><p>In de bijlage vindt u de betaalde factuur voor boeking <strong>${escapeHtml(claim.bookingRef)}</strong>.</p><p>Met vriendelijke groet,<br>T4XI</p>`,
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

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
