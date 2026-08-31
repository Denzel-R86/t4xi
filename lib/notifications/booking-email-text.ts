/**
 * Platte-tekstversies van de boekingsmails.
 *
 * Waarom apart: elke serieuze mailclient en spamfilter verwacht een
 * `text/plain`-deel naast de HTML. Een mail met alleen HTML scoort slechter op
 * aflevering en is onleesbaar in tekstclients en schermlezers. De HTML-templates
 * staan in `booking-email.ts`; dat bestand zit tegen de bestandsgrens aan, dus
 * de tekstvariant leeft hier.
 *
 * Puur en offline: geen env, geen netwerk, geen datum van "nu".
 */

import type { Locale } from "@/i18n/routing";
import type { BookingEmailData } from "@/lib/notifications/booking-email";
import { buildBookingHandover, handoverText } from "@/lib/notifications/ops-handover";

const CONTACT = {
  phone: "+31 6 34 74 45 22",
  email: "booking@t4xi.nl",
  whatsapp: "https://wa.me/31634744522",
};

const TEXT_COPY: Record<Locale, Record<string, string>> = {
  nl: {
    intlLocale: "nl-NL",
    heading: "Bedankt voor je boeking",
    intro:
      "We hebben je aanvraag ontvangen. We bevestigen je rit zo snel mogelijk via WhatsApp of e-mail.",
    reference: "Referentie",
    type: "Type",
    pickup: "Vertrek",
    dropoff: "Bestemming",
    date: "Datum",
    time: "Tijd",
    returnDate: "Retourdatum",
    returnTime: "Retourtijd",
    returnFlight: "Retourvlucht",
    price: "Prijs",
    persons: "Passagiers",
    luggage: "Bagage",
    flight: "Vlucht",
    quote: "Offerte op aanvraag",
    returnSuffix: "retour",
    attachment: "Je boekingsbevestiging zit als PDF bij deze e-mail.",
    contact: "Vragen of wijzigingen? Neem gerust contact op:",
    notInvoice: "Deze bevestiging is geen factuur.",
  },
  en: {
    intlLocale: "en-GB",
    heading: "Thank you for your booking",
    intro:
      "We have received your request. We will confirm your ride as soon as possible via WhatsApp or email.",
    reference: "Reference",
    type: "Type",
    pickup: "Pickup",
    dropoff: "Destination",
    date: "Date",
    time: "Time",
    returnDate: "Return date",
    returnTime: "Return time",
    returnFlight: "Return flight",
    price: "Price",
    persons: "Passengers",
    luggage: "Luggage",
    flight: "Flight",
    quote: "Quote on request",
    returnSuffix: "return",
    attachment: "Your booking confirmation is attached to this email as a PDF.",
    contact: "Questions or changes? Feel free to get in touch:",
    notInvoice: "This confirmation is not an invoice.",
  },
};

const RIDE_TYPES: Record<Locale, Record<string, string>> = {
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

function formatDate(date: string, intlLocale: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat(intlLocale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function formatPrice(data: BookingEmailData, intlLocale: string, quoteLabel: string, returnSuffix: string): string {
  if (data.quoteOnRequest || data.price === null) return quoteLabel;
  const price = new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: data.currency || "EUR",
  }).format(data.price);
  return data.returnApplied ? `${price} (${returnSuffix})` : price;
}

/** "Label: waarde"-regels; lege waarden vallen weg in plaats van "—" te tonen. */
function lines(rows: Array<[string, string | null | undefined]>): string[] {
  return rows.filter(([, value]) => Boolean(value)).map(([label, value]) => `${label}: ${value}`);
}

/** Klantmail als platte tekst — tweetalig, spiegelt de HTML-inhoud. */
export function renderCustomerText(data: BookingEmailData): string {
  const t = TEXT_COPY[data.locale];
  const rideType = RIDE_TYPES[data.locale][data.rideType] ?? RIDE_TYPES[data.locale].direct;

  return [
    `T4XI — ${t.heading}`,
    "",
    `${data.customerName},`,
    `${t.intro} ${t.reference}: ${data.bookingRef}.`,
    "",
    ...lines([
      [t.type, rideType],
      [t.pickup, data.pickup],
      [t.dropoff, data.dropoff],
      [t.date, formatDate(data.date, t.intlLocale)],
      [t.time, data.time],
      [t.returnDate, data.returnDate ? formatDate(data.returnDate, t.intlLocale) : null],
      [t.returnTime, data.returnTime],
      [t.flight, data.flightNumber],
      [t.returnFlight, data.returnFlightNumber],
      [t.persons, String(data.persons)],
      [t.luggage, data.luggage],
      [t.price, formatPrice(data, t.intlLocale, t.quote, t.returnSuffix)],
    ]),
    "",
    t.attachment,
    t.notInvoice,
    "",
    t.contact,
    `${CONTACT.phone} · ${CONTACT.email}`,
    CONTACT.whatsapp,
    "",
    "T4XI · t4xi.nl",
  ].join("\n");
}

/** Interne mail als platte tekst, inclusief de taakoverdracht. */
export function renderOpsText(data: BookingEmailData, now: Date = new Date()): string {
  const handover = buildBookingHandover(data, now);
  return [
    `T4XI OPERATIONS — nieuwe boeking ${data.bookingRef}`,
    "",
    ...lines([
      ["Type", RIDE_TYPES.nl[data.rideType] ?? RIDE_TYPES.nl.direct],
      ["Route", `${data.pickup} -> ${data.dropoff}`],
      ["Datum", formatDate(data.date, "nl-NL")],
      ["Tijd", data.time],
      ["Retour", data.returnDate && data.returnTime ? `${formatDate(data.returnDate, "nl-NL")} om ${data.returnTime}` : null],
      ["Prijs", formatPrice(data, "nl-NL", "Offerte op aanvraag", "retour")],
      ["Taal klantmail", data.locale === "en" ? "Engels" : "Nederlands"],
      ["Passagiers", String(data.persons)],
      ["Bagage", data.luggage],
      ["Voertuig", data.vehicle],
      [
        "Vlucht",
        data.flightNumber
          ? `${data.flightNumber}${data.flightDirection === "arrival" ? " (AANKOMST)" : data.flightDirection === "departure" ? " (vertrek)" : ""}`
          : null,
      ],
      ["Retourvlucht", data.returnFlightNumber],
    ]),
    "",
    "KLANTGEGEVENS",
    `Naam: ${data.customerName}`,
    `Telefoon: ${data.customerPhone}`,
    `E-mail: ${data.customerEmail}`,
    "",
    handoverText(handover),
  ].join("\n");
}
