import type { ConfirmationDetails } from "./confirmation-details";
import { screenHeadline } from "./customer-status-copy";
import { buildRideIcs } from "./ride-calendar";
import { isServerPaid, type ServerPaidProof } from "@/lib/payments/server-paid";

/**
 * Agenda-item voor de bevestigingsweergave (§8, besluit eigenaar #72).
 *
 * Een niet door T4XI bevestigde rit wordt nooit als bevestigd gepresenteerd:
 * `STATUS:TENTATIVE` plus een titel en omschrijving die zeggen dat het een
 * aanvraag is. Alleen bij bookingstatus `confirmed`: `STATUS:CONFIRMED` en een
 * gewone titel. Zonder server-bewijs van betaling is er geen agenda-item.
 *
 * De zinnen herformuleren bestaande, goedgekeurde betekenis (§8-kop en
 * `booking.succesBevestiging`); ze voegen geen nieuwe belofte toe.
 */

type CalendarCopy = {
  summary: (from: string, to: string) => string;
  returnSummary: (from: string, to: string) => string;
  description: (headline: string, ref: string) => string;
};

export const CALENDAR_COPY: Record<"nl" | "en", { tentative: CalendarCopy; confirmed: CalendarCopy }> = {
  nl: {
    tentative: {
      summary: (from, to) => `Aanvraag T4XI-rit (nog niet bevestigd) — ${from} → ${to}`,
      returnSummary: (from, to) => `Aanvraag T4XI-terugrit (nog niet bevestigd) — ${from} → ${to}`,
      description: (headline, ref) => `${headline} Wij bevestigen uw rit via WhatsApp of e-mail. Referentie: ${ref}.`,
    },
    confirmed: {
      summary: (from, to) => `T4XI-rit — ${from} → ${to}`,
      returnSummary: (from, to) => `T4XI-terugrit — ${from} → ${to}`,
      description: (headline, ref) => `${headline} Referentie: ${ref}.`,
    },
  },
  en: {
    tentative: {
      summary: (from, to) => `T4XI ride request (not yet confirmed) — ${from} → ${to}`,
      returnSummary: (from, to) => `T4XI return ride request (not yet confirmed) — ${from} → ${to}`,
      description: (headline, ref) => `${headline} We will confirm your ride via WhatsApp or email. Reference: ${ref}.`,
    },
    confirmed: {
      summary: (from, to) => `T4XI ride — ${from} → ${to}`,
      returnSummary: (from, to) => `T4XI return ride — ${from} → ${to}`,
      description: (headline, ref) => `${headline} Reference: ${ref}.`,
    },
  },
};

/** Korte plaatsnaam ("Amsterdam Zuidas, Amsterdam" → "Amsterdam Zuidas"). */
export const shortPlace = (label: string) => label.split(",")[0]?.trim() || label;

export function buildBookingIcs(
  details: ConfirmationDetails,
  opts: { locale: string; payment: ServerPaidProof | null; now: Date }
): string | null {
  if (!isServerPaid(opts.payment)) return null;
  const confirmed = details.bookingStatus === "confirmed";
  const copy = CALENDAR_COPY[opts.locale === "en" ? "en" : "nl"][confirmed ? "confirmed" : "tentative"];
  const from = shortPlace(details.pickup);
  const to = shortPlace(details.dropoff);
  return buildRideIcs({
    reference: details.bookingRef,
    tentative: !confirmed,
    now: opts.now,
    description: copy.description(screenHeadline(details.bookingStatus, opts.payment, opts.locale), details.bookingRef),
    legs: [
      { date: details.date, time: details.time, location: details.pickup, summary: copy.summary(from, to) },
      ...(details.returnTrip
        ? [{ date: details.returnDate, time: details.returnTime, location: details.dropoff, summary: copy.returnSummary(to, from) }]
        : []),
    ],
  });
}
