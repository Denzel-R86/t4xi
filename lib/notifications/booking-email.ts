/**
 * Booking-notificaties via Resend (Stap 9c) — VOLLEDIG SERVER-ONLY.
 *
 * Verstuurt na een succesvolle boeking twee mails:
 *   1. bevestiging naar de klant — tweetalig (stap 6): NL of EN, afhankelijk van
 *      de locale die met de boeking is meegestuurd en server-side gevalideerd;
 *   2. notificatie naar operations (booking@t4xi.nl) — bewust Nederlands, want
 *      intern. Aparte template, dus splitsen is veilig en raakt de klantmail niet.
 *
 * Gebruikt de Resend REST-API rechtstreeks (geen dependency, geen key naar de
 * client). Faalt nooit hard: bij ontbrekende config of een verzendfout wordt
 * dit gelogd en `sent:false` teruggegeven — de boeking zelf blijft bestaan.
 *
 * Env (server-side):
 *   RESEND_API_KEY   (verplicht om te versturen; ontbreekt → mails overgeslagen)
 *   RESEND_FROM      (afzender; default "T4XI <onboarding@resend.dev>" voor sandbox)
 *   OPS_EMAIL        (ops-ontvanger; default "booking@t4xi.nl")
 */

// SERVER-ONLY module: leest RESEND_API_KEY (geen NEXT_PUBLIC) en verstuurt
// server-side. Nooit importeren in een client component. (De idiomatische guard
// `import "server-only"` kan later, zodra dat pakket als dependency is opgenomen.)

import type { Locale } from "@/i18n/routing";
import { normalizeLocale } from "@/lib/i18n/locale";
import { renderBookingConfirmationPdf } from "@/lib/documents/booking-confirmation-pdf";

// Behoudt het bestaande export-oppervlak: de booking-route importeert
// `normalizeLocale` uit deze module. De implementatie staat sinds stap 7.2
// centraal in lib/i18n/locale, gedeeld met de betaal-endpoints.
export { normalizeLocale };

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "T4XI <onboarding@resend.dev>";
const DEFAULT_OPS = "booking@t4xi.nl";
const MONOGRAM_URL = "https://t4xi.nl/t4xi-monogram-navy.png";

const T4XI = {
  phoneDisplay: "+31 6 34 74 45 22",
  phoneHref: "+31634744522",
  whatsapp: "https://wa.me/31634744522",
  email: "booking@t4xi.nl",
};

/** Ritsoort-labels. NL voor de ops-mail; EN voor de klantmail bij locale "en". */
const RIDE_TYPE_LABELS: Record<Locale, Record<string, string>> = {
  nl: {
    enkel: "Enkele rit",
    retour: "Retour",
    luchthaven: "Luchthaven transfer",
    dagtocht: "Dagtocht",
    direct: "Rit",
  },
  en: {
    enkel: "One-way ride",
    retour: "Return",
    luchthaven: "Airport transfer",
    dagtocht: "Day trip",
    direct: "Ride",
  },
};

/** Klantgerichte teksten per locale. De ops-mail is en blijft Nederlands. */
const CUSTOMER_COPY = {
  nl: {
    lang: "nl",
    intlLocale: "nl-NL",
    subject: (ref: string) => `Je boeking bij T4XI — ${ref}`,
    preheader: "Bevestiging van je aanvraag en je referentienummer.",
    heading: "Bedankt voor je boeking",
    intro: (name: string, ref: string) =>
      `Beste ${name}, we hebben je aanvraag ontvangen. Je referentie is ` +
      `<strong style="color:${"#1F2730"};">${ref}</strong>. We bevestigen je rit zo snel mogelijk via WhatsApp of e-mail.`,
    labelReference: "Referentie",
    labelType: "Type",
    labelRoute: "Route",
    labelDate: "Datum",
    labelTime: "Tijd",
    labelPrice: "Prijs",
    labelPersons: "Passagiers",
    labelLuggage: "Bagage",
    labelFlight: "Vlucht",
    quoteOnRequest: "Offerte op aanvraag",
    returnSuffix: "retour",
    contactIntro: "Vragen of wijzigingen? Neem gerust contact op:",
    tagline: "T4XI — premium elektrisch vervoer",
  },
  en: {
    lang: "en",
    intlLocale: "en-GB",
    subject: (ref: string) => `Your T4XI booking — ${ref}`,
    preheader: "Confirmation of your request and your reference number.",
    heading: "Thank you for your booking",
    intro: (name: string, ref: string) =>
      `Dear ${name}, we have received your request. Your reference is ` +
      `<strong style="color:${"#1F2730"};">${ref}</strong>. We will confirm your ride as soon as possible via WhatsApp or email.`,
    labelReference: "Reference",
    labelType: "Type",
    labelRoute: "Route",
    labelDate: "Date",
    labelTime: "Time",
    labelPrice: "Price",
    labelPersons: "Passengers",
    labelLuggage: "Luggage",
    labelFlight: "Flight",
    quoteOnRequest: "Quote on request",
    returnSuffix: "return",
    contactIntro: "Questions or changes? Feel free to get in touch:",
    tagline: "T4XI — premium electric transport",
  },
} as const;

export type BookingEmailData = {
  bookingRef: string;
  rideType: string;
  pickup: string;
  dropoff: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  vehicle: string | null;
  persons: number;
  luggage: string | null;
  /** Vluchtnummer bij luchthavenritten; stuurt de handmatige vluchtcontrole aan. */
  flightNumber: string | null;
  /**
   * arrival = ophalen ván een luchthaven, departure = brengen náár een luchthaven.
   * Server-side afgeleid uit locations.location_type; de klant kiest dit niet.
   */
  flightDirection: "arrival" | "departure" | null;
  price: number | null;
  currency: string;
  quoteOnRequest: boolean;
  returnApplied: boolean;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  /** Taal van de klantmail. Server-side gevalideerd; ongeldig → "nl". */
  locale: Locale;
};

export type SendResult = { sent: boolean; error?: string };

// ── formatters ───────────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Ritsoort-label in de gevraagde taal (fallback op de "direct"-waarde). */
function rideTypeLabel(rideType: string, locale: Locale): string {
  const table = RIDE_TYPE_LABELS[locale];
  return table[rideType] ?? table.direct;
}

/** Datum per locale: "23 juli 2026" (nl) / "23 July 2026" (en). */
function formatDate(date: string, intlLocale: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat(intlLocale, { day: "numeric", month: "long", year: "numeric" }).format(d);
}

/** Prijs per locale; het bedrag zelf komt server-side uit de Pricing Engine. */
function formatPrice(data: BookingEmailData, intlLocale: string, quoteLabel: string, returnSuffix: string): string {
  if (data.quoteOnRequest || data.price === null) return quoteLabel;
  const priceStr = new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: data.currency || "EUR",
  }).format(data.price);
  return data.returnApplied ? `${priceStr} (${returnSuffix})` : priceStr;
}

// ── HTML-templates ───────────────────────────────────────────────────────────

const INK = "#1F2730";
const ACCENT = "#28313B";
const FOG = "#F5F3F1";
const OVERLAY = "#EEEAE5";
const STONE = "#999694";
const MUTED = "#5F666D";

function shell(opts: { title: string; inner: string; lang: string; tagline: string; preheader?: string }): string {
  const { title, inner, lang, tagline, preheader } = opts;
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>`
    : "";
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; supported-color-schemes: light; }
  @media only screen and (max-width: 620px) {
    .email-wrap { padding: 16px 10px !important; }
    .email-header { padding: 25px 22px 22px !important; }
    .email-logo { width: 54px !important; height: 53px !important; }
    .email-content { padding: 30px 22px 28px !important; }
    .email-heading { font-size: 25px !important; }
    .email-route { font-size: 15px !important; }
  }
</style></head>
<body style="margin:0;background:${FOG};font-family:Arial,Helvetica,sans-serif;color:${INK};">
  ${preheaderHtml}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:${FOG};">
    <tr><td class="email-wrap" align="center" style="padding:36px 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;">
        <tr>
          <td class="email-header" align="center" style="background:${FOG};border:1px solid #E6E2DC;border-bottom:0;border-radius:24px 24px 0 0;padding:30px 34px 27px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td align="center">
                  <img class="email-logo" src="${MONOGRAM_URL}" width="64" height="63" alt="T4XI" style="display:block;width:64px;height:63px;border:0;outline:none;object-fit:contain;color:${INK};font-size:12px;font-weight:700;">
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:${FOG};border-left:1px solid #E6E2DC;border-right:1px solid #E6E2DC;padding:0 34px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
              <td style="height:1px;background:#CBC8C4;font-size:0;line-height:0;">&nbsp;</td>
              <td style="width:52px;height:2px;background:${INK};font-size:0;line-height:0;">&nbsp;</td>
              <td style="height:1px;background:#CBC8C4;font-size:0;line-height:0;">&nbsp;</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td class="email-content" style="background:#ffffff;border:1px solid #E6E2DC;border-top:0;padding:42px 34px 38px;box-shadow:0 22px 60px rgba(31,39,48,0.08);">
            ${inner}
          </td>
        </tr>
        <tr>
          <td align="center" style="background:${INK};border-radius:0 0 24px 24px;padding:25px 22px;color:#CBC8C4;font-size:11px;line-height:1.8;">
            <span style="font-weight:700;letter-spacing:0.5px;color:${FOG};">${escapeHtml(tagline)}</span><br>
            <span style="color:${STONE};">${T4XI.phoneDisplay} &nbsp;—&nbsp; ${escapeHtml(T4XI.email)}</span>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 12px 8px 0;color:${MUTED};font-size:13px;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>
    <td style="padding:8px 0;color:${INK};font-size:14px;font-weight:600;">${value}</td>
  </tr>`;
}

function route(data: BookingEmailData): string {
  return `${escapeHtml(data.pickup)} <span style="color:${MUTED};">→</span> ${escapeHtml(data.dropoff)}`;
}

function customerHtml(data: BookingEmailData): string {
  const c = CUSTOMER_COPY[data.locale];
  const inner = `
    <div style="font-size:10px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:${STONE};margin:0 0 12px;">${escapeHtml(rideTypeLabel(data.rideType, data.locale))}</div>
    <h1 class="email-heading" style="font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:1.12;letter-spacing:-0.7px;margin:0 0 14px;color:${INK};">${escapeHtml(c.heading)}</h1>
    <p style="font-size:14px;color:${MUTED};margin:0 0 26px;line-height:1.65;">
      ${c.intro(escapeHtml(data.customerName), escapeHtml(data.bookingRef))}
    </p>
    <div style="background:${OVERLAY};border:1px solid #E2DDD5;border-radius:12px;padding:18px 20px;margin:0 0 22px;">
      <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};margin-bottom:8px;">${escapeHtml(c.labelRoute)}</div>
      <div class="email-route" style="font-size:17px;font-weight:700;line-height:1.45;color:${INK};">${route(data)}</div>
    </div>
    <table role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid #E6E2DC;">
      ${detailRow(c.labelReference, escapeHtml(data.bookingRef))}
      ${detailRow(c.labelType, escapeHtml(rideTypeLabel(data.rideType, data.locale)))}
      ${detailRow(c.labelDate, escapeHtml(formatDate(data.date, c.intlLocale)))}
      ${detailRow(c.labelTime, escapeHtml(data.time))}
      ${detailRow(c.labelPersons, String(data.persons))}
      ${detailRow(c.labelLuggage, data.luggage ? escapeHtml(data.luggage) : "—")}
      ${data.flightNumber ? detailRow(c.labelFlight, escapeHtml(data.flightNumber)) : ""}
    </table>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:${INK};border-radius:10px;margin-top:22px;">
      <tr>
        <td style="padding:16px 18px;color:#CBC8C4;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">${escapeHtml(c.labelPrice)}</td>
        <td align="right" style="padding:16px 18px;color:#ffffff;font-size:19px;font-weight:800;">${escapeHtml(formatPrice(data, c.intlLocale, c.quoteOnRequest, c.returnSuffix))}</td>
      </tr>
    </table>
    <div style="margin-top:28px;padding-top:22px;border-top:1px solid #E6E2DC;">
      <p style="font-size:13px;color:${MUTED};margin:0 0 10px;">${escapeHtml(c.contactIntro)}</p>
      <p style="margin:0;font-size:13px;line-height:1.8;">
        <a href="tel:${T4XI.phoneHref}" style="color:${ACCENT};text-decoration:none;font-weight:600;">${T4XI.phoneDisplay}</a> ·
        <a href="${T4XI.whatsapp}" style="color:${ACCENT};text-decoration:none;font-weight:600;">WhatsApp</a> ·
        <a href="mailto:${T4XI.email}" style="color:${ACCENT};text-decoration:none;font-weight:600;">${T4XI.email}</a>
      </p>
    </div>`;
  return shell({ title: c.subject(data.bookingRef), inner, lang: c.lang, tagline: c.tagline, preheader: c.preheader });
}

/** Interne ops-mail — bewust Nederlands; taalonafhankelijk van de klantkeuze. */
function opsHtml(data: BookingEmailData): string {
  const nlDate = formatDate(data.date, "nl-NL");
  const nlPrice = formatPrice(data, "nl-NL", "Offerte op aanvraag", "retour");
  const inner = `
    <h1 style="font-size:18px;margin:0 0 4px;color:${INK};">Nieuwe boeking</h1>
    <p style="font-size:13px;color:${MUTED};margin:0 0 16px;">Referentie <strong style="color:${INK};">${escapeHtml(data.bookingRef)}</strong></p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid rgba(31,39,48,0.10);">
      ${detailRow("Type", escapeHtml(rideTypeLabel(data.rideType, "nl")))}
      ${detailRow("Route", route(data))}
      ${detailRow("Datum", escapeHtml(nlDate))}
      ${detailRow("Tijd", escapeHtml(data.time))}
      ${detailRow("Prijs", escapeHtml(nlPrice))}
      ${detailRow("Taal klantmail", data.locale === "en" ? "Engels" : "Nederlands")}
      ${detailRow("Offerte op aanvraag", data.quoteOnRequest ? "Ja" : "Nee")}
      ${detailRow("Passagiers", String(data.persons))}
      ${detailRow("Bagage", data.luggage ? escapeHtml(data.luggage) : "—")}
      ${detailRow("Voertuig", data.vehicle ? escapeHtml(data.vehicle) : "—")}
      ${
        data.flightNumber
          ? detailRow(
              "Vlucht",
              `<b>${escapeHtml(data.flightNumber)}</b>` +
                (data.flightDirection === "arrival"
                  ? " &middot; AANKOMST"
                  : data.flightDirection === "departure"
                    ? " &middot; vertrek"
                    : "")
            )
          : ""
      }
      ${
        // Operationele instructie, uitsluitend bij een ophaling. Er staat bewust GEEN
        // live vluchtstatus in: er is nog geen koppeling met een vluchtdata-API, dus
        // elke "status" hier zou verzonnen zijn. Dispatch controleert handmatig.
        data.flightDirection === "arrival"
          ? detailRow(
              "Actie dispatch",
              "<b>Controleer de aankomststatus van deze vlucht.</b> Wachttijd van 60 minuten " +
                "start bij de geregistreerde landing. Stem de ophaallocatie persoonlijk af " +
                "met de klant via WhatsApp of telefoon."
            )
          : ""
      }
    </table>
    <h2 style="font-size:14px;margin:22px 0 4px;color:${INK};">Klantgegevens</h2>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid rgba(31,39,48,0.10);">
      ${detailRow("Naam", escapeHtml(data.customerName))}
      ${detailRow("Telefoon", `<a href="tel:${escapeHtml(data.customerPhone)}" style="color:${ACCENT};text-decoration:none;">${escapeHtml(data.customerPhone)}</a>`)}
      ${detailRow("E-mail", `<a href="mailto:${escapeHtml(data.customerEmail)}" style="color:${ACCENT};text-decoration:none;">${escapeHtml(data.customerEmail)}</a>`)}
    </table>`;
  return shell({ title: `Nieuwe boeking ${data.bookingRef}`, inner, lang: "nl", tagline: "T4XI — premium elektrisch vervoer" });
}

/** Rendert beide mails (subjects + HTML). Puur — handig voor test/preview. */
export function renderBookingEmails(data: BookingEmailData): {
  opsSubject: string;
  opsHtml: string;
  customerSubject: string;
  customerHtml: string;
} {
  const c = CUSTOMER_COPY[data.locale];
  return {
    opsSubject: `Nieuwe boeking ${data.bookingRef} — ${data.pickup} → ${data.dropoff}`,
    opsHtml: opsHtml(data),
    customerSubject: c.subject(data.bookingRef),
    customerHtml: customerHtml(data),
  };
}

// ── verzenden ────────────────────────────────────────────────────────────────

async function sendOne(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string,
  options?: { attachment?: { filename: string; content: string }; idempotencyKey?: string }
): Promise<void> {
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options?.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      reply_to: DEFAULT_OPS,
      ...(options?.attachment ? { attachments: [options.attachment] } : {}),
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  }
}

/**
 * Verstuurt de klant- én ops-mail. Retourneert sent:true alleen als BEIDE
 * mails slagen. Gooit nooit — geschikt om best-effort aan te roepen.
 */
export async function sendBookingEmails(data: BookingEmailData): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[booking-email] RESEND_API_KEY ontbreekt — mails overgeslagen, boeking blijft bestaan.");
    return { sent: false, error: "not_configured" };
  }
  const from = process.env.RESEND_FROM || DEFAULT_FROM;
  const ops = process.env.OPS_EMAIL || DEFAULT_OPS;
  const mail = renderBookingEmails(data);

  try {
    const confirmationPdf = Buffer.from(renderBookingConfirmationPdf(data)).toString("base64");
    await Promise.all([
      sendOne(apiKey, from, ops, mail.opsSubject, mail.opsHtml, {
        idempotencyKey: `booking-ops/${data.bookingRef}`,
      }),
      sendOne(apiKey, from, data.customerEmail, mail.customerSubject, mail.customerHtml, {
        idempotencyKey: `booking-customer/${data.bookingRef}`,
        attachment: {
          filename: `boekingsbevestiging-${data.bookingRef}.pdf`,
          content: confirmationPdf,
        },
      }),
    ]);
    return { sent: true };
  } catch (e) {
    console.error("[booking-email] verzenden mislukt:", e instanceof Error ? e.message : e);
    return { sent: false, error: e instanceof Error ? e.message : "send_failed" };
  }
}
