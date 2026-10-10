import { isBookingStatus, type BookingStatus } from "./lifecycle";

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
  // §8 letterlijk.
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

export function customerStatusHeadline(
  bookingStatus: BookingStatus,
  paymentStatus: CustomerPaymentStatus,
  locale: string
): string {
  const copy = customerStatusCopy(bookingStatus, paymentStatus);
  return locale === "en" ? copy.en : copy.nl;
}

/**
 * Bookingstatus uit de respons van POST /api/bookings. Die meldt historisch
 * `status: "pending"` = "aanvraag ontvangen, nog niet bevestigd" (zie migratie
 * 20260830120000), dus `inquiry`. Alles wat geen bekende status is, valt terug
 * op de status met de kleinste belofte: `inquiry`. Nooit naar boven afronden.
 */
export function bookingStatusFromResponse(raw: unknown): BookingStatus {
  return isBookingStatus(raw) ? raw : "inquiry";
}
