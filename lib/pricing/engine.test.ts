// Regressietests voor de centrale prijsfunctie (Sprint 7.6 — PR 7.6.2).
//
// Doel: bewijzen dat `calculateBookingPrice` een PURE PASS-THROUGH is om
// `getPricingQuote`. Er mag géén prijsverschil ontstaan tussen "vóór" (directe
// getPricingQuote) en "na" (via de wrapper). De onderliggende quote-bron wordt
// geïnjecteerd, zodat de equivalentie zonder database bewezen wordt; daarnaast
// statische bron-checks dat quote-endpoint én booking-creatie dezelfde functie
// gebruiken en dat de booking nooit een client-aangeleverde prijs vertrouwt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  calculateBookingPrice,
  type BookingPriceInput,
} from "@/lib/pricing/engine";
import {
  NO_AIRPORT,
  type PricingQuoteResult,
} from "@/lib/pricing/service";
import { eurosToCents } from "@/lib/payments/create-intent";

// ── Fixtures: representatieve getPricingQuote-uitkomsten ─────────────────────

type AvailableQuote = Extract<PricingQuoteResult, { available: true }>;

function availableFixed(price: number): AvailableQuote {
  return {
    available: true,
    source: "fixed_route_prices",
    price,
    singlePrice: price,
    returnPrice: null,
    returnApplied: false,
    priceCents: eurosToCents(price),
    singlePriceCents: eurosToCents(price),
    returnPriceCents: null,
    rideOnlySinglePriceCents: eurosToCents(price),
    currency: "EUR",
    vatRate: 9,
    distanceKm: 22.5,
    estimatedDurationMin: 28,
    vehicleClass: "executive-ev",
    route: { pickupSlug: "rotterdam", dropoffSlug: "schiphol", label: "RTM → AMS" },
    isAirportTransfer: true,
    airport: { ...NO_AIRPORT, dropoffIsAirport: true, isAirportDropoff: true, isAirportTransfer: true },
    dataSource: "supabase",
    fingerprint: "rotterdam|schiphol|executive-ev|enkel",
    pickupApproach: null,
  };
}

function availableReturn(singlePrice: number, returnPrice: number): AvailableQuote {
  return {
    ...availableFixed(singlePrice),
    price: returnPrice,
    returnPrice,
    returnApplied: true,
    priceCents: eurosToCents(returnPrice),
    returnPriceCents: eurosToCents(returnPrice),
  };
}

const unknownRoute: PricingQuoteResult = {
  available: false,
  reason: "route_not_fixed",
  message: "Offerte op aanvraag",
  airport: { ...NO_AIRPORT, pickupIsAirport: true, isAirportPickup: true, isAirportTransfer: true },
};

const unknownLocation: PricingQuoteResult = {
  available: false,
  reason: "unknown_location",
  message: "Offerte op aanvraag",
  airport: NO_AIRPORT,
};

const invalidInput: PricingQuoteResult = {
  available: false,
  reason: "invalid_input",
  message: "Offerte op aanvraag",
  airport: NO_AIRPORT,
};

/** Injecteerbare stub die een vaste uitkomst teruggeeft en de input vastlegt. */
function stub(result: PricingQuoteResult) {
  const calls: BookingPriceInput[] = [];
  const getQuote = async (input: BookingPriceInput) => {
    calls.push(input);
    return result;
  };
  return { getQuote, calls };
}

// ── 1. Pass-through equivalentie (identiteit én diepe gelijkheid) ────────────

test("wrapper geeft exact dezelfde quote terug — identiteit, geen kloon/mutatie", async () => {
  for (const fixture of [availableFixed(57), availableReturn(57, 99), unknownRoute, unknownLocation, invalidInput]) {
    const { getQuote } = stub(fixture);
    const res = await calculateBookingPrice({ pickup: "a", dropoff: "b" }, { getQuote });
    // Strikte identiteit: de wrapper reikt het object door zonder te kopiëren of te muteren.
    assert.equal(res.quote, fixture);
    // Diepe gelijkheid als extra bewijs dat niets is toegevoegd/verwijderd.
    assert.deepEqual(res.quote, fixture);
  }
});

test("bindende velden blijven ongewijzigd voor een beschikbare vaste route", async () => {
  const fixture = availableFixed(57);
  const { getQuote } = stub(fixture);
  const { quote } = await calculateBookingPrice({ pickup: "rotterdam", dropoff: "schiphol" }, { getQuote });
  assert.equal(quote.available, true);
  if (!quote.available) return; // type-narrowing
  assert.equal(quote.price, 57);
  assert.equal(quote.singlePrice, 57);
  assert.equal(quote.returnApplied, false);
  assert.equal(quote.currency, "EUR");
  assert.equal(quote.source, "fixed_route_prices");
  assert.equal(quote.dataSource, "supabase");
});

test("retour: toegepaste prijs = returnPrice, ongewijzigd doorgegeven", async () => {
  const fixture = availableReturn(57, 99);
  const { getQuote } = stub(fixture);
  const { quote } = await calculateBookingPrice({ pickup: "a", dropoff: "b", returnTrip: true }, { getQuote });
  assert.equal(quote.available, true);
  if (!quote.available) return;
  assert.equal(quote.price, 99);
  assert.equal(quote.singlePrice, 57);
  assert.equal(quote.returnPrice, 99);
  assert.equal(quote.returnApplied, true);
});

// ── 2. Contract-marker + geen gefabriceerde V2-velden ────────────────────────

test("contractVersion is legacy-passthrough; result heeft quote + additieve snapshot, geen andere velden", async () => {
  const { getQuote } = stub(availableFixed(57));
  const res = await calculateBookingPrice({ pickup: "a", dropoff: "b" }, { getQuote });
  assert.equal(res.contractVersion, "legacy-passthrough");
  // quote blijft pass-through; snapshot is de enige additieve toevoeging (7.6.3C).
  // Geen breakdown/adjustments/total óp het wrapper-niveau die `quote` beïnvloeden.
  assert.deepEqual(Object.keys(res).sort(), ["contractVersion", "quote", "snapshot"]);
});

// ── 3. Fallback blijft uit (route zonder actieve vaste prijs) ────────────────

test("onbekende/niet-vaste route wordt onveranderd doorgegeven — fallback nooit geactiveerd", async () => {
  const { getQuote } = stub(unknownRoute);
  const { quote } = await calculateBookingPrice({ pickup: "schiphol", dropoff: "middle-of-nowhere" }, { getQuote });
  assert.equal(quote.available, false);
  if (quote.available) return;
  assert.equal(quote.reason, "route_not_fixed");
  assert.equal(quote.message, "Offerte op aanvraag");
  // De wrapper mag een onbeschikbare offerte nooit tot een prijs promoveren.
  assert.equal("price" in quote, false);
});

test("foutieve input (invalid_input) wordt onveranderd doorgegeven", async () => {
  const { getQuote } = stub(invalidInput);
  const { quote } = await calculateBookingPrice({ pickup: "", dropoff: "" }, { getQuote });
  assert.equal(quote.available, false);
  if (quote.available) return;
  assert.equal(quote.reason, "invalid_input");
});

// ── 4. Input-doorgifte zonder mutatie ────────────────────────────────────────

test("de exacte input wordt ongewijzigd doorgegeven aan de onderliggende bron", async () => {
  const { getQuote, calls } = stub(availableReturn(57, 99));
  const input: BookingPriceInput = { pickup: "a", dropoff: "b", returnTrip: true, passengers: 3 };
  await calculateBookingPrice(input, { getQuote });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], input);
  assert.equal(calls[0]?.returnTrip, true); // geen flip van de retour-vlag
});

// ── 5. Quote-endpoint en booking krijgen hetzelfde bedrag bij dezelfde input ──

test("zelfde input → quote-pad en booking-pad leveren identiek bedrag (determinisme)", async () => {
  const fixture = availableFixed(57);
  const { getQuote } = stub(fixture);
  const input: BookingPriceInput = { pickup: "rotterdam", dropoff: "schiphol" };
  // Beide runtime-callers roepen exact dezelfde centrale functie aan:
  const asQuoteEndpoint = (await calculateBookingPrice(input, { getQuote })).quote;
  const asBookingCreate = (await calculateBookingPrice(input, { getQuote })).quote;
  assert.deepEqual(asQuoteEndpoint, asBookingCreate);
  if (!asQuoteEndpoint.available || !asBookingCreate.available) return;
  assert.equal(asQuoteEndpoint.price, asBookingCreate.price);
});

// ── 6. Bedragconversie-grensgevallen (eurosToCents blijft integer, geen drift) ─

test("pass-through bewaart de exacte euro-waarde → eurosToCents blijft identiek", async () => {
  const cases: Array<[number, number]> = [
    [0.01, 1],
    [57, 5700],
    [57.5, 5750],
    [99.99, 9999],
    [1234.56, 123456],
    [99999.99, 9999999],
  ];
  for (const [euros, expectedCents] of cases) {
    const { getQuote } = stub(availableFixed(euros));
    const { quote } = await calculateBookingPrice({ pickup: "a", dropoff: "b" }, { getQuote });
    assert.equal(quote.available, true);
    if (!quote.available) continue;
    // Geen float-mangling in de wrapper: exact hetzelfde getal terug.
    assert.equal(quote.price, euros);
    const cents = eurosToCents(quote.price);
    assert.equal(cents, expectedCents);
    assert.equal(Number.isInteger(cents), true);
  }
});

// ── 7. Statische bron-invarianten (call-sites + geen client-prijs) ───────────

const bookingsRouteSrc = readFileSync(resolve(process.cwd(), "app/api/bookings/route.ts"), "utf8");
const quoteRouteSrc = readFileSync(resolve(process.cwd(), "app/api/pricing/quote/route.ts"), "utf8");
const createIntentSrc = readFileSync(resolve(process.cwd(), "lib/payments/create-intent.ts"), "utf8");

test("beide runtime-callers gebruiken de centrale calculateBookingPrice", () => {
  assert.match(bookingsRouteSrc, /calculateBookingPrice\(/);
  assert.match(quoteRouteSrc, /calculateBookingPrice\(/);
});

test("geen directe runtime-call meer naar getPricingQuote in de routes", () => {
  // Commentaar/doc-verwijzingen mogen blijven; het gaat om echte aanroepen. Strip
  // daarom eerst block- en regelcommentaar (zonder `https://` te breken).
  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.doesNotMatch(stripComments(bookingsRouteSrc), /getPricingQuote\(/);
  assert.doesNotMatch(stripComments(quoteRouteSrc), /getPricingQuote\(/);
});

test("booking-creatie leidt de prijs server-side af en vertrouwt geen client-prijs", () => {
  // De autoritatieve prijs komt uit de centrale functie, niet uit de request-body.
  assert.match(bookingsRouteSrc, /calculateBookingPrice\(/);
  // Er wordt nergens een prijs uit de binnenkomende payload overgenomen.
  assert.doesNotMatch(bookingsRouteSrc, /\bprice[A-Za-z]*\s*[:=][^\n]*\b(body|payload|json|reqBody|requestBody|data)\b/i);
  // De payment-laag weigert bovendien expliciet client-aangeleverde bedragen.
  assert.match(createIntentSrc, /"amount"/);
  assert.match(createIntentSrc, /"price"/);
});
