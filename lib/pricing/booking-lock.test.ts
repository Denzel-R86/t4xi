import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveBookingPrice,
  type BookingPriceRequest,
  type BookingPriceDeps,
} from "@/lib/pricing/engine";
import { NO_AIRPORT, quoteFingerprint, type PricingQuoteResult } from "@/lib/pricing/service";
import type { StoredSnapshot } from "@/lib/pricing/snapshot";
import { eurosToCents } from "@/lib/payments/create-intent";

const NOW = new Date("2026-08-19T10:00:00.000Z");
const QID = "0192f0c0-0000-7000-8000-0000000abcde";

// Basis-aanvraag (vrije Almere-adressen, enkele rit).
const req = (over: Partial<BookingPriceRequest> = {}): BookingPriceRequest => ({
  pickup: "Almere Poort, Almere",
  dropoff: "Almere Buiten, Almere",
  returnTrip: false,
  passengers: 2,
  quoteId: QID,
  ...over,
});

// Opgeslagen dynamische snapshot (€33), vingerafdruk hoort bij bovenstaande req.
const stored = (over: Partial<StoredSnapshot> = {}): StoredSnapshot => ({
  quoteId: QID,
  pricingVersion: "2026.07.v1",
  pricingSource: "dynamic",
  currency: "EUR",
  subtotalCents: 3300,
  totalCents: 3300,
  routeSnapshot: {
    pickupSlug: "almere-poort-almere",
    dropoffSlug: "almere-buiten-almere",
    vehicleClass: "executive-ev",
    distanceKm: 13.7,
    estimatedDurationMin: 12,
    source: "dynamic",
    sourceLabel: null,
    validFrom: null,
    returnApplied: false,
    vatRate: 9,
    fingerprint: quoteFingerprint({ pickup: "Almere Poort, Almere", dropoff: "Almere Buiten, Almere", returnTrip: false }),
    airport: NO_AIRPORT,
  },
  calculatedAt: "2026-08-19T09:55:00.000Z",
  expiresAt: "2026-08-19T10:10:00.000Z", // 10 min ná NOW → geldig
  ...over,
});

const throwingCompute = (): Promise<PricingQuoteResult> => {
  throw new Error("routing/compute mag in het quote-lock-pad NIET aangeroepen worden");
};

const deps = (over: Partial<BookingPriceDeps> = {}): BookingPriceDeps => ({
  now: NOW,
  readSnapshot: async () => stored(),
  computeQuote: throwingCompute,
  ...over,
});

// ── Quote-lock: exact snapshotbedrag, geen tweede routing ────────────────────

test("dynamische booking gebruikt exact het snapshotbedrag en roept routing NIET opnieuw aan", async () => {
  let computeCalls = 0;
  const out = await resolveBookingPrice(
    req(),
    deps({
      computeQuote: async () => {
        computeCalls++;
        throw new Error("niet aanroepen");
      },
    })
  );
  assert.equal(out.kind, "priced");
  if (out.kind !== "priced") return;
  assert.equal(out.priceEuros, 33); // 3300 cents
  assert.equal(out.pricingSource, "dynamic");
  assert.equal(out.lockedQuoteId, QID);
  assert.equal(computeCalls, 0, "er mag geen enkele routing/compute-call zijn");
});

test("prijs blijft gelijk ook al zou routing NU een andere reistijd/prijs geven", async () => {
  // computeQuote zou €999 teruggeven — maar wordt in het lock-pad nooit gebruikt.
  const out = await resolveBookingPrice(
    req(),
    deps({
      computeQuote: async () => ({
        available: true, source: "distance_tariff", price: 999, singlePrice: 999,
        returnPrice: 1998, returnApplied: false,
        priceCents: eurosToCents(999), singlePriceCents: eurosToCents(999), returnPriceCents: eurosToCents(1998),
        currency: "EUR", vatRate: 9,
        distanceKm: 500, estimatedDurationMin: 600, vehicleClass: "executive-ev",
        route: { pickupSlug: "x", dropoffSlug: "y", label: null },
        isAirportTransfer: false, airport: NO_AIRPORT, dataSource: "routing",
        fingerprint: "x|y|executive-ev|enkel", pickupApproach: null,
      }),
    })
  );
  assert.equal(out.kind === "priced" && out.priceEuros, 33);
});

// ── Weigeringen ──────────────────────────────────────────────────────────────

test("verlopen quoteId wordt geweigerd (quote_expired)", async () => {
  const out = await resolveBookingPrice(req(), deps({ readSnapshot: async () => stored({ expiresAt: "2026-08-19T09:59:00.000Z" }) }));
  assert.equal(out.kind, "error");
  assert.equal(out.kind === "error" && out.error, "quote_expired");
  assert.equal(out.kind === "error" && out.status, 409);
});

test("onbekende quoteId wordt geweigerd (quote_not_found)", async () => {
  const out = await resolveBookingPrice(req(), deps({ readSnapshot: async () => null }));
  assert.equal(out.kind === "error" && out.error, "quote_not_found");
});

test("gemanipuleerde pickup/dropoff/klasse/retour wordt geweigerd (quote_mismatch)", async () => {
  for (const bad of [
    req({ pickup: "Ander adres, Amsterdam" }),
    req({ dropoff: "Weer een ander adres" }),
    req({ vehicleClass: "luxury" }),
    req({ returnTrip: true }),
  ]) {
    const out = await resolveBookingPrice(bad, deps());
    assert.equal(out.kind, "error", `verwacht weigering voor ${bad.pickup}/${bad.dropoff}/${bad.vehicleClass}/${bad.returnTrip}`);
    assert.equal(out.kind === "error" && out.error, "quote_mismatch");
  }
});

test("ongeldige prijsbron in de snapshot wordt geweigerd (quote_invalid)", async () => {
  const out = await resolveBookingPrice(req(), deps({ readSnapshot: async () => stored({ pricingSource: "banaan" }) }));
  assert.equal(out.kind === "error" && out.error, "quote_invalid");
  assert.equal(out.kind === "error" && out.status, 422);
});

test("client kan bedrag/btw/bron niet aanpassen: het bindende bedrag komt UITSLUITEND uit de snapshot", async () => {
  // Zelfs met 'vervuilde' extra velden op de request blijft de prijs 3300/100.
  const dirty = { ...req(), price: 5, totalCents: 500, vatRate: 0, pricingSource: "promotion" } as unknown as BookingPriceRequest;
  const out = await resolveBookingPrice(dirty, deps());
  assert.equal(out.kind === "priced" && out.priceEuros, 33);
  assert.equal(out.kind === "priced" && out.pricingSource, "dynamic");
});

// ── Geen quoteId: vaste route + offerte-op-aanvraag (routing UIT) ─────────────

const fixedQuote = (): PricingQuoteResult => ({
  available: true, source: "fixed_route_prices", price: 50, singlePrice: 50,
  returnPrice: 90, returnApplied: false,
  priceCents: eurosToCents(50), singlePriceCents: eurosToCents(50), returnPriceCents: eurosToCents(90),
  currency: "EUR", vatRate: 9,
  distanceKm: 17, estimatedDurationMin: 20, vehicleClass: "executive-ev",
  route: { pickupSlug: "amsterdam-zuidas", dropoffSlug: "schiphol-airport", label: "vast" },
  isAirportTransfer: true, airport: { ...NO_AIRPORT, dropoffIsAirport: true, isAirportDropoff: true, isAirportTransfer: true },
  dataSource: "supabase", fingerprint: "amsterdam-zuidas|schiphol-airport|executive-ev|enkel",
  pickupApproach: null,
});

test("zonder quoteId werkt een vaste route en wordt routing UITGEZET (allowDistanceTariff:false)", async () => {
  let seenAllow: boolean | undefined = undefined;
  const out = await resolveBookingPrice(req({ quoteId: null }), deps({
    computeQuote: async (input) => { seenAllow = input.allowDistanceTariff; return fixedQuote(); },
  }));
  assert.equal(out.kind === "priced" && out.priceEuros, 50);
  assert.equal(out.kind === "priced" && out.pricingSource, "fixed_route_prices");
  assert.equal(out.kind === "priced" && out.lockedQuoteId, null);
  assert.equal(seenAllow, false, "routing moet uitstaan in het no-quoteId-pad");
});

test("zonder quoteId geeft een niet-vaste route offerte-op-aanvraag (geen bindende dynamische prijs)", async () => {
  const out = await resolveBookingPrice(req({ quoteId: null }), deps({
    computeQuote: async () => ({ available: false, reason: "route_not_fixed", message: "Offerte op aanvraag", airport: NO_AIRPORT }),
  }));
  assert.equal(out.kind, "on_request");
});

test("zonder quoteId geeft capaciteitsoverschrijding een nette fout", async () => {
  const out = await resolveBookingPrice(req({ quoteId: null }), deps({
    computeQuote: async () => ({ available: false, reason: "capacity_exceeded", message: "Offerte op aanvraag", airport: NO_AIRPORT }),
  }));
  assert.equal(out.kind === "error" && out.error, "capacity_exceeded");
});

// Idempotency + atomaire consumptie worden op DB-niveau afgedwongen door de RPC
// create_booking_from_snapshot (FOR UPDATE-lock + consumed_at + unieke index op
// bookings.quote_id) en apart bewezen met een integratietest tegen een Supabase-
// branch (niet-productie) — zie het sessieverslag/migratie 20260807120000.

// ── Nachttarief op het no-quoteId-pad (deterministische vaste route) ─────────
import { amsterdamDepartureIso } from "@/lib/pricing/departure-time";

const NIGHT_ISO = amsterdamDepartureIso("2026-08-20", "23:30")!;
const DAY_ISO = amsterdamDepartureIso("2026-08-20", "12:00")!;

const availableSingle = (price: number): PricingQuoteResult => ({
  available: true, source: "fixed_route_prices", price, singlePrice: price, returnPrice: null,
  returnApplied: false,
  priceCents: eurosToCents(price), singlePriceCents: eurosToCents(price), returnPriceCents: null,
  currency: "EUR", vatRate: 9, distanceKm: 10, estimatedDurationMin: 15,
  vehicleClass: "executive-ev", route: { pickupSlug: "a", dropoffSlug: "b", label: null },
  isAirportTransfer: false, airport: NO_AIRPORT, dataSource: "supabase", fingerprint: "x",
  pickupApproach: null,
});
const availableRetour = (singlePrice: number, returnPrice: number): PricingQuoteResult => ({
  ...(availableSingle(singlePrice) as Extract<PricingQuoteResult, { available: true }>),
  price: returnPrice, returnPrice, returnApplied: true,
  priceCents: eurosToCents(returnPrice), returnPriceCents: eurosToCents(returnPrice),
});
const NIGHT_RET = amsterdamDepartureIso("2026-08-21", "05:30")!; // retour-ritdeel nacht
const DAY_RET = amsterdamDepartureIso("2026-08-21", "12:00")!; // retour-ritdeel dag

test("no-quoteId: enkele vaste route 's nachts → +15% nachttoeslag", async () => {
  const out = await resolveBookingPrice(
    req({ quoteId: null, departureAt: NIGHT_ISO }),
    deps({ computeQuote: async () => availableSingle(100) })
  );
  assert.equal(out.kind, "priced");
  if (out.kind !== "priced") return;
  assert.equal(out.priceEuros, 115); // 100 + 15%
});

test("no-quoteId: enkele vaste route overdag → basisprijs (geen toeslag)", async () => {
  const out = await resolveBookingPrice(
    req({ quoteId: null, departureAt: DAY_ISO }),
    deps({ computeQuote: async () => availableSingle(100) })
  );
  assert.equal(out.kind, "priced");
  if (out.kind !== "priced") return;
  assert.equal(out.priceEuros, 100);
});

test("no-quoteId: retour nacht→nacht → +15% per ritdeel over singlePrice", async () => {
  const out = await resolveBookingPrice(
    req({ quoteId: null, returnTrip: true, departureAt: NIGHT_ISO, returnDepartureAt: NIGHT_RET }),
    deps({ computeQuote: async () => availableRetour(100, 184) })
  );
  assert.equal(out.kind, "priced");
  if (out.kind !== "priced") return;
  assert.equal(out.priceEuros, 214); // 184 bundel + 15 (heen) + 15 (retour)
});

test("no-quoteId: retour dag→nacht → alleen retour-ritdeel +15%", async () => {
  const out = await resolveBookingPrice(
    req({ quoteId: null, returnTrip: true, departureAt: DAY_ISO, returnDepartureAt: NIGHT_RET }),
    deps({ computeQuote: async () => availableRetour(100, 184) })
  );
  assert.equal(out.kind, "priced");
  if (out.kind !== "priced") return;
  assert.equal(out.priceEuros, 199); // 184 + 15 (alleen retour)
});

test("no-quoteId: retour nacht→dag → alleen heen-ritdeel +15%", async () => {
  const out = await resolveBookingPrice(
    req({ quoteId: null, returnTrip: true, departureAt: NIGHT_ISO, returnDepartureAt: DAY_RET }),
    deps({ computeQuote: async () => availableRetour(100, 184) })
  );
  assert.equal(out.kind, "priced");
  if (out.kind !== "priced") return;
  assert.equal(out.priceEuros, 199); // 184 + 15 (alleen heen)
});

test("quote-lock: vingerafdruk bevat vertrektijd → afwijkende tijd = mismatch", async () => {
  const dep = amsterdamDepartureIso("2026-08-19", "23:00")!;
  const base = stored();
  const storedNight = stored({
    routeSnapshot: {
      ...base.routeSnapshot,
      fingerprint: quoteFingerprint({
        pickup: "Almere Poort, Almere",
        dropoff: "Almere Buiten, Almere",
        returnTrip: false,
        departureAt: dep,
      }),
    },
  });
  const okOut = await resolveBookingPrice(req({ departureAt: dep }), deps({ readSnapshot: async () => storedNight }));
  assert.equal(okOut.kind, "priced");
  const other = amsterdamDepartureIso("2026-08-19", "12:00")!;
  const badOut = await resolveBookingPrice(req({ departureAt: other }), deps({ readSnapshot: async () => storedNight }));
  assert.equal(badOut.kind, "error");
  if (badOut.kind !== "error") return;
  assert.equal(badOut.error, "quote_mismatch");
});
