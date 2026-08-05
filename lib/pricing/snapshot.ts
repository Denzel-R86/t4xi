// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY. Pure bouw-/validatielaag voor de persistente prijs-snapshot
// (Sprint 7.6 — PR 7.6.3C). Bevat GEEN database-toegang: dit levert alleen het
// in-memory PriceSnapshot-object + validatie. Persistentie zit in snapshot-store.ts.
// Contract: docs/architecture/price-snapshot-contract.md.
// ─────────────────────────────────────────────────────────────────────────────
import { eurosToCents } from "@/lib/payments/create-intent";
import type { PricingQuoteResult } from "@/lib/pricing/service";

/** Centrale prijsversie. Inert in 7.6.3 (opgeslagen, geen branch-logica). */
export const PRICING_VERSION = "2026.07.v1";

/** Geldigheidsvenster van een quote (quote-lock). */
export const QUOTE_TTL_MS = 15 * 60 * 1000;

/** Toegestane prijsbronnen — exact het database-CHECK-contract. Geen vrije strings. */
export type PricingSource =
  | "fixed_route_prices"
  | "dynamic"
  | "manual"
  | "hotel_rate"
  | "airport_rate"
  | "contract_rate"
  | "promotion";

/** Exact het database-CHECK-domein — bron van waarheid voor geldige pricingSources. */
const PRICING_SOURCES: readonly PricingSource[] = [
  "fixed_route_prices",
  "dynamic",
  "manual",
  "hotel_rate",
  "airport_rate",
  "contract_rate",
  "promotion",
];

/** True als `value` een toegestane pricingSource is (het opgeslagen domein). */
export function isPricingSource(value: string): value is PricingSource {
  return (PRICING_SOURCES as readonly string[]).includes(value);
}

export type PriceSnapshotAdjustment = {
  code: string;
  label: string;
  amountCents: number; // + = toeslag, − = korting (mag negatief)
  taxable: boolean;
  vatRate: number | null;
  sortOrder: number;
};

export type RouteSnapshot = {
  pickupSlug: string;
  dropoffSlug: string;
  vehicleClass: string;
  distanceKm: number | null;
  estimatedDurationMin: number | null;
  source: "fixed_route_prices" | "dynamic";
  sourceLabel: string | null;
  /** valid_from van de tariefregel — nog niet uit de quote beschikbaar in 7.6.3C. */
  validFrom: string | null;
  returnApplied: boolean;
  vatRate: number;
};

export type PriceSnapshot = {
  quoteId: string;
  pricingVersion: string;
  pricingSource: PricingSource;
  currency: "EUR";
  subtotalCents: number;
  adjustments: PriceSnapshotAdjustment[];
  totalCents: number;
  routeSnapshot: RouteSnapshot;
  calculatedAt: string; // ISO-8601 UTC
  expiresAt: string; // ISO-8601 UTC = calculatedAt + 15 min
  createdAt: string; // ISO-8601 UTC
};

type AvailableQuote = Extract<PricingQuoteResult, { available: true }>;

/**
 * Mapt de quote-bron naar een toegestane `pricingSource`. Retourneert `null` bij
 * een onbekende bron — er wordt NOOIT een vrije/dynamische string doorgegeven die
 * buiten het database-contract valt. Vandaag is er precies één bron.
 *
 * Mapping:
 *   quote.source "fixed_route_prices"  →  pricingSource "fixed_route_prices"
 *   quote.source "distance_tariff"     →  pricingSource "dynamic"
 * Een berekende afstandsprijs is per definitie een dynamische bron; "dynamic"
 * zit al in het database-CHECK-contract, dus dit vereist geen migratie.
 * Overige bronnen (manual/hotel_rate/airport_rate/contract_rate/promotion)
 * worden hier toegevoegd zodra ze bestaan.
 */
export function mapPricingSource(source: string): PricingSource | null {
  switch (source) {
    case "fixed_route_prices":
      return "fixed_route_prices";
    case "distance_tariff":
      return "dynamic";
    default:
      return null;
  }
}

const isIntGte0 = (n: number) => Number.isInteger(n) && n >= 0;

/**
 * Bouwt een immutable PriceSnapshot uit een BESCHIKBARE quote. Puur en
 * deterministisch: `quoteId` en `now` worden geïnjecteerd. Alle tijdvelden komen
 * uit hetzelfde `now`-moment (geen aparte klok-aanroepen). Retourneert `null` als
 * de bron niet mapbaar is (dan wordt er geen snapshot geproduceerd).
 *
 * 7.6.3C: nog geen toeslagen → `adjustments` is leeg en `total == subtotal`
 * (= de bindende quote-prijs in integer cents).
 */
export function buildPriceSnapshot(
  quote: AvailableQuote,
  opts: { quoteId: string; now: Date }
): PriceSnapshot | null {
  const pricingSource = mapPricingSource(quote.source);
  if (pricingSource === null) return null;

  const cents = eurosToCents(quote.price);
  const calculatedAt = opts.now.toISOString();
  const expiresAt = new Date(opts.now.getTime() + QUOTE_TTL_MS).toISOString();

  return {
    quoteId: opts.quoteId,
    pricingVersion: PRICING_VERSION,
    pricingSource,
    currency: "EUR",
    subtotalCents: cents,
    adjustments: [],
    totalCents: cents,
    routeSnapshot: {
      pickupSlug: quote.route.pickupSlug,
      dropoffSlug: quote.route.dropoffSlug,
      vehicleClass: quote.vehicleClass,
      distanceKm: quote.distanceKm,
      estimatedDurationMin: quote.estimatedDurationMin,
      source: pricingSource === "fixed_route_prices" ? "fixed_route_prices" : "dynamic",
      sourceLabel: quote.route.label,
      validFrom: null,
      returnApplied: quote.returnApplied,
      vatRate: quote.vatRate,
    },
    calculatedAt,
    expiresAt,
    createdAt: calculatedAt,
  };
}

export type SnapshotValidation = { ok: true } | { ok: false; error: string };

/**
 * Financiële + structurele validatie in de APP-laag (de database doet dit bewust
 * NIET met CHECK-constraints). Weigert een ongeldige snapshot vóór de insert.
 * Kern-invariant: `totalCents === subtotalCents + Σ adjustments.amountCents`.
 */
export function validateSnapshot(s: PriceSnapshot): SnapshotValidation {
  if (s.currency !== "EUR") return { ok: false, error: "currency must be EUR" };
  if (!isIntGte0(s.subtotalCents)) return { ok: false, error: "subtotalCents must be a non-negative integer" };
  if (!isIntGte0(s.totalCents)) return { ok: false, error: "totalCents must be a non-negative integer" };
  // Valideer tegen het OPGESLAGEN domein (pricingSource is hier al gemapt).
  // NIET via mapPricingSource: dat verwacht een quote-bron, niet de pricingSource,
  // en zou 'dynamic'/'manual'/… onterecht afkeuren.
  if (!isPricingSource(s.pricingSource)) return { ok: false, error: `invalid pricingSource: ${s.pricingSource}` };

  for (const a of s.adjustments) {
    if (!Number.isInteger(a.amountCents)) {
      return { ok: false, error: `adjustment "${a.code}" amountCents must be an integer` };
    }
  }
  const sum = s.adjustments.reduce((acc, a) => acc + a.amountCents, 0);
  if (s.totalCents !== s.subtotalCents + sum) {
    return { ok: false, error: `total invariant failed: ${s.totalCents} != ${s.subtotalCents} + ${sum}` };
  }
  if (!(new Date(s.expiresAt).getTime() > new Date(s.calculatedAt).getTime())) {
    return { ok: false, error: "expiresAt must be after calculatedAt" };
  }
  return { ok: true };
}

/**
 * RFC 9562 UUID v7 — 48-bit big-endian ms-timestamp + versie(7)/variant(10) + random.
 * Tijd-geordend, niet-oplopend voorspelbaar. Server-side generator; `now`/`rnd`
 * injecteerbaar voor deterministische tests.
 */
export function uuidv7(now: number = Date.now(), rnd: () => number = Math.random): string {
  const ts = Math.trunc(now); // ms, past binnen 48 bits (< 2^53) → geen BigInt nodig
  const high = Math.floor(ts / 0x1_0000_0000); // bovenste 16 bits
  const low = ts % 0x1_0000_0000; // onderste 32 bits (>= 0)
  const b = new Uint8Array(16);
  b[0] = (high >>> 8) & 0xff;
  b[1] = high & 0xff;
  b[2] = (low >>> 24) & 0xff;
  b[3] = (low >>> 16) & 0xff;
  b[4] = (low >>> 8) & 0xff;
  b[5] = low & 0xff;
  for (let i = 6; i < 16; i++) b[i] = Math.floor(rnd() * 256) & 0xff;
  b[6] = (b[6] & 0x0f) | 0x70; // versie 7
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
