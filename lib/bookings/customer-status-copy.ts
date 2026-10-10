import { isBookingStatus, type BookingStatus } from "./lifecycle";
import { isServerPaid, type ServerPaidProof } from "@/lib/payments/server-paid";

/**
 * Eén status → klanttaal-mapping (Experience 2.0 §8, ES 08 "INQUIRY ≠ CONFIRMED").
 *
 * Website nu; e-mail en WhatsApp sluiten later op dezelfde tabel aan (de
 * communication engine is hier bewust niet gewijzigd). Klanttaal wordt dus
 * nooit per component verzonnen.
 *
 * Twee assen, zoals in de database (lifecycle.ts): de bookingstatus bepaalt de
 * kop. Zolang een rit nog niet door T4XI bevestigd is (`inquiry`/`quoted`),
 * zegt de betaalstatus alleen iets over de betaling — nooit "bevestigd",
 * "staat klaar" of "staat gepland".
 *
 * `approval`: alleen `approved` mag op een scherm komen (claims-check §0c).
 * `proposal` = tekst voor statussen die de website nog niet toont; ligt ter
 * goedkeuring bij de eigenaar.
 */

export const CUSTOMER_LOCALES = ["nl", "en"] as const;
export type CustomerLocale = (typeof CUSTOMER_LOCALES)[number];

export type CustomerCopy = { nl: string; en: string; approval: "approved" | "proposal" };

/** Statussen waarin T4XI de rit nog niet heeft bevestigd. */
export const PRE_CONFIRMATION_STATUSES = ["inquiry", "quoted"] as const satisfies readonly BookingStatus[];

export const BOOKING_STATUS_COPY: Record<BookingStatus, CustomerCopy> = {
  // §8 letterlijk ("Uw aanvraag is in behandeling.").
  inquiry: { nl: "Uw aanvraag is in behandeling.", en: "Your request is being processed.", approval: "approved" },
  quoted: { nl: "Uw aanvraag is in behandeling.", en: "Your request is being processed.", approval: "approved" },
  // §8: pas zodra de status bestaat en bereikt is.
  confirmed: { nl: "Uw rit is bevestigd.", en: "Your ride is confirmed.", approval: "approved" },
  assigned: {
    nl: "Uw rit is bevestigd. Er is een chauffeur aan uw rit toegewezen.",
    en: "Your ride is confirmed. A driver has been assigned to your ride.",
    approval: "proposal",
  },
  in_progress: { nl: "Uw rit is onderweg.", en: "Your ride is under way.", approval: "proposal" },
  completed: { nl: "Uw rit is afgerond.", en: "Your ride is complete.", approval: "proposal" },
  cancelled: { nl: "Uw rit is geannuleerd.", en: "Your ride has been cancelled.", approval: "proposal" },
};

/** Betaalstatus zoals de klant hem ziet vóór de vervoersbevestiging. */
export type CustomerPaymentStatus = "unpaid" | "pending" | "paid";

export const PRE_CONFIRMATION_PAYMENT_COPY: Record<Exclude<CustomerPaymentStatus, "unpaid">, CustomerCopy> = {
  // Bestaande copy ("Betaling wordt verwerkt.", betaling.verwerkt) + §8.
  pending: {
    nl: "Betaling wordt verwerkt. Uw aanvraag is in behandeling.",
    en: "Processing payment. Your request is being processed.",
    approval: "approved",
  },
  // §8 letterlijk; EN goedgekeurd door de eigenaar (#72).
  paid: {
    nl: "Betaling ontvangen. Uw aanvraag is in behandeling.",
    en: "Payment received. Your request is being processed.",
    approval: "approved",
  },
};

export function isPreConfirmation(status: BookingStatus): boolean {
  return (PRE_CONFIRMATION_STATUSES as readonly BookingStatus[]).includes(status);
}

/** De ene kop die scherm (en later e-mail/WhatsApp) voor deze combinatie toont. */
export function customerStatusCopy(bookingStatus: BookingStatus, paymentStatus: CustomerPaymentStatus): CustomerCopy {
  if (isPreConfirmation(bookingStatus) && paymentStatus !== "unpaid") {
    return PRE_CONFIRMATION_PAYMENT_COPY[paymentStatus];
  }
  return BOOKING_STATUS_COPY[bookingStatus];
}

/**
 * Statussen waarvoor goedgekeurde schermtekst bestaat. `assigned`, `in_progress`,
 * `completed` en `cancelled` hebben alleen een VOORSTEL en kunnen het scherm
 * daarom niet bereiken (type én `screenBookingStatus`).
 */
export const SCREEN_BOOKING_STATUSES = ["inquiry", "quoted", "confirmed"] as const satisfies readonly BookingStatus[];
export type ScreenBookingStatus = (typeof SCREEN_BOOKING_STATUSES)[number];

/**
 * Bookingstatus uit de respons van POST /api/bookings, versmald tot wat het
 * scherm mag tonen. De respons meldt historisch `status: "pending"` = "aanvraag
 * ontvangen, nog niet bevestigd" (migratie 20260830120000), dus `inquiry`. Alles
 * buiten SCREEN_BOOKING_STATUSES valt terug op de kleinste belofte: `inquiry`.
 * Nooit naar boven afronden.
 */
export function screenBookingStatus(raw: unknown): ScreenBookingStatus {
  return isBookingStatus(raw) && (SCREEN_BOOKING_STATUSES as readonly string[]).includes(raw)
    ? (raw as ScreenBookingStatus)
    : "inquiry";
}

/**
 * De kop op het scherm. `payment` is GEEN vlag maar het server-bewijs
 * (`serverPaidProof`, lib/payments/server-paid.ts): zonder geldig bewijs is de
 * betaalstatus voor de klant `pending`. "Uw rit is bevestigd." volgt uitsluitend
 * uit bookingstatus `confirmed`. Gooit als er ooit een voorstel zou renderen.
 */
export function screenHeadline(status: ScreenBookingStatus, payment: ServerPaidProof | null, locale: string): string {
  const copy = customerStatusCopy(status, isServerPaid(payment) ? "paid" : "pending");
  if (copy.approval !== "approved") throw new Error(`Niet-goedgekeurde klanttekst voor ${status}`);
  return locale === "en" ? copy.en : copy.nl;
}
