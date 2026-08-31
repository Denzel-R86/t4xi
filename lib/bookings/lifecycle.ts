/**
 * Boekings-lifecycle — de bron van domeinevents.
 *
 * Ontwerpregel: **statusovergangen veroorzaken domeinevents; domeinevents
 * veroorzaken communicatie.** Nooit andersom. Dashboardcode, webhooks en
 * API-routes roepen dus geen templates aan, maar vragen een overgang aan.
 *
 * Deze tabel is een spiegel van de constraint en de `transition_booking_status`
 * RPC in `20260830120000_booking_lifecycle_and_communication.sql`. De database
 * blijft de autoriteit — deze module bestaat om de UI te laten zien wat mag en
 * om de regels los van een databaseverbinding te kunnen testen.
 *
 * Bewust orthogonaal: betaling zit in `payment_status`, vluchtstatus in
 * `flight_monitoring`, de communicatiestand in `communication_deliveries`. Er
 * hoort nooit een samengestelde waarde in deze lijst.
 */

export const BOOKING_STATUSES = [
  "inquiry",
  "quoted",
  "confirmed",
  "assigned",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Eindstanden: hieruit vertrekt geen enkele overgang meer. */
export const TERMINAL_STATUSES: readonly BookingStatus[] = ["completed", "cancelled"];

const ALLOWED: Record<BookingStatus, readonly BookingStatus[]> = {
  inquiry: ["quoted", "confirmed", "cancelled"],
  quoted: ["confirmed", "cancelled"],
  confirmed: ["assigned", "cancelled"],
  assigned: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function isBookingStatus(value: unknown): value is BookingStatus {
  return typeof value === "string" && (BOOKING_STATUSES as readonly string[]).includes(value);
}

/** Wat vanuit deze stand mag — voedt de knoppen in het ops-dashboard. */
export function allowedTransitions(from: BookingStatus): readonly BookingStatus[] {
  return ALLOWED[from];
}

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return ALLOWED[from].includes(to);
}

/** Het domeinevent dat bij het bereiken van een stand hoort. */
export const STATUS_EVENT = {
  inquiry: null,
  quoted: "booking.quoted",
  confirmed: "booking.confirmed",
  assigned: "booking.driver_assigned",
  in_progress: "booking.in_progress",
  completed: "booking.completed",
  cancelled: "booking.cancelled",
} as const satisfies Record<BookingStatus, string | null>;

/** Nederlandse labels voor het ops-dashboard. */
export const STATUS_LABELS: Record<BookingStatus, string> = {
  inquiry: "Aanvraag",
  quoted: "Offerte uit",
  confirmed: "Bevestigd",
  assigned: "Chauffeur toegewezen",
  in_progress: "Onderweg",
  completed: "Afgerond",
  cancelled: "Geannuleerd",
};
