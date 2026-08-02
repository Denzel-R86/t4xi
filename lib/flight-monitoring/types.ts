/**
 * Flight monitoring — types (Sprint 7.8A).
 *
 * Datamodel rond de `flight_monitoring`-tabel: wat we bij registratie invoegen,
 * wat de poller bijwerkt, welke rijen de poller selecteert en de samenvatting van
 * een pollronde. Geen pricing/Stripe.
 */

import type { FlightDirection } from "@/lib/schiphol/types";

/** Rij zoals de poller die nodig heeft om te controleren (subset van de tabel). */
export type ActiveFlightRow = {
  id: string;
  booking_id: string;
  flight_number: string;
  schedule_date: string | null;
  direction: FlightDirection | null;
};

/** Wat bij het registreren van een boeking wordt ingevoegd/geüpsert. */
export type MonitoringInsert = {
  booking_id: string;
  flight_number: string;
  schedule_date: string | null;
  direction: FlightDirection | null;
  is_active: boolean;
};

/** Patch die de poller op een rij toepast. `last_checked_at` is altijd aanwezig. */
export type MonitoringUpdate = {
  current_status?: string | null;
  estimated_time?: string | null;
  actual_time?: string | null;
  is_active?: boolean;
  last_checked_at: string;
};

/** Uitkomst van één pollronde. */
export type PollSummary = {
  checked: number;
  updated: number;
  deactivated: number;
  notFound: number;
  errors: number;
  /** Gezet wanneer de ronde vroegtijdig stopte door een configuratie-/authfout. */
  aborted?: "not_configured" | "unauthorized";
};
