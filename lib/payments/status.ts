/**
 * Pure logica voor GET /api/payments/status (stap 7.5) — testbaar zonder HTTP/DB.
 *
 * `bookingId` (UUID v4) is de capability: willekeurig, niet-enumereerbaar. De
 * respons bevat UITSLUITEND niet-PII betaalstatusvelden — geen naam, e-mail,
 * telefoon, adres of de volledige booking-row, en geen Stripe-secret/clientSecret.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Valideert de ?bookingId=-parameter tot een UUID, of null bij ongeldig/ontbrekend. */
export function parseBookingIdParam(raw: string | null): string | null {
  if (!raw) return null;
  const id = raw.trim().toLowerCase();
  return UUID_RE.test(id) ? id : null;
}

/** De booking-velden die de statuslaag uit Supabase leest. */
export type BookingStatusRow = {
  payment_status: string;
  amount_due_cents: number | null;
  amount_paid_cents: number | null;
  payment_currency: string | null;
  paid_at: string | null;
};

export type PaymentStatusResponse = {
  status: string;
  amountDue: number | null;
  amountPaid: number | null;
  currency: string | null;
  paidAt: string | null;
};

/** Vormt de veilige respons; nooit de volledige row of PII. */
export function shapeStatusResponse(row: BookingStatusRow): PaymentStatusResponse {
  return {
    status: row.payment_status,
    amountDue: row.amount_due_cents,
    amountPaid: row.amount_paid_cents,
    currency: row.payment_currency,
    paidAt: row.paid_at,
  };
}
