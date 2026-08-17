// Pure unit tests voor de snapshot-bouw/validatie (Sprint 7.6 — PR 7.6.3C).
// Geen database: uitsluitend het in-memory PriceSnapshot-object + validatie + UUID v7.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildPriceSnapshot,
  validateSnapshot,
  mapPricingSource,
  uuidv7,
  PRICING_VERSION,
  QUOTE_TTL_MS,
  type PriceSnapshot,
} from "@/lib/pricing/snapshot";
import { NO_AIRPORT, type PricingQuoteResult } from "@/lib/pricing/service";

type AvailableQuote = Extract<PricingQuoteResult, { available: true }>;

function availableQuote(price: number, over: Partial<AvailableQuote> = {}): AvailableQuote {
  return {
    available: true,
    source: "fixed_route_prices",
    price,
    singlePrice: price,
    returnPrice: null,
    returnApplied: false,
    currency: "EUR",
    vatRate: 9,
    distanceKm: 61,
    estimatedDurationMin: 54,
    vehicleClass: "executive-ev",
    route: { pickupSlug: "rotterdam", dropoffSlug: "schiphol", label: "RTM → AMS" },
    isAirportTransfer: true,
    airport: { ...NO_AIRPORT, dropoffIsAirport: true, isAirportDropoff: true, isAirportTransfer: true },
    dataSource: "supabase",
    fingerprint: "rotterdam|schiphol|executive-ev|enkel",
    ...over,
  };
}

const NOW = new Date("2026-07-30T12:00:00.000Z");
const QID = "0192f0c0-0000-7000-8000-000000000abc";

// ── mapPricingSource ─────────────────────────────────────────────────────────

test("mapPricingSource: bekende bron → zichzelf; onbekende → null (geen vrije strings)", () => {
  assert.equal(mapPricingSource("fixed_route_prices"), "fixed_route_prices");
  assert.equal(mapPricingSource("banaan"), null);
  assert.equal(mapPricingSource(""), null);
  assert.equal(mapPricingSource("dynamic"), null); // bestaat als type, nog niet als runtime-bron
});

// ── buildPriceSnapshot ───────────────────────────────────────────────────────

test("buildPriceSnapshot: correcte integer-cents, subtotal==total, lege adjustments", () => {
  const s = buildPriceSnapshot(availableQuote(119), { quoteId: QID, now: NOW })!;
  assert.equal(s.subtotalCents, 11900);
  assert.equal(s.totalCents, 11900);
  assert.deepEqual(s.adjustments, []);
  assert.equal(Number.isInteger(s.subtotalCents), true);
  assert.equal(Number.isInteger(s.totalCents), true);
  assert.equal(s.currency, "EUR");
  assert.equal(s.pricingVersion, PRICING_VERSION);
  assert.equal(s.pricingSource, "fixed_route_prices");
  assert.equal(s.quoteId, QID);
});

test("buildPriceSnapshot: cents-afronding op halve cent (57.5 → 5750, 99.99 → 9999)", () => {
  assert.equal(buildPriceSnapshot(availableQuote(57.5), { quoteId: QID, now: NOW })!.totalCents, 5750);
  assert.equal(buildPriceSnapshot(availableQuote(99.99), { quoteId: QID, now: NOW })!.totalCents, 9999);
});

test("buildPriceSnapshot: expiry is exact 15 minuten en alle tijdvelden komen uit één now-moment", () => {
  const s = buildPriceSnapshot(availableQuote(119), { quoteId: QID, now: NOW })!;
  assert.equal(s.calculatedAt, NOW.toISOString());
  assert.equal(s.createdAt, NOW.toISOString()); // zelfde moment, geen aparte klok-aanroep
  assert.equal(new Date(s.expiresAt).getTime() - new Date(s.calculatedAt).getTime(), QUOTE_TTL_MS);
  assert.equal(QUOTE_TTL_MS, 15 * 60 * 1000);
});

test("buildPriceSnapshot: routeSnapshot bevat de reconstructiedata", () => {
  const s = buildPriceSnapshot(availableQuote(119, { returnApplied: true }), { quoteId: QID, now: NOW })!;
  assert.deepEqual(s.routeSnapshot, {
    pickupSlug: "rotterdam",
    dropoffSlug: "schiphol",
    vehicleClass: "executive-ev",
    distanceKm: 61,
    estimatedDurationMin: 54,
    source: "fixed_route_prices",
    sourceLabel: "RTM → AMS",
    validFrom: null, // 7.6.3C: nog niet uit de quote beschikbaar
    returnApplied: true,
    vatRate: 9,
    fingerprint: "rotterdam|schiphol|executive-ev|enkel",
    airport: { ...NO_AIRPORT, dropoffIsAirport: true, isAirportDropoff: true, isAirportTransfer: true },
  });
});

test("buildPriceSnapshot: onbekende bron → null (geen snapshot, geen vrije pricingSource)", () => {
  const bogus = availableQuote(119, { source: "verzonnen_bron" as AvailableQuote["source"] });
  assert.equal(buildPriceSnapshot(bogus, { quoteId: QID, now: NOW }), null);
});

// ── validateSnapshot ─────────────────────────────────────────────────────────

function baseSnapshot(over: Partial<PriceSnapshot> = {}): PriceSnapshot {
  const s = buildPriceSnapshot(availableQuote(119), { quoteId: QID, now: NOW })!;
  return { ...s, ...over };
}

test("validateSnapshot: geldige snapshot zonder adjustments", () => {
  assert.deepEqual(validateSnapshot(baseSnapshot()), { ok: true });
});

test("validateSnapshot: positieve toeslag telt mee in total-invariant", () => {
  const s = baseSnapshot({
    subtotalCents: 11900,
    adjustments: [{ code: "night", label: "Nachttarief", amountCents: 500, taxable: true, vatRate: 9, sortOrder: 1 }],
    totalCents: 12400,
  });
  assert.deepEqual(validateSnapshot(s), { ok: true });
});

test("validateSnapshot: negatieve adjustment (korting) is toegestaan en telt mee", () => {
  const s = baseSnapshot({
    subtotalCents: 11900,
    adjustments: [{ code: "return_discount", label: "Retourvoordeel", amountCents: -900, taxable: true, vatRate: 9, sortOrder: 1 }],
    totalCents: 11000,
  });
  assert.deepEqual(validateSnapshot(s), { ok: true });
});

test("validateSnapshot: meerdere adjustments — som moet kloppen", () => {
  const s = baseSnapshot({
    subtotalCents: 10000,
    adjustments: [
      { code: "airport_fee", label: "Luchthaventoeslag", amountCents: 750, taxable: true, vatRate: 9, sortOrder: 1 },
      { code: "promo", label: "Actie", amountCents: -250, taxable: false, vatRate: null, sortOrder: 2 },
    ],
    totalCents: 10500,
  });
  assert.deepEqual(validateSnapshot(s), { ok: true });
});

test("validateSnapshot: geschonden total-invariant wordt geweigerd", () => {
  const s = baseSnapshot({
    subtotalCents: 10000,
    adjustments: [{ code: "night", label: "Nacht", amountCents: 500, taxable: true, vatRate: 9, sortOrder: 1 }],
    totalCents: 12000, // moet 10500 zijn
  });
  const v = validateSnapshot(s);
  assert.equal(v.ok, false);
});

test("validateSnapshot: niet-integere cents worden geweigerd", () => {
  assert.equal(validateSnapshot(baseSnapshot({ subtotalCents: 100.5, totalCents: 100.5 })).ok, false);
  const adj = baseSnapshot({
    subtotalCents: 10000,
    adjustments: [{ code: "x", label: "x", amountCents: 10.5, taxable: true, vatRate: null, sortOrder: 1 }],
    totalCents: 10010.5,
  });
  assert.equal(validateSnapshot(adj).ok, false);
});

test("validateSnapshot: currency != EUR en verlopen-vóór-berekend worden geweigerd", () => {
  assert.equal(validateSnapshot(baseSnapshot({ currency: "USD" as "EUR" })).ok, false);
  assert.equal(
    validateSnapshot(baseSnapshot({ calculatedAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() - 1000).toISOString() })).ok,
    false
  );
});

test("validateSnapshot: ongeldige pricingSource wordt geweigerd", () => {
  assert.equal(validateSnapshot(baseSnapshot({ pricingSource: "banaan" as PriceSnapshot["pricingSource"] })).ok, false);
});

// ── uuidv7 ───────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test("uuidv7: geldig formaat, versie-nibble 7 en variant 10xx", () => {
  const id = uuidv7();
  assert.match(id, UUID_RE);
  assert.equal(id[14], "7"); // versie
  assert.ok(["8", "9", "a", "b"].includes(id[19])); // variant
});

test("uuidv7: deterministisch met geïnjecteerde now+rnd", () => {
  const rnd = () => 0.5;
  assert.equal(uuidv7(1_700_000_000_000, rnd), uuidv7(1_700_000_000_000, rnd));
});

test("uuidv7: tijd-geordend (latere timestamp sorteert lexicografisch hoger)", () => {
  const a = uuidv7(1_700_000_000_000, () => 0);
  const b = uuidv7(1_700_000_001_000, () => 0);
  assert.ok(a < b);
});

test("uuidv7: uniek over vele aanroepen", () => {
  const set = new Set<string>();
  for (let i = 0; i < 1000; i++) set.add(uuidv7());
  assert.equal(set.size, 1000);
});

// ── buildPriceSnapshot: nachttarief +15% PER RITDEEL over singlePrice ─────────
import { amsterdamDepartureIso } from "@/lib/pricing/departure-time";

const NIGHT = amsterdamDepartureIso("2026-07-15", "23:30")!; // nacht
const NIGHT2 = amsterdamDepartureIso("2026-07-16", "05:30")!; // nacht (retourdeel)
const DAY = amsterdamDepartureIso("2026-07-15", "12:00")!; // dag
const DAY2 = amsterdamDepartureIso("2026-07-16", "12:00")!; // dag (retourdeel)

// ── Enkele rit ───────────────────────────────────────────────────────────────
test("enkele rit nacht → +15% night_outbound over singlePrice", () => {
  const s = buildPriceSnapshot(availableQuote(100), { quoteId: QID, now: NOW, departureAt: NIGHT })!;
  assert.equal(s.subtotalCents, 10000);
  assert.deepEqual(s.adjustments.map((a) => a.code), ["night_outbound"]);
  assert.equal(s.adjustments[0].amountCents, 1500);
  assert.equal(s.adjustments[0].label, "Nachttarief");
  assert.equal(s.totalCents, 11500);
  assert.equal(validateSnapshot(s).ok, true);
});

test("enkele rit dag → geen toeslag", () => {
  const s = buildPriceSnapshot(availableQuote(100), { quoteId: QID, now: NOW, departureAt: DAY })!;
  assert.deepEqual(s.adjustments, []);
  assert.equal(s.totalCents, 10000);
});

test("enkele rit zonder departureAt → geen toeslag (basisprijs, bv. hero)", () => {
  const s = buildPriceSnapshot(availableQuote(100), { quoteId: QID, now: NOW })!;
  assert.deepEqual(s.adjustments, []);
  assert.equal(s.totalCents, s.subtotalCents);
});

test("enkele rit nacht: afronding op hele cent (single 99.99 → 1500)", () => {
  const s = buildPriceSnapshot(availableQuote(99.99), { quoteId: QID, now: NOW, departureAt: NIGHT })!;
  assert.equal(s.adjustments[0].amountCents, 1500); // round(9999*0.15)
  assert.equal(s.totalCents, 11499);
  assert.equal(validateSnapshot(s).ok, true);
});

// ── Retour-matrix (fixed: subtotal = gekorte bundel €184, singlePrice €102) ───
const fixedRetour = () => availableQuote(184, { singlePrice: 102, returnPrice: 184, returnApplied: true });
const LEG = 1530; // round(10200 * 0.15)

test("retour dag→dag → geen toeslag", () => {
  const s = buildPriceSnapshot(fixedRetour(), { quoteId: QID, now: NOW, departureAt: DAY, returnDepartureAt: DAY2 })!;
  assert.deepEqual(s.adjustments, []);
  assert.equal(s.totalCents, 18400);
});

test("retour dag→nacht → alleen night_return (+15% over singlePrice)", () => {
  const s = buildPriceSnapshot(fixedRetour(), { quoteId: QID, now: NOW, departureAt: DAY, returnDepartureAt: NIGHT2 })!;
  assert.deepEqual(s.adjustments.map((a) => a.code), ["night_return"]);
  assert.equal(s.adjustments[0].amountCents, LEG);
  assert.equal(s.totalCents, 18400 + LEG);
  assert.equal(validateSnapshot(s).ok, true);
});

test("retour nacht→dag → alleen night_outbound", () => {
  const s = buildPriceSnapshot(fixedRetour(), { quoteId: QID, now: NOW, departureAt: NIGHT, returnDepartureAt: DAY2 })!;
  assert.deepEqual(s.adjustments.map((a) => a.code), ["night_outbound"]);
  assert.equal(s.adjustments[0].label, "Nachttarief heenrit");
  assert.equal(s.totalCents, 18400 + LEG);
});

test("retour nacht→nacht → beide ritdelen +15% over singlePrice", () => {
  const s = buildPriceSnapshot(fixedRetour(), { quoteId: QID, now: NOW, departureAt: NIGHT, returnDepartureAt: NIGHT2 })!;
  assert.deepEqual(s.adjustments.map((a) => a.code), ["night_outbound", "night_return"]);
  assert.equal(s.totalCents, 18400 + LEG + LEG);
  assert.equal(validateSnapshot(s).ok, true);
});

test("distance-tariff retour nacht→nacht → +15% over single per ritdeel", () => {
  // distance: returnPrice = single*2 → subtotal 200, singlePrice 100 → 2×1500
  const q = availableQuote(200, { source: "distance_tariff", singlePrice: 100, returnPrice: 200, returnApplied: true });
  const s = buildPriceSnapshot(q, { quoteId: QID, now: NOW, departureAt: NIGHT, returnDepartureAt: NIGHT2 })!;
  assert.equal(s.pricingSource, "dynamic");
  assert.equal(s.totalCents, 20000 + 1500 + 1500);
  assert.equal(validateSnapshot(s).ok, true);
});

test("retour zonder retourtijd → alleen heen-ritdeel kan nacht krijgen", () => {
  const s = buildPriceSnapshot(fixedRetour(), { quoteId: QID, now: NOW, departureAt: NIGHT })!;
  assert.deepEqual(s.adjustments.map((a) => a.code), ["night_outbound"]);
});
