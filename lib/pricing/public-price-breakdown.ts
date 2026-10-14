import type { PriceSnapshot } from "@/lib/pricing/snapshot";

/**
 * F-30 — publieke, ALLEEN-LEZEN prijsopbouw naast `price` in /api/pricing/quote.
 *
 * Geen nieuwe berekening: dit kopieert uitsluitend bedragen die al in de
 * immutable snapshot staan (`subtotalCents`, `totalCents`, `adjustments`). De
 * bindende prijs blijft `price` (= `snapshot.totalCents / 100`); laat een client
 * dit veld weg, dan verandert er niets aan wat de klant betaalt.
 *
 * Bewust NIET publiek (de snapshot/quote draagt ze wel intern):
 *  - de aankomsttoeslag (#74): eigenaarsbesluit + docs/compliance/schiphol-operation.md
 *    "één inclusieve vaste prijs, geen aparte toeslagregel" — zit in `subtotalCents`;
 *  - de pickup-aanrijcomponent en haar nachtpremie (`pickup_approach_night_premium`):
 *    intern prijsmodel. Ontbreekt die regel, dan sluit subtotaal + regels niet op het
 *    totaal en toont de client (rideBuildUp) alleen het totaal — niets geschat.
 *  - deadhead/economische bodem: zitten al in `subtotalCents`, geen eigen regel.
 */

/** Adjustment-codes die publiek mogen (stabiele codes uit snapshot.ts / event-pricing.ts). */
export const PUBLIC_ADJUSTMENT_CODES = ["night_outbound", "night_return", "event_outbound", "event_return"] as const;
export type PublicAdjustmentCode = (typeof PUBLIC_ADJUSTMENT_CODES)[number];

export type PublicPriceBreakdown = {
  /** Snapshot-subtotaal in cent: de ritprijs vóór nacht-/evenementregels (incl. btw). */
  subtotalCents: number;
  /** Snapshot-totaal in cent: identiek aan `price × 100`. */
  totalCents: number;
  /** Alleen publieke codes, alleen bedragen ≠ 0, in snapshotvolgorde. */
  adjustments: { code: PublicAdjustmentCode; amountCents: number }[];
};

const isPublicCode = (code: string): code is PublicAdjustmentCode =>
  (PUBLIC_ADJUSTMENT_CODES as readonly string[]).includes(code);

/** Server: snapshot → publiek veld. Kopie, geen rekenwerk. */
export function publicPriceBreakdown(snapshot: PriceSnapshot): PublicPriceBreakdown {
  return {
    subtotalCents: snapshot.subtotalCents,
    totalCents: snapshot.totalCents,
    adjustments: snapshot.adjustments
      .filter((a) => isPublicCode(a.code) && a.amountCents !== 0)
      .map((a) => ({ code: a.code as PublicAdjustmentCode, amountCents: a.amountCents })),
  };
}

const isCents = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/**
 * Client: defensief lezen van het API-veld. Alles wat niet exact het contract
 * volgt → `undefined` (de UI valt dan terug op alleen het totaal, zoals vóór F-30).
 */
export function parsePriceBreakdown(raw: unknown): PublicPriceBreakdown | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (!isCents(r.subtotalCents) || !isCents(r.totalCents) || !Array.isArray(r.adjustments)) return undefined;
  const adjustments: PublicPriceBreakdown["adjustments"] = [];
  for (const a of r.adjustments) {
    if (typeof a !== "object" || a === null) return undefined;
    const { code, amountCents } = a as Record<string, unknown>;
    if (typeof code !== "string" || !isPublicCode(code) || !isCents(amountCents)) return undefined;
    adjustments.push({ code, amountCents });
  }
  return { subtotalCents: r.subtotalCents, totalCents: r.totalCents, adjustments };
}
