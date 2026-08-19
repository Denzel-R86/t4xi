// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY. Pure bouw-/validatielaag voor de persistente prijs-snapshot
// (Sprint 7.6 — PR 7.6.3C). Bevat GEEN database-toegang: dit levert alleen het
// in-memory PriceSnapshot-object + validatie. Persistentie zit in snapshot-store.ts.
// Contract: docs/architecture/price-snapshot-contract.md.
// ─────────────────────────────────────────────────────────────────────────────
import { isNightTariff } from "@/lib/pricing/departure-time";
import type { AirportContext, PricingQuoteResult } from "@/lib/pricing/service";

/** Nachttoeslag: +15% wanneer de ophaaltijd tussen 23:00 en 06:00 valt. */
export const NIGHT_SURCHARGE_RATE = 0.15;

/** Toeslagbedrag in hele centen (afgerond) voor een basisbedrag in centen. */
export function nightSurchargeCents(baseCents: number): number {
  return Math.round(baseCents * NIGHT_SURCHARGE_RATE);
}

/**
 * Stabiele codes van alle nacht-gerelateerde adjustments — de per-ritdeel
 * toeslag (PR #19) ÉN de eenmalige aanrijcomponent-nachtpremie (2026-08-19).
 * Samen gebruikt door app/api/pricing/quote/route.ts om het publieke
 * `nightSurcharge`-veld te vullen: zonder `pickup_approach_night_premium`
 * hierin zou `subtotal + nightSurcharge !== price` kunnen gelden zodra een
 * nachtelijke pickup een aanrijcomponent heeft — een reken-inconsistentie in
 * de publieke respons, niet alleen intern.
 */
export const NIGHT_ADJUSTMENT_CODES = ["night_outbound", "night_return", "pickup_approach_night_premium"] as const;
export function isNightAdjustmentCode(code: string): boolean {
  return (NIGHT_ADJUSTMENT_CODES as readonly string[]).includes(code);
}

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
  /**
   * Manipulatie-bestendige vingerafdruk van de prijsbepalende invoer (zie
   * quoteFingerprint in service.ts). Bij het bevestigen van de boeking opnieuw
   * berekend en vergeleken; mismatch → boeking geweigerd.
   */
  fingerprint: string;
  /**
   * Luchthavencontext op offertemoment. Meegenomen zodat de booking de
   * vluchtnummer-plicht kan afdwingen ZONDER de prijs opnieuw te berekenen.
   */
  airport: AirportContext;
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
  opts: { quoteId: string; now: Date; departureAt?: string; returnDepartureAt?: string }
): PriceSnapshot | null {
  const pricingSource = mapPricingSource(quote.source);
  if (pricingSource === null) return null;

  // Cent-precisie (2026-08-18, pickup-aanrijmodel): `quote.priceCents` is de
  // DEFINITIEVE, al-op-de-cent-afgeronde waarde uit de service — geen aparte
  // euro→cent-herberekening hier. `eurosToCents(quote.price)` zou bij een
  // niet-hele-euro-aanrijcomponent tot 99 cent kunnen afwijken, omdat `price`
  // zelf al is afgerond op hele euro's vóór deze functie ze ziet.
  const cents = quote.priceCents;
  const calculatedAt = opts.now.toISOString();
  const expiresAt = new Date(opts.now.getTime() + QUOTE_TTL_MS).toISOString();

  // Nachttoeslag PER RITDEEL: +15% over de ENKELE-RIT-prijs van UITSLUITEND de
  // passagiersrit (`rideOnlySinglePriceCents`, 2026-08-19) van elk ritdeel
  // waarvan de eigen ophaaltijd tussen 23:00–06:00 valt. Zo krijgt bij een
  // retour uitsluitend het nacht-ritdeel de toeslag (heen overdag + terug 's nachts
  // → alleen op de terugrit, en omgekeerd). Basis is bewust `rideOnlySinglePriceCents`
  // — NIET `singlePriceCents` (dat zou ook de pickup-aanrijcomponent belasten; die
  // krijgt hieronder haar eigen, EENMALIGE nachtpremie, zie approachNightPremiumCents
  // — nooit de generieke per-ritdeel-toeslag, en nooit tweemaal bij een retour).
  // Zonder datum/tijd (bv. homepage-hero) → geen toeslag, alleen het basisbedrag.
  const adjustments: PriceSnapshotAdjustment[] = [];
  const legSurcharge = nightSurchargeCents(quote.rideOnlySinglePriceCents);
  if (legSurcharge > 0 && isNightTariff(opts.departureAt)) {
    adjustments.push({
      code: "night_outbound",
      label: quote.returnApplied ? "Nachttarief heenrit" : "Nachttarief",
      amountCents: legSurcharge,
      taxable: true,
      vatRate: quote.vatRate,
      sortOrder: 1,
    });
  }
  if (quote.returnApplied && legSurcharge > 0 && isNightTariff(opts.returnDepartureAt)) {
    adjustments.push({
      code: "night_return",
      label: "Nachttarief retour",
      amountCents: legSurcharge,
      taxable: true,
      vatRate: quote.vatRate,
      sortOrder: 2,
    });
  }
  // Pickup-aanrijcomponent-nachtpremie (2026-08-19, commercieel akkoord — optie
  // B): EENMALIG, uitsluitend bepaald door de OORSPRONKELIJKE pickup-tijd
  // (al vastgesteld in resolvePickupApproach() via quote.pickupApproach —
  // GEEN nieuwe isNightTariff-aanroep hier, dus geen risico op een andere
  // "nacht"-definitie of een retourtijd die per ongeluk meetelt). Bij een
  // retour precies éénmaal, nooit per ritdeel — in tegenstelling tot
  // night_outbound/night_return hierboven.
  if (quote.pickupApproach && quote.pickupApproach.approachNightPremiumCents > 0) {
    adjustments.push({
      code: "pickup_approach_night_premium",
      label: "Nachttoeslag aanrijcomponent",
      amountCents: quote.pickupApproach.approachNightPremiumCents,
      taxable: true,
      vatRate: quote.vatRate,
      sortOrder: 3,
    });
  }
  const totalCents = cents + adjustments.reduce((s, a) => s + a.amountCents, 0);

  return {
    quoteId: opts.quoteId,
    pricingVersion: PRICING_VERSION,
    pricingSource,
    currency: "EUR",
    subtotalCents: cents,
    adjustments,
    totalCents,
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
      fingerprint: quote.fingerprint,
      airport: quote.airport,
    },
    calculatedAt,
    expiresAt,
    createdAt: calculatedAt,
  };
}

/**
 * Vorm van een UITGELEZEN snapshot (uit price_snapshots). Zoals PriceSnapshot maar
 * `pricingSource` is nog de ruwe DB-string en adjustments zijn hier niet nodig voor
 * de prijs-lock (total_cents is bindend).
 */
export type StoredSnapshot = {
  quoteId: string;
  pricingVersion: string;
  pricingSource: string;
  currency: string;
  subtotalCents: number;
  totalCents: number;
  routeSnapshot: RouteSnapshot;
  calculatedAt: string;
  expiresAt: string;
};

export type SnapshotUsability =
  | { ok: true }
  | { ok: false; reason: "expired" | "invalid_source" | "fingerprint_mismatch" };

/**
 * Pure controle of een uitgelezen snapshot bruikbaar is om een boeking te binden:
 * niet verlopen, geldige prijsbron, en de vingerafdruk komt overeen met de actuele
 * aanvraag. Geeft een specifieke reden bij afkeuring. `not_found`/`already_used`
 * horen bij de IO-laag (read/consume), niet hier.
 */
export function checkSnapshotUsable(
  s: StoredSnapshot,
  opts: { now: Date; expectedFingerprint: string }
): SnapshotUsability {
  if (!(new Date(s.expiresAt).getTime() > opts.now.getTime())) {
    return { ok: false, reason: "expired" };
  }
  if (!isPricingSource(s.pricingSource)) {
    return { ok: false, reason: "invalid_source" };
  }
  if (s.routeSnapshot?.fingerprint !== opts.expectedFingerprint) {
    return { ok: false, reason: "fingerprint_mismatch" };
  }
  return { ok: true };
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
