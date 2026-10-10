import type { BookingStatus } from "./lifecycle";
import { maskEmail } from "@/lib/format/mask-email";

/**
 * Bevestigingsweergave (Experience 2.0 §8) — wat er getoond wordt en in welke
 * volgorde. Pure logica; `components/booking/BookingConfirmation.tsx` rendert dit.
 *
 * Bron: de rit zoals verstuurd naar én geaccepteerd door POST /api/bookings
 * (vastgelegd op het moment van de geslaagde inzending), plus de bookingstatus
 * uit die respons. Het betaalde bedrag komt NIET hieruit maar uit de server-intent.
 */
export type ConfirmationDetails = {
  bookingRef: string;
  bookingStatus: BookingStatus;
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
 */
export function confirmationFields(d: ConfirmationDetails): ConfirmationField[] {
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
    "paid",
  ];
  return fields.filter((f): f is ConfirmationField => f !== false);
}
