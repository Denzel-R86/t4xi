import type { Locale } from "@/i18n/routing";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 8_000;
const DEFAULT_FROM = "T4XI <onboarding@resend.dev>";
const DEFAULT_OPS = "booking@t4xi.nl";

export const LEAD_KINDS = [
  "membership",
  "ride-pass",
  "hotel",
  "partner",
  "contact-private",
  "contact-business",
] as const;
export type LeadKind = (typeof LEAD_KINDS)[number];

export type LeadField = { label: string; value: string };

export type LeadEmailData = {
  leadId: string;
  kind: LeadKind;
  locale: Locale;
  name: string;
  email: string;
  phone: string;
  fields: LeadField[];
};

const SUBJECTS: Record<LeadKind, string> = {
  membership: "Nieuwe aanvraag Airport Membership",
  "ride-pass": "Nieuwe aanvraag zakelijke rittenkaart",
  hotel: "Nieuwe aanvraag hotelpartnerschap",
  partner: "Nieuwe aanmelding chauffeur-partner",
  "contact-private": "Nieuwe particuliere contactaanvraag",
  "contact-business": "Nieuwe zakelijke contactaanvraag",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Pure renderer, zodat validatie en escaping afzonderlijk testbaar blijven. */
export function renderLeadEmail(data: LeadEmailData): { subject: string; html: string } {
  const rows = data.fields
    .map(
      ({ label, value }) => `<tr>
        <td style="padding:10px 14px 10px 0;border-bottom:1px solid #E6E2DC;color:#5F666D;font-size:12px;vertical-align:top;">${escapeHtml(label)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #E6E2DC;color:#1F2730;font-size:13px;font-weight:600;text-align:right;vertical-align:top;word-break:break-word;">${escapeHtml(value)}</td>
      </tr>`
    )
    .join("");

  return {
    subject: SUBJECTS[data.kind],
    html: `<!doctype html><html lang="nl"><body style="margin:0;background:#F5F3F1;font-family:Inter,Arial,sans-serif;color:#1F2730;">
      <div style="max-width:620px;margin:0 auto;padding:32px 16px;">
        <div style="background:#fff;border:1px solid #E6E2DC;border-top:4px solid #28313B;border-radius:16px;padding:28px;">
          <p style="margin:0 0 8px;color:#999694;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">T4XI · aanvraag ${escapeHtml(data.leadId)}</p>
          <h1 style="margin:0 0 6px;font-size:24px;line-height:1.2;">${escapeHtml(SUBJECTS[data.kind])}</h1>
          <p style="margin:0 0 22px;color:#5F666D;font-size:13px;">Taal bezoeker: ${data.locale === "en" ? "Engels" : "Nederlands"}</p>
          <table role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid #E6E2DC;">${rows}</table>
        </div>
      </div>
    </body></html>`,
  };
}

export async function sendLeadEmail(data: LeadEmailData): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[lead-email] RESEND_API_KEY ontbreekt — aanvraag niet verzonden.");
    return { sent: false, error: "unavailable" };
  }

  const mail = renderLeadEmail(data);
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `lead/${data.leadId}`,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || DEFAULT_FROM,
        to: process.env.OPS_EMAIL || DEFAULT_OPS,
        reply_to: data.email,
        subject: mail.subject,
        html: mail.html,
      }),
    });
    if (!response.ok) {
      console.error(`[lead-email] Resend gaf HTTP ${response.status}.`);
      return { sent: false, error: "provider_error" };
    }
    return { sent: true };
  } catch (error) {
    console.error("[lead-email] verzenden mislukt:", error instanceof Error ? error.message : error);
    const timedOut =
      error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return { sent: false, error: timedOut ? "timeout" : "network_error" };
  }
}
