import type { ScreenBookingStatus } from "./customer-status-copy";
import { maskEmail } from "@/lib/format/mask-email";
import { isServerPaid, type ServerPaidProof } from "@/lib/payments/server-paid";

/**
 * Bevestigingsweergave (Experience 2.0 §8) — wat er getoond wordt en in welke
 * volgorde. Pure logica; `components/booking/BookingConfirmation.tsx` rendert dit.
 *
 * Bron: de rit zoals verstuurd naar én geaccepteerd door POST /api/bookings
 * (vastgelegd op het moment van de geslaagde inzending), plus de bookingstatus
 * uit die respons. Betaalstatus en bedrag komen NIET hieruit maar uitsluitend uit
 * het server-bewijs (`ServerPaidProof`, lib/payments/server-paid.ts).
 */
export type ConfirmationDetails = {
  bookingRef: string;
  /** Versmald tot statussen met goedgekeurde schermtekst (`screenBookingStatus`). */
  bookingStatus: ScreenBookingStatus;
  date: string;
  time: string;
  pickup: string;
  dropoff: string;
  returnTrip: boolean;
  returnDate: string;
  returnTime: string;
  passengers: number;
  flightNumber: string;
  returnFlightNumber: string;
  /** Ruw adres; wordt uitsluitend gemaskeerd getoond. */
  email: string;
};

export type ConfirmationField =
  | "when"
  | "returnWhen"
  | "pickup"
  | "dropoff"
  | "reference"
  | "contact"
  | "passengers"
  | "flight"
  | "returnFlight"
  | "vehicle"
  | "paid";

/**
 * ES 09: datum + ophaaltijd, ophaallocatie, bestemming, referentie, contact;
 * daarna passagiers, vluchtnummer, voertuigklasse (B5) en het betaalde bedrag.
 * Lege optionele velden vallen weg; de volgorde van de rest verandert nooit.
 * "€X betaald" alleen met een server-bewijs mét bedrag — nooit bij `pending`.
 */
export function confirmationFields(d: ConfirmationDetails, payment: ServerPaidProof | null): ConfirmationField[] {
  const retour = d.returnTrip && Boolean(d.returnDate) && Boolean(d.returnTime);
  const fields: (ConfirmationField | false)[] = [
    "when",
    retour && "returnWhen",
    "pickup",
    "dropoff",
    "reference",
    maskEmail(d.email) !== null && "contact",
    "passengers",
    Boolean(d.flightNumber.trim()) && "flight",
    d.returnTrip && Boolean(d.returnFlightNumber.trim()) && "returnFlight",
    "vehicle",
    isServerPaid(payment) && payment.amountCents !== null && "paid",
  ];
  return fields.filter((f): f is ConfirmationField => f !== false);
}
