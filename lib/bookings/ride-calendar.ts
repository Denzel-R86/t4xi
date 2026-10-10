/**
 * "Voeg toe aan agenda" (Experience 2.0 §8): een `.ics` (RFC 5545), volledig
 * client-side opgebouwd uit de rit zoals de klant hem zelf invoerde en de server
 * hem accepteerde. Geen API, geen extra data: alleen datum, ophaaltijd,
 * ophaallocatie en de teksten die de aanroeper (vertaald) meegeeft.
 *
 * Bewust NIET: e-mail, telefoon, naam, prijs of een geschatte aankomsttijd (die
 * kent T4XI pas na planning; daarom geen DTEND: RFC 5545 maakt het event dan
 * een moment op de ophaaltijd).
 * Zolang T4XI de rit niet bevestigde, staat het event op `STATUS:TENTATIVE`.
 */

export type CalendarLeg = {
  /** ISO-datum `YYYY-MM-DD` (Amsterdamse tijd). */
  date: string;
  /** `HH:MM` (Amsterdamse tijd). */
  time: string;
  /** Ophaallocatie zoals de klant die invoerde. */
  location: string;
  summary: string;
};

export type RideCalendarInput = {
  /** Publieke boekingsreferentie; basis voor de UID. */
  reference: string;
  legs: CalendarLeg[];
  description: string;
  /** `true` zolang de rit nog niet door T4XI bevestigd is. */
  tentative: boolean;
  /** Moment van aanmaken (DTSTAMP). */
  now: Date;
};

const TZID = "Europe/Amsterdam";

/** Minimale VTIMEZONE (EU-zomertijd sinds 1996), zodat agenda's de tijd niet verschuiven. */
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZID}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** RFC 5545 §3.3.11: `\` `;` `,` en regeleinden escapen; overige stuurtekens weg. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "");
}

/** RFC 5545 §3.1: regels > 75 octets vouwen (CRLF + spatie), nooit midden in een UTF-8-teken. */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of Array.from(line)) {
    const size = encoder.encode(char).length;
    // Eerste regel 75 octets; vervolgregels 74 (plus de voorloopspatie).
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function localDateTime(date: string, time: string): string | null {
  const d = DATE_RE.exec(date);
  const t = TIME_RE.exec(time);
  if (!d || !t) return null;
  const month = Number(d[2]);
  const day = Number(d[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${d[1]}${d[2]}${d[3]}T${t[1]}${t[2]}00`;
}

function utcStamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Alleen letters, cijfers en `-`: de referentie kan zo nooit de UID of bestandsnaam breken. */
function safeToken(value: string): string {
  return value.replace(/[^A-Za-z0-9-]/g, "").slice(0, 64) || "rit";
}

/** Bouwt het `.ics`-bestand; `null` als geen enkel ritdeel een geldige datum/tijd heeft. */
export function buildRideIcs(input: RideCalendarInput): string | null {
  const ref = safeToken(input.reference);
  const events: string[] = [];
  input.legs.forEach((leg, index) => {
    const start = localDateTime(leg.date, leg.time);
    if (!start) return;
    events.push(
      "BEGIN:VEVENT",
      `UID:${ref}-${index + 1}@t4xi.nl`,
      `DTSTAMP:${utcStamp(input.now)}`,
      `DTSTART;TZID=${TZID}:${start}`,
      `SUMMARY:${escapeIcsText(leg.summary)}`,
      `LOCATION:${escapeIcsText(leg.location)}`,
      `DESCRIPTION:${escapeIcsText(input.description)}`,
      `STATUS:${input.tentative ? "TENTATIVE" : "CONFIRMED"}`,
      "TRANSP:OPAQUE",
      "END:VEVENT"
    );
  });
  if (events.length === 0) return null;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//T4XI//Boeking//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...VTIMEZONE,
    ...events,
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export function rideIcsFilename(reference: string): string {
  return `t4xi-${safeToken(reference)}.ics`;
}
