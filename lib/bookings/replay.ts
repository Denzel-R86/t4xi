/**
 * F-45 — replay van een quote-lock-boeking.
 *
 * `create_booking_from_snapshot` is idempotent: dezelfde `quoteId` + dezelfde
 * rit (vingerafdruk) geeft de BESTAANDE boeking terug met `reused = true`. De
 * route mag die boeking dan niet meer muteren: geen retourvelden, geen
 * vluchtmonitoring, geen communicatie.
 *
 * Vluchtgegevens zitten niet in de vingerafdruk. Een replay met andere
 * vluchtnummers zou de wijziging stil laten vallen terwijl de klant denkt dat hij
 * is doorgevoerd (rijdt de chauffeur dan op de oude vlucht?). Daarom: alleen als
 * de opgeslagen vluchtgegevens exact gelijk zijn aan de replay wordt het
 * bestaande resultaat teruggegeven; anders een 409 zonder boekings-id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ReplayStoredFlights = {
  flight_number: string | null;
  return_date: string | null;
  return_flight_number: string | null;
};

export type ReplaySubmitted = {
  /** Genormaliseerd en al gefilterd zoals de route het zou opslaan ("" = geen). */
  flightNumber: string;
  returnTrip: boolean;
  returnFlightNumber: string;
};

export type ReplayDecision =
  /** Zelfde boeking, zelfde gegevens → het oorspronkelijke resultaat teruggeven. */
  | { kind: "return_existing" }
  /** De oorspronkelijke request heeft de retourvelden nog niet weggeschreven. */
  | { kind: "pending" }
  /** Vluchtgegevens wijken af van de bestaande boeking. */
  | { kind: "conflict" };

const norm = (v: string | null | undefined) => (v ?? "").trim().toUpperCase();

export function decideReplay(
  stored: ReplayStoredFlights,
  submitted: ReplaySubmitted
): ReplayDecision {
  if (norm(stored.flight_number) !== norm(submitted.flightNumber)) {
    return { kind: "conflict" };
  }
  if (submitted.returnTrip) {
    // Een retour krijgt return_date altijd in de nabewerking van de eerste
    // request. Ontbreekt die nog, dan loopt die nabewerking (gelijktijdige
    // dubbele submit): niets teruggeven, de klant probeert het zo opnieuw.
    if (stored.return_date === null) return { kind: "pending" };
    if (norm(stored.return_flight_number) !== norm(submitted.returnFlightNumber)) {
      return { kind: "conflict" };
    }
  }
  return { kind: "return_existing" };
}

/** Leest alleen de vluchtvelden van de bestaande boeking (read-only). */
export async function loadReplayFlights(
  supabase: SupabaseClient,
  bookingId: string
): Promise<ReplayStoredFlights | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select("flight_number, return_date, return_flight_number")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ReplayStoredFlights;
}
