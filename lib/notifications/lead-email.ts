import type { Locale } from "@/i18n/routing";
import { BRAND, DEFAULT_OPS, escapeHtml } from "@/lib/communication/templates/brand";
import { buildLeadHandover, handoverHtml, handoverText } from "@/lib/notifications/ops-handover";

const T4XI_PHONE = BRAND.phoneDisplay;

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

/** Waar de aanvraag over ging, in de taal van de aanvrager. */
const ACK_TOPIC: Record<LeadKind, { nl: string; en: string }> = {
  membership: { nl: "je aanvraag voor Airport Membership", en: "your Airport Membership request" },
  "ride-pass": { nl: "je aanvraag voor een zakelijke rittenkaart", en: "your business ride pass request" },
  hotel: { nl: "je aanvraag voor een hotelpartnerschap", en: "your hotel partnership request" },
  partner: { nl: "je aanmelding als chauffeur-partner", en: "your driver partner application" },
  "contact-private": { nl: "je vraag", en: "your question" },
  "contact-business": { nl: "je zakelijke vraag", en: "your business enquiry" },
};


function fieldRows(fields: LeadField[]): string {
  return fields
    .map(
      ({ label, value }) => `<tr>
        <td style="padding:10px 14px 10px 0;border-bottom:1px solid #E6E2DC;color:#5F666D;font-size:12px;vertical-align:top;">${escapeHtml(label)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #E6E2DC;color:#1F2730;font-size:13px;font-weight:600;text-align:right;vertical-align:top;word-break:break-word;">${escapeHtml(value)}</td>
      </tr>`
    )
    .join("");
}

/** Pure renderer, zodat validatie en escaping afzonderlijk testbaar blijven. */
export function renderLeadEmail(data: LeadEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = SUBJECTS[data.kind];
  const handover = buildLeadHandover({
    leadId: data.leadId,
    subject,
    name: data.name,
    email: data.email,
    phone: data.phone,
  });

  return {
    subject,
    html: `<!doctype html><html lang="nl"><body style="margin:0;background:#F5F3F1;font-family:Inter,Arial,sans-serif;color:#1F2730;">
      <div style="max-width:620px;margin:0 auto;padding:32px 16px;">
        <div style="background:#fff;border:1px solid #E6E2DC;border-top:4px solid #28313B;border-radius:16px;padding:28px;">
          <p style="margin:0 0 8px;color:#999694;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">T4XI · aanvraag ${escapeHtml(data.leadId)}</p>
          <h1 style="margin:0 0 6px;font-size:24px;line-height:1.2;">${escapeHtml(subject)}</h1>
          <p style="margin:0 0 22px;color:#5F666D;font-size:13px;">Taal bezoeker: ${data.locale === "en" ? "Engels" : "Nederlands"}</p>
          <table role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid #E6E2DC;">${fieldRows(data.fields)}</table>
          ${handoverHtml(handover, { phone: data.phone, email: data.email })}
        </div>
      </div>
    </body></html>`,
    text: [
      `T4XI OPERATIONS — ${subject}`,
      `Aanvraag: ${data.leadId}`,
      `Taal bezoeker: ${data.locale === "en" ? "Engels" : "Nederlands"}`,
      "",
      ...data.fields.map(({ label, value }) => `${label}: ${value}`),
      "",
      handoverText(handover),
    ].join("\n"),
  };
}

/**
 * Ontvangstbevestiging voor de aanvrager. Belooft alleen wat de overdracht ook
 * als taak vastlegt: een persoonlijke reactie binnen één werkdag.
 */
export function renderLeadAck(data: LeadEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const en = data.locale === "en";
  const topic = ACK_TOPIC[data.kind][en ? "en" : "nl"];
  const subject = en ? "We received your request — T4XI" : "We hebben je aanvraag ontvangen — T4XI";
  const heading = en ? "Thank you for reaching out" : "Bedankt voor je bericht";
  const body = en
    ? `Dear ${data.name}, we have received ${topic} and will reply personally within one business day. ` +
      `Your reference is ${data.leadId}.`
    : `Beste ${data.name}, we hebben ${topic} ontvangen en reageren persoonlijk binnen één werkdag. ` +
      `Je referentie is ${data.leadId}.`;
  const urgent = en
    ? `Do you need a ride sooner? Call or WhatsApp us on ${T4XI_PHONE}.`
    : `Heb je eerder vervoer nodig? Bel of WhatsApp ons op ${T4XI_PHONE}.`;

  return {
    subject,
    html: `<!doctype html><html lang="${en ? "en" : "nl"}"><body style="margin:0;background:#F5F3F1;font-family:Inter,Arial,sans-serif;color:#1F2730;">
      <div style="max-width:620px;margin:0 auto;padding:32px 16px;">
        <div style="background:#fff;border:1px solid #E6E2DC;border-top:4px solid #28313B;border-radius:16px;padding:28px;">
          <p style="margin:0 0 8px;color:#999694;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">T4XI</p>
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.2;">${escapeHtml(heading)}</h1>
          <p style="margin:0 0 16px;color:#5F666D;font-size:14px;line-height:1.6;">${escapeHtml(body)}</p>
          <p style="margin:0;color:#5F666D;font-size:13px;line-height:1.6;">${escapeHtml(urgent)}</p>
        </div>
        <p style="margin:18px 0 0;text-align:center;color:#999694;font-size:11px;">T4XI · t4xi.nl · ${escapeHtml(DEFAULT_OPS)}</p>
      </div>
    </body></html>`,
    text: [heading, "", body, "", urgent, "", `T4XI · t4xi.nl · ${DEFAULT_OPS}`].join("\n"),
  };
}
