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

// Behoudt het bestaande export-oppervlak: de booking-route importeert
// `normalizeLocale` uit deze module. De implementatie staat sinds stap 7.2
// centraal in lib/i18n/locale, gedeeld met de betaal-endpoints.
export { normalizeLocale };

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "T4XI <onboarding@resend.dev>";
const DEFAULT_OPS = "booking@t4xi.nl";

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
const MUTED = "#5F666D";

function shell(opts: { title: string; inner: string; lang: string; tagline: string; preheader?: string }): string {
  const { title, inner, lang, tagline, preheader } = opts;
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>`
    : "";
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:${FOG};font-family:Arial,Helvetica,sans-serif;color:${INK};">
  ${preheaderHtml}
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="font-size:22px;font-weight:bold;letter-spacing:1px;color:${INK};padding:8px 0 16px;">T4XI</div>
    <div style="background:#ffffff;border:1px solid rgba(31,39,48,0.10);border-radius:16px;padding:28px;">
      ${inner}
    </div>
    <p style="color:${MUTED};font-size:12px;text-align:center;margin-top:20px;">
      ${escapeHtml(tagline)} · ${T4XI.phoneDisplay} · ${escapeHtml(T4XI.email)}
    </p>
  </div>
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
    <h1 style="font-size:20px;margin:0 0 8px;color:${INK};">${escapeHtml(c.heading)}</h1>
    <p style="font-size:14px;color:${MUTED};margin:0 0 20px;line-height:1.5;">
      ${c.intro(escapeHtml(data.customerName), escapeHtml(data.bookingRef))}
    </p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid rgba(31,39,48,0.10);">
      ${detailRow(c.labelReference, escapeHtml(data.bookingRef))}
      ${detailRow(c.labelType, escapeHtml(rideTypeLabel(data.rideType, data.locale)))}
      ${detailRow(c.labelRoute, route(data))}
      ${detailRow(c.labelDate, escapeHtml(formatDate(data.date, c.intlLocale)))}
      ${detailRow(c.labelTime, escapeHtml(data.time))}
      ${detailRow(c.labelPrice, escapeHtml(formatPrice(data, c.intlLocale, c.quoteOnRequest, c.returnSuffix)))}
    </table>
    <div style="margin-top:24px;padding-top:20px;border-top:1px solid rgba(31,39,48,0.10);">
      <p style="font-size:13px;color:${MUTED};margin:0 0 10px;">${escapeHtml(c.contactIntro)}</p>
      <p style="margin:0;font-size:14px;">
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
  html: string
): Promise<void> {
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html, reply_to: DEFAULT_OPS }),
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
    await Promise.all([
      sendOne(apiKey, from, ops, mail.opsSubject, mail.opsHtml),
      sendOne(apiKey, from, data.customerEmail, mail.customerSubject, mail.customerHtml),
    ]);
    return { sent: true };
  } catch (e) {
    console.error("[booking-email] verzenden mislukt:", e instanceof Error ? e.message : e);
    return { sent: false, error: e instanceof Error ? e.message : "send_failed" };
  }
}
