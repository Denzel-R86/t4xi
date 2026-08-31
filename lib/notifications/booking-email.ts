/**
 * Booking-templates — puur renderend, geen netwerk, geen env.
 *
 * Verzenden gebeurt sinds de Communication Orchestrator niet meer hier: deze
 * module levert alleen de twee berichten die bij een nieuwe boeking horen:
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
import { BRAND, PALETTE, escapeHtml } from "@/lib/communication/templates/brand";
import { normalizeLocale } from "@/lib/i18n/locale";
import { renderBookingConfirmationPdf } from "@/lib/documents/booking-confirmation-pdf";
import {
  buildBookingHandover,
  handoverHtml,
  urgencyPrefix,
} from "@/lib/notifications/ops-handover";
import { renderCustomerText, renderOpsText } from "@/lib/notifications/booking-email-text";

// Behoudt het bestaande export-oppervlak: de booking-route importeert
// `normalizeLocale` uit deze module. De implementatie staat sinds stap 7.2
// centraal in lib/i18n/locale, gedeeld met de betaal-endpoints.
export { normalizeLocale };

const MONOGRAM_URL = BRAND.monogramUrl;
const T4XI = BRAND;

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
    headerLabel: "Boeking",
    statusLabel: "Aanvraag ontvangen",
    heading: "Bedankt voor je boeking",
    intro: (name: string, ref: string) =>
      `Beste ${name}, we hebben je aanvraag ontvangen. Je referentie is ` +
      `<strong style="color:${"#1F2730"};">${ref}</strong>. We bevestigen je rit zo snel mogelijk via WhatsApp of e-mail.`,
    labelReference: "Referentie",
    labelType: "Type",
    labelRideDetails: "Ritgegevens",
    labelBookingDetails: "Boekingsgegevens",
    labelPickup: "Vertrek",
    labelDropoff: "Bestemming",
    labelDate: "Datum",
    labelTime: "Tijd",
    labelReturnDate: "Retourdatum",
    labelReturnTime: "Retourtijd",
    labelReturnFlight: "Retourvlucht",
    labelPrice: "Prijs",
    labelPersons: "Passagiers",
    labelLuggage: "Bagage",
    labelFlight: "Vlucht",
    quoteOnRequest: "Offerte op aanvraag",
    returnSuffix: "retour",
    attachmentLabel: "Boekingsbevestiging · bijgevoegd",
    attachmentHint: "Klaar om te bewaren of door te sturen",
    contactIntro: "Vragen of wijzigingen? Neem gerust contact op:",
  },
  en: {
    lang: "en",
    intlLocale: "en-GB",
    subject: (ref: string) => `Your T4XI booking — ${ref}`,
    preheader: "Confirmation of your request and your reference number.",
    headerLabel: "Booking",
    statusLabel: "Request received",
    heading: "Thank you for your booking",
    intro: (name: string, ref: string) =>
      `Dear ${name}, we have received your request. Your reference is ` +
      `<strong style="color:${"#1F2730"};">${ref}</strong>. We will confirm your ride as soon as possible via WhatsApp or email.`,
    labelReference: "Reference",
    labelType: "Type",
    labelRideDetails: "Ride details",
    labelBookingDetails: "Booking details",
    labelPickup: "Pickup",
    labelDropoff: "Destination",
    labelDate: "Date",
    labelTime: "Time",
    labelReturnDate: "Return date",
    labelReturnTime: "Return time",
    labelReturnFlight: "Return flight",
    labelPrice: "Price",
    labelPersons: "Passengers",
    labelLuggage: "Luggage",
    labelFlight: "Flight",
    quoteOnRequest: "Quote on request",
    returnSuffix: "return",
    attachmentLabel: "Booking confirmation · attached",
    attachmentHint: "Ready to save or forward",
    contactIntro: "Questions or changes? Feel free to get in touch:",
  },
} as const;

export type BookingEmailData = {
  bookingRef: string;
  rideType: string;
  pickup: string;
  dropoff: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  /** Verplicht bij rideType=retour; nullable voor bestaande/enkele boekingen. */
  returnDate?: string | null;
  returnTime?: string | null;
  returnFlightNumber?: string | null;
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

// ── formatters ───────────────────────────────────────────────────────────────


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
function formatPrice(
  data: BookingEmailData,
  intlLocale: string,
  quoteLabel: string,
  returnSuffix: string,
  includeReturnSuffix = true
): string {
  if (data.quoteOnRequest || data.price === null) return quoteLabel;
  const priceStr = new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: data.currency || "EUR",
  }).format(data.price);
  return data.returnApplied && includeReturnSuffix ? `${priceStr} (${returnSuffix})` : priceStr;
}

// ── HTML-templates ───────────────────────────────────────────────────────────

// Palet en contactgegevens komen uit de gedeelde merkbasis, zodat boekingsmail,
// leadmail en factuurmail niet uit elkaar kunnen lopen.
const { ink: INK, accent: ACCENT, fog: FOG, overlay: OVERLAY, stone: STONE, muted: MUTED, border: BORDER } = PALETTE;

function shell(opts: {
  title: string;
  inner: string;
  lang: string;
  headerLabel: string;
  headerValue: string;
  preheader?: string;
}): string {
  const { title, inner, lang, headerLabel, headerValue, preheader } = opts;
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`
    : "";
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; supported-color-schemes: light; }
  @media only screen and (max-width: 620px) {
    .email-wrap { padding: 12px 8px !important; }
    .email-header { padding: 22px 20px 20px !important; }
    .email-logo { width: 48px !important; height: 47px !important; }
    .email-content { padding: 34px 22px 30px !important; }
    .email-heading { font-size: 30px !important; }
    .email-total { font-size: 30px !important; }
    .email-route { font-size: 14px !important; }
    .email-label { white-space:normal !important; }
    .email-contact-link { display:block !important; padding:4px 0 !important; }
    .email-contact-separator { display:none !important; }
  }
</style></head>
<body style="margin:0;background:${FOG};font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;color:${INK};">
  ${preheaderHtml}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:${FOG};">
    <tr><td class="email-wrap" align="center" style="padding:36px 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;">
        <tr>
          <td class="email-header" style="background:#ffffff;border:1px solid ${BORDER};border-bottom:3px solid ${ACCENT};border-radius:18px 18px 0 0;padding:25px 32px 23px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;"><tr>
              <td style="vertical-align:middle;">
                <img class="email-logo" src="${MONOGRAM_URL}" width="52" height="51" alt="T4XI" style="display:block;width:52px;height:51px;border:0;outline:none;object-fit:contain;color:${INK};font-size:12px;font-weight:700;">
              </td>
              <td align="right" style="vertical-align:middle;color:${STONE};font-size:10px;font-weight:700;line-height:1.55;letter-spacing:1.5px;text-transform:uppercase;">
                ${escapeHtml(headerLabel)}<br><span style="color:${INK};font-size:12px;letter-spacing:0.2px;text-transform:none;">${escapeHtml(headerValue)}</span>
              </td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td class="email-content" style="background:#ffffff;border:1px solid ${BORDER};border-top:0;padding:44px 38px 38px;">
            ${inner}
          </td>
        </tr>
        <tr>
          <td align="center" style="background:${INK};border-radius:0 0 18px 18px;padding:24px 22px;color:#CBC8C4;font-size:11px;line-height:1.8;">
            <span style="font-weight:700;letter-spacing:0.7px;color:${FOG};">ARRIVE WITH CONFIDENCE.</span><br>
            <span style="color:${STONE};">${T4XI.phoneDisplay} &nbsp;·&nbsp; ${escapeHtml(T4XI.email)} &nbsp;·&nbsp; t4xi.nl</span>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function detailRow(label: string, value: string, last = false): string {
  return `<tr>
    <td class="email-label" style="padding:13px 16px 13px 0;color:${MUTED};font-size:12px;line-height:1.4;vertical-align:top;white-space:nowrap;${last ? "" : `border-bottom:1px solid ${BORDER};`}">${escapeHtml(label)}</td>
    <td style="padding:13px 0;color:${INK};font-size:13px;font-weight:700;line-height:1.4;text-align:right;vertical-align:top;word-break:break-word;${last ? "" : `border-bottom:1px solid ${BORDER};`}">${value}</td>
  </tr>`;
}

function route(data: BookingEmailData): string {
  return `${escapeHtml(data.pickup)} <span style="color:${MUTED};">→</span> ${escapeHtml(data.dropoff)}`;
}

function customerHtml(data: BookingEmailData): string {
  const c = CUSTOMER_COPY[data.locale];
  const price = formatPrice(data, c.intlLocale, c.quoteOnRequest, c.returnSuffix, false);
  const attachmentFilename = `boekingsbevestiging-${data.bookingRef}.pdf`;
  const detailItems: Array<[string, string]> = [
    [c.labelReference, escapeHtml(data.bookingRef)],
    [c.labelType, escapeHtml(rideTypeLabel(data.rideType, data.locale))],
  ];
  detailItems.push(
    [c.labelDate, escapeHtml(formatDate(data.date, c.intlLocale))],
    [c.labelTime, escapeHtml(data.time)],
  );
  if (data.returnDate && data.returnTime) {
    detailItems.push(
      [c.labelReturnDate, escapeHtml(formatDate(data.returnDate, c.intlLocale))],
      [c.labelReturnTime, escapeHtml(data.returnTime)],
    );
  }
  detailItems.push(
    [c.labelPersons, String(data.persons)],
    [c.labelLuggage, data.luggage ? escapeHtml(data.luggage) : "—"],
  );
  if (data.flightNumber) detailItems.push([c.labelFlight, escapeHtml(data.flightNumber)]);
  if (data.returnFlightNumber) {
    detailItems.push([c.labelReturnFlight, escapeHtml(data.returnFlightNumber)]);
  }
  const detailsHtml = detailItems
    .map(([label, value], index) => detailRow(label, value, index === detailItems.length - 1))
    .join("");
  const inner = `
    <div style="font-size:10px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:${STONE};margin:0 0 13px;">${escapeHtml(c.statusLabel)}</div>
    <h1 class="email-heading" style="font-family:Outfit,'Helvetica Neue',Arial,Helvetica,sans-serif;font-size:36px;line-height:1.08;letter-spacing:-1px;margin:0 0 18px;color:${INK};">${escapeHtml(c.heading)}</h1>
    <p style="font-size:15px;color:${MUTED};margin:0 0 32px;line-height:1.7;">
      ${c.intro(escapeHtml(data.customerName), escapeHtml(data.bookingRef))}
    </p>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-top:1px solid ${BORDER};border-bottom:1px solid ${BORDER};margin:0 0 34px;">
      <tr>
        <td style="padding:22px 0;vertical-align:middle;">
          <div style="color:${INK};font-size:16px;font-weight:700;line-height:1.35;">${escapeHtml(c.labelPrice)}</div>
        </td>
        <td class="email-total" align="right" style="padding:22px 0 22px 18px;color:${INK};font-family:Outfit,'Helvetica Neue',Arial,Helvetica,sans-serif;font-size:36px;font-weight:700;letter-spacing:-1px;line-height:1.05;vertical-align:middle;word-break:break-word;">${escapeHtml(price)}</td>
      </tr>
    </table>

    <div style="font-size:10px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${STONE};margin:0 0 15px;">${escapeHtml(c.labelRideDetails)}</div>
    <div style="font-size:14px;font-weight:700;color:${INK};margin:0 0 18px;">${escapeHtml(formatDate(data.date, c.intlLocale))} · ${escapeHtml(data.time)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 34px;">
      <tr>
        <td width="28" style="width:28px;vertical-align:top;padding-top:5px;">
          <div style="width:10px;height:10px;border:2px solid ${ACCENT};border-radius:50%;font-size:0;line-height:0;">&nbsp;</div>
        </td>
        <td class="email-route" style="padding:0 0 18px;color:${INK};font-size:15px;font-weight:700;line-height:1.5;border-bottom:1px solid ${BORDER};word-break:break-word;">
          <div style="color:${STONE};font-size:9px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;margin-bottom:4px;">${escapeHtml(c.labelPickup)}</div>
          ${escapeHtml(data.pickup)}
        </td>
      </tr>
      <tr>
        <td width="28" style="width:28px;vertical-align:top;padding-top:24px;">
          <div style="width:10px;height:10px;background:${ACCENT};border:2px solid ${ACCENT};border-radius:2px;font-size:0;line-height:0;">&nbsp;</div>
        </td>
        <td class="email-route" style="padding:18px 0 0;color:${INK};font-size:15px;font-weight:700;line-height:1.5;word-break:break-word;">
          <div style="color:${STONE};font-size:9px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;margin-bottom:4px;">${escapeHtml(c.labelDropoff)}</div>
          ${escapeHtml(data.dropoff)}
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:${OVERLAY};border:1px solid #E2DDD5;border-radius:12px;margin:0 0 30px;">
      <tr>
        <td width="58" style="padding:18px 0 18px 18px;vertical-align:middle;">
          <div style="width:44px;height:44px;background:${ACCENT};border-radius:8px;color:#ffffff;font-size:10px;font-weight:800;line-height:44px;text-align:center;letter-spacing:0.9px;">PDF</div>
        </td>
        <td style="padding:18px;vertical-align:middle;">
          <div style="font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${STONE};margin-bottom:5px;">${escapeHtml(c.attachmentLabel)}</div>
          <div style="font-size:13px;font-weight:700;color:${INK};line-height:1.45;word-break:break-word;">${escapeHtml(attachmentFilename)}</div>
          <div style="font-size:12px;color:${MUTED};line-height:1.45;margin-top:4px;">${escapeHtml(c.attachmentHint)}</div>
        </td>
      </tr>
    </table>

    <div style="font-size:10px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${STONE};margin:0 0 8px;">${escapeHtml(c.labelBookingDetails)}</div>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 30px;">
      ${detailsHtml}
    </table>

    <div style="padding-top:24px;border-top:1px solid ${BORDER};">
      <p style="font-size:13px;color:${MUTED};margin:0 0 10px;">${escapeHtml(c.contactIntro)}</p>
      <p style="margin:0;font-size:13px;line-height:1.8;">
        <a class="email-contact-link" href="tel:${T4XI.phoneHref}" style="color:${ACCENT};text-decoration:none;font-weight:600;">${T4XI.phoneDisplay}</a>
        <span class="email-contact-separator"> · </span>
        <a class="email-contact-link" href="${T4XI.whatsapp}" style="color:${ACCENT};text-decoration:none;font-weight:600;">WhatsApp</a>
        <span class="email-contact-separator"> · </span>
        <a class="email-contact-link" href="mailto:${T4XI.email}" style="color:${ACCENT};text-decoration:none;font-weight:600;">${T4XI.email}</a>
      </p>
    </div>`;
  return shell({
    title: c.subject(data.bookingRef),
    inner,
    lang: c.lang,
    headerLabel: c.headerLabel,
    headerValue: data.bookingRef,
    preheader: c.preheader,
  });
}

/** Interne ops-mail — bewust Nederlands; taalonafhankelijk van de klantkeuze. */
function opsHtml(data: BookingEmailData, now: Date): string {
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
      ${
        data.returnDate && data.returnTime
          ? detailRow("Retour", `${escapeHtml(formatDate(data.returnDate, "nl-NL"))} om ${escapeHtml(data.returnTime)}`)
          : ""
      }
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
      ${data.returnFlightNumber ? detailRow("Retourvlucht", `<b>${escapeHtml(data.returnFlightNumber)}</b>`) : ""}
    </table>
    <h2 style="font-size:14px;margin:22px 0 4px;color:${INK};">Klantgegevens</h2>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid rgba(31,39,48,0.10);">
      ${detailRow("Naam", escapeHtml(data.customerName))}
      ${detailRow("Telefoon", `<a href="tel:${escapeHtml(data.customerPhone)}" style="color:${ACCENT};text-decoration:none;">${escapeHtml(data.customerPhone)}</a>`)}
      ${detailRow("E-mail", `<a href="mailto:${escapeHtml(data.customerEmail)}" style="color:${ACCENT};text-decoration:none;">${escapeHtml(data.customerEmail)}</a>`)}
    </table>
    ${handoverHtml(buildBookingHandover(data, now), {
      phone: data.customerPhone,
      email: data.customerEmail,
    })}`;
  return shell({
    title: `Nieuwe boeking ${data.bookingRef}`,
    inner,
    lang: "nl",
    headerLabel: "Operations",
    headerValue: data.bookingRef,
  });
}

/**
 * Rendert beide mails (subjects, HTML en platte tekst). Puur — handig voor
 * test/preview. `now` bepaalt uitsluitend de urgentie van de taakoverdracht en
 * is injecteerbaar zodat de uitkomst deterministisch testbaar blijft.
 */
export function renderBookingEmails(
  data: BookingEmailData,
  now: Date = new Date()
): {
  opsSubject: string;
  opsHtml: string;
  opsText: string;
  customerSubject: string;
  customerHtml: string;
  customerText: string;
} {
  const c = CUSTOMER_COPY[data.locale];
  const { urgency } = buildBookingHandover(data, now);
  return {
    opsSubject:
      `${urgencyPrefix(urgency)}Nieuwe boeking ${data.bookingRef} — ${data.pickup} → ${data.dropoff}`,
    opsHtml: opsHtml(data, now),
    opsText: renderOpsText(data, now),
    customerSubject: c.subject(data.bookingRef),
    customerHtml: customerHtml(data),
    customerText: renderCustomerText(data),
  };
}
