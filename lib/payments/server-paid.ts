/**
 * Bewijs van een server-bevestigde betaling (Experience 2.0 §8, harde guard).
 *
 * "Betaling ontvangen" en "€X betaald" mogen uitsluitend verschijnen nadat
 * GET /api/payments/status `status: "paid"` meldde (webhook-gezet). Een
 * create-intent, een geslaagde client-side `confirmPayment`, een Stripe-redirect
 * of een `pending`-status is daarvoor NIET genoeg.
 *
 * Afgedwongen op twee niveaus:
 *   · type: `ServerPaidProof` draagt een merk dat buiten deze module niet te
 *     maken is (alleen via een cast);
 *   · runtime: alleen objecten die `serverPaidProof()` zelf uitgaf, staan in de
 *     module-private WeakSet. Een nagemaakt object (directe props, cast, JSON
 *     uit storage na een reload) faalt `isServerPaid()`.
 */

declare const paidBrand: unique symbol;

export type ServerPaidProof = Readonly<{
  /** Betaald bedrag in centen; `null` als de server geen bruikbaar bedrag gaf. */
  amountCents: number | null;
  currency: string;
}> & { readonly [paidBrand]: true };

const issued = new WeakSet<object>();

function positiveInt(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}

/**
 * Maakt het bewijs uit de status-respons. `intent` (create-intent-respons, ook
 * server) levert alleen een terugvalbedrag; hij kan nooit zelf een bewijs maken.
 */
export function serverPaidProof(
  statusResponse: unknown,
  intent: { amount: number; currency: string } | null
): ServerPaidProof | null {
  if (typeof statusResponse !== "object" || statusResponse === null) return null;
  const r = statusResponse as Record<string, unknown>;
  if (r.status !== "paid") return null;
  const amountCents = positiveInt(r.amountPaid) ?? positiveInt(intent?.amount);
  const rawCurrency = typeof r.currency === "string" ? r.currency : intent?.currency;
  const currency = typeof rawCurrency === "string" && /^[a-z]{3}$/i.test(rawCurrency) ? rawCurrency.toLowerCase() : "eur";
  const proof = Object.freeze({ amountCents, currency }) as ServerPaidProof;
  issued.add(proof);
  return proof;
}

export function isServerPaid(value: unknown): value is ServerPaidProof {
  return typeof value === "object" && value !== null && issued.has(value);
}
