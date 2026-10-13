// F-30: volledige prijsopbouw in UW RIT. Bewijst (1) dat het nieuwe API-veld
// `priceBreakdown` een kopie van de snapshot is en het totaal niet raakt, (2) dat
// useRouteQuote het ongewijzigd doorgeeft, en (3) dat rideBuildUp alleen
// servercomponenten toont die exact op `price` sluiten. Geen Supabase.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { readyQuoteFromResponse } from "@/components/shared/useRouteQuote";
import { calculateBookingPrice } from "@/lib/pricing/engine";
import { amsterdamDepartureIso } from "@/lib/pricing/departure-time";
import { NO_AIRPORT, type PricingQuoteResult } from "@/lib/pricing/service";
import { parsePriceBreakdown, publicPriceBreakdown, type PublicPriceBreakdown } from "@/lib/pricing/public-price-breakdown";
import type { PriceSnapshot } from "@/lib/pricing/snapshot";
import { rideBuildUp, showLegalComparison, type BuildUpRow } from "./ride-result";

type AvailableQuote = Extract<PricingQuoteResult, { available: true }>;

/** Vaste route €102 enkel / €184 retour (zoals productie, F-29). */
function fixedQuote(over: Partial<AvailableQuote> = {}): AvailableQuote {
  return {
    available: true,
    source: "fixed_route_prices",
    price: 102,
    singlePrice: 102,
    returnPrice: 184,
    returnApplied: false,
    priceCents: 10200,
    singlePriceCents: 10200,
    returnPriceCents: 18400,
    rideOnlySinglePriceCents: 10200,
    currency: "EUR",
    vatRate: 9,
    distanceKm: 18,
    estimatedDurationMin: 25,
    vehicleClass: "executive-ev",
    route: { pickupSlug: "amsterdam-zuidas", dropoffSlug: "schiphol", label: "Zuidas → AMS" },
    isAirportTransfer: true,
    airport: { ...NO_AIRPORT, dropoffIsAirport: true, isAirportDropoff: true, isAirportTransfer: true },
    dataSource: "supabase",
    fingerprint: "fp",
    pickupApproach: null,
    economicFloor: null,
    airportArrival: null,
    ...over,
  };
}

const RETURN = { price: 184, returnApplied: true, priceCents: 18400 } as const;
/** Schiphol → stad met aankomsttoeslag €12,50 (#74): zit in priceCents, nooit een losse regel. */
const ARRIVAL = {
  price: 115,
  singlePrice: 115,
  priceCents: 11450,
  singlePriceCents: 11450,
  returnPriceCents: 19650,
  airport: { ...NO_AIRPORT, pickupIsAirport: true, isAirportPickup: true, isAirportTransfer: true, flightDirection: "arrival" as const },
  airportArrival: { airportSlug: "schiphol", surchargeCents: 1250, appliedOnce: true as const },
};
/** Afstandstarief met aanrijcomponent én diens (interne) nachtpremie. */
const APPROACH = {
  source: "distance_tariff" as const,
  price: 131,
  singlePrice: 131,
  priceCents: 13075,
  singlePriceCents: 13075,
  returnPriceCents: 23075,
  rideOnlySinglePriceCents: 10000,
  pickupApproach: { approachNightPremiumCents: 461 } as unknown as AvailableQuote["pickupApproach"],
};

async function snapshotFor(quote: AvailableQuote, time: string, returnTime?: string): Promise<PriceSnapshot> {
  const departureAt = amsterdamDepartureIso("2099-11-12", time) ?? undefined;
  const returnDepartureAt = returnTime ? amsterdamDepartureIso("2099-11-19", returnTime) ?? undefined : undefined;
  const { snapshot } = await calculateBookingPrice(
    { pickup: "a", dropoff: "b", returnTrip: quote.returnApplied, departureAt, returnDepartureAt },
    {
      getQuote: async () => quote,
      loadEventPricing: async () => null,
      now: () => new Date("2026-10-01T08:00:00.000Z"),
      generateQuoteId: () => "0192f0c0-0000-7000-8000-000000000f30",
    }
  );
  assert.ok(snapshot);
  return snapshot;
}

/** De ready-quote zoals de UI hem krijgt: route.ts-respons → useRouteQuote. */
function uiQuote(quote: AvailableQuote, snapshot: PriceSnapshot) {
  return readyQuoteFromResponse({
    available: true,
    price: snapshot.totalCents / 100, // = route.ts `displayPrice`
    returnApplied: quote.returnApplied,
    distanceKm: quote.distanceKm,
    estimatedDurationMin: quote.estimatedDurationMin,
    isAirportTransfer: quote.airport.isAirportTransfer,
    flightDirection: quote.airport.flightDirection,
    quoteId: snapshot.quoteId,
    priceBreakdown: JSON.parse(JSON.stringify(publicPriceBreakdown(snapshot))),
  });
}

const cents = (rows: BuildUpRow[]) => rows.filter((r) => r.kind === "component").reduce((s, r) => s + r.cents, 0);
const total = (rows: BuildUpRow[]) => rows.find((r) => r.kind === "total")!.amount;
const sources = (rows: BuildUpRow[]) => rows.map((r) => r.source);

const SCENARIOS: [string, AvailableQuote, string, string?][] = [
  ["enkel overdag", fixedQuote(), "14:30"],
  ["enkel nacht", fixedQuote(), "23:30"],
  ["retour heen dag, terug nacht", fixedQuote(RETURN), "14:30", "23:30"],
  ["retour heen nacht, terug dag", fixedQuote(RETURN), "23:30", "14:30"],
  ["retour beide nacht", fixedQuote(RETURN), "23:30", "02:00"],
  ["aankomst luchthaven (#74) nacht", fixedQuote(ARRIVAL), "23:30"],
  ["afstandstarief + aanrijcomponent nacht", fixedQuote(APPROACH), "23:30"],
];

/* ── 1. API: additief, alleen-lezen, totaal identiek ── */

test("F-30 API: priceBreakdown is een kopie van de snapshot; totaal identiek aan price in elk scenario", async () => {
  for (const [name, quote, time, returnTime] of SCENARIOS) {
    const snapshot = await snapshotFor(quote, time, returnTime);
    const oldPrice = snapshot.totalCents / 100; // route.ts vóór én na F-30
    const b = publicPriceBreakdown(snapshot);
    assert.equal(b.totalCents, snapshot.totalCents, name);
    assert.equal(b.totalCents / 100, oldPrice, name);
    assert.equal(b.subtotalCents, snapshot.subtotalCents, name);
    for (const a of b.adjustments) {
      assert.ok(snapshot.adjustments.some((s) => s.code === a.code && s.amountCents === a.amountCents), `${name}: ${a.code}`);
    }
    // Nooit interne regels/labels/metadata naar buiten.
    assert.ok(b.adjustments.every((a) => Object.keys(a).sort().join() === "amountCents,code"), name);
    assert.ok(!b.adjustments.some((a) => (a.code as string) === "pickup_approach_night_premium"), name);
  }
});

test("F-30 API: route.ts voegt alleen het veld toe — price blijft snapshot-totaal", () => {
  const src = readFileSync("app/api/pricing/quote/route.ts", "utf8");
  assert.match(src, /const displayPrice = snapshot\.totalCents \/ 100;/);
  assert.match(src, /price: displayPrice,/);
  assert.match(src, /priceBreakdown: publicPriceBreakdown\(snapshot\),/);
  assert.doesNotMatch(src, /airportArrival|pickupApproach/, "interne componenten blijven buiten de publieke respons");
});

test("F-30 API: retour heen dag/terug nacht → 184 + 15,30 = 199,30 (zoals productie)", async () => {
  const b = publicPriceBreakdown(await snapshotFor(fixedQuote(RETURN), "14:30", "23:30"));
  assert.deepEqual(b, { subtotalCents: 18400, totalCents: 19930, adjustments: [{ code: "night_return", amountCents: 1530 }] });
});

test("F-30 API: evenementregels gaan mee als ze in de snapshot staan; 0-regels nooit", () => {
  const snap = {
    subtotalCents: 10200,
    totalCents: 10950,
    adjustments: [
      { code: "night_outbound", amountCents: 0 },
      { code: "event_outbound", amountCents: 750 },
    ],
  } as unknown as PriceSnapshot;
  assert.deepEqual(publicPriceBreakdown(snap).adjustments, [{ code: "event_outbound", amountCents: 750 }]);
});

/* ── 2. useRouteQuote: doorgeven zonder gedragswijziging ── */

const RESPONSE = {
  available: true,
  price: 199.3,
  returnApplied: true,
  distanceKm: 18,
  estimatedDurationMin: 25,
  isAirportTransfer: true,
  flightDirection: "departure",
  quoteId: "q-f30",
};

test("F-30 hook: bestaande velden identiek met én zonder priceBreakdown", () => {
  const without = readyQuoteFromResponse(RESPONSE);
  assert.deepEqual(without, {
    status: "ready",
    amount: without.amount,
    price: 199.3,
    returnApplied: true,
    distanceKm: 18,
    estimatedDurationMin: 25,
    quoteId: "q-f30",
    airport: { isTransfer: true, direction: "departure" },
  });
  assert.equal("breakdown" in without, false, "hero en /boeken zien geen nieuw veld als de server niets levert");
  const bd: PublicPriceBreakdown = { subtotalCents: 18400, totalCents: 19930, adjustments: [{ code: "night_return", amountCents: 1530 }] };
  const withBd = readyQuoteFromResponse({ ...RESPONSE, priceBreakdown: bd });
  const { breakdown, ...rest } = withBd;
  assert.deepEqual(rest, without);
  assert.deepEqual(breakdown, bd);
});

test("F-30 hook: ongeldige priceBreakdown → genegeerd (geen schatting)", () => {
  for (const bad of [
    null,
    "x",
    { subtotalCents: 184, totalCents: 199.3, adjustments: [] },
    { subtotalCents: 18400, totalCents: 19930 },
    { subtotalCents: 18400, totalCents: 19930, adjustments: [{ code: "airport_arrival", amountCents: 1250 }] },
    { subtotalCents: 18400, totalCents: 19930, adjustments: [{ code: "night_return", amountCents: "1530" }] },
  ]) {
    assert.equal(parsePriceBreakdown(bad), undefined, JSON.stringify(bad));
    assert.equal("breakdown" in readyQuoteFromResponse({ ...RESPONSE, priceBreakdown: bad }), false);
  }
});

/* ── 3. rideBuildUp: alleen servercomponenten, som = totaal ── */

test("F-30 opbouw: in elk scenario sluiten de getoonde regels exact op price", async () => {
  for (const [name, quote, time, returnTime] of SCENARIOS) {
    const snapshot = await snapshotFor(quote, time, returnTime);
    const rows = rideBuildUp(uiQuote(quote, snapshot));
    assert.equal(total(rows), snapshot.totalCents / 100, `${name}: totaal = serverprijs`);
    const comp = rows.filter((r) => r.kind === "component");
    if (comp.length) assert.equal(cents(rows), snapshot.totalCents, `${name}: Σ regels = totaal`);
    for (const r of comp) assert.match(r.source, /^priceBreakdown\./, name);
  }
});

test("F-30 opbouw: retour heen dag, terug nacht → Ritprijs 184 + Nachttarief retour 15,30 = 199,30", async () => {
  const quote = fixedQuote(RETURN);
  const rows = rideBuildUp(uiQuote(quote, await snapshotFor(quote, "14:30", "23:30")));
  assert.deepEqual(rows, [
    { kind: "component", labelKey: "opbouwRitprijs", amount: 184, cents: 18400, source: "priceBreakdown.subtotalCents" },
    { kind: "component", labelKey: "opbouwNachttariefRetour", amount: 15.3, cents: 1530, source: "priceBreakdown.adjustments.night_return" },
    { kind: "total", labelKey: "vastRetour", amount: 199.3, source: "price" },
  ]);
});

test("F-30 opbouw: retour overdag → alleen het totaal (geen subtotaal = totaal, geen ritdeelsplitsing)", async () => {
  const quote = fixedQuote(RETURN);
  const rows = rideBuildUp(uiQuote(quote, await snapshotFor(quote, "14:30", "18:00")));
  assert.deepEqual(sources(rows), ["price"]);
});

test("F-30 opbouw: enkel nacht → afstand, reistijd, ritprijs, nachttarief, totaal; enkel dag ongewijzigd", async () => {
  const quote = fixedQuote();
  const night = rideBuildUp(uiQuote(quote, await snapshotFor(quote, "23:30")));
  assert.deepEqual(sources(night), [
    "distanceKm",
    "estimatedDurationMin",
    "priceBreakdown.subtotalCents",
    "priceBreakdown.adjustments.night_outbound",
    "price",
  ]);
  assert.equal(night.find((r) => r.source === "priceBreakdown.adjustments.night_outbound")?.labelKey, "opbouwNachttarief");
  const day = rideBuildUp(uiQuote(quote, await snapshotFor(quote, "14:30")));
  assert.deepEqual(sources(day), ["distanceKm", "estimatedDurationMin", "price"]);
});

test("F-30 opbouw: aankomsttoeslag (#74) zit in de ritprijs, nooit als losse regel", async () => {
  const quote = fixedQuote(ARRIVAL);
  const rows = rideBuildUp(uiQuote(quote, await snapshotFor(quote, "23:30")));
  const ritprijs = rows.find((r) => r.source === "priceBreakdown.subtotalCents");
  assert.equal(ritprijs?.kind === "component" && ritprijs.cents, 11450, "incl. €12,50 aankomsttoeslag");
  // Nachttarief alleen over de passagiersrit (10200), niet over de toeslag.
  const nacht = rows.find((r) => r.source === "priceBreakdown.adjustments.night_outbound");
  assert.equal(nacht?.kind === "component" && nacht.cents, 1530);
  assert.equal(total(rows), 129.8);
  assert.ok(!rows.some((r) => /aankomst|arrival/i.test(r.source + r.labelKey)));
});

test("F-30 opbouw: niet-publieke regel (aanrijpremie) → regels sluiten niet → alleen het totaal", async () => {
  const quote = fixedQuote(APPROACH);
  const rows = rideBuildUp(uiQuote(quote, await snapshotFor(quote, "23:30")));
  assert.deepEqual(sources(rows), ["distanceKm", "estimatedDurationMin", "price"]);
});

test("F-30 opbouw: evenemententarief verborgen bij 0, bij afwezigheid (mode off) én bij > 0", () => {
  const base = { price: 102, returnApplied: false, distanceKm: 0, estimatedDurationMin: 0 };
  // mode=off: de server levert geen evenementregel → alleen totaal.
  assert.deepEqual(sources(rideBuildUp({ ...base, breakdown: { subtotalCents: 10200, totalCents: 10200, adjustments: [] } })), ["price"]);
  // Bedrag 0 → geen regel.
  const zero = rideBuildUp({ ...base, breakdown: { subtotalCents: 10200, totalCents: 10200, adjustments: [{ code: "event_outbound", amountCents: 0 }] } });
  assert.deepEqual(sources(zero), ["price"]);
  // Zelfs live (> 0) nog niet tonen: zonder die regel sluit de opbouw niet → alleen totaal, niets geschat.
  const live = rideBuildUp({
    ...base,
    price: 124.8,
    breakdown: {
      subtotalCents: 10200,
      totalCents: 12480,
      adjustments: [
        { code: "night_outbound", amountCents: 1530 },
        { code: "event_outbound", amountCents: 750 },
      ],
    },
  });
  assert.deepEqual(sources(live), ["price"]);
});

test("F-30 opbouw: breakdown die niet bij price hoort of ontbreekt → alleen het totaal", () => {
  const q = { price: 199.3, returnApplied: true, distanceKm: 18, estimatedDurationMin: 25 };
  assert.deepEqual(sources(rideBuildUp(q)), ["price"]);
  const mismatch = { subtotalCents: 18400, totalCents: 19900, adjustments: [{ code: "night_return" as const, amountCents: 1500 }] };
  assert.deepEqual(sources(rideBuildUp({ ...q, breakdown: mismatch })), ["price"]);
});

test("F-32 ongewijzigd: wettelijke vergelijking alleen bij enkele rit, ook met opbouw", () => {
  const breakdown: PublicPriceBreakdown = { subtotalCents: 18400, totalCents: 19930, adjustments: [{ code: "night_return", amountCents: 1530 }] };
  assert.equal(showLegalComparison({ price: 199.3, returnApplied: true, distanceKm: 18, estimatedDurationMin: 25, breakdown }), false);
  assert.equal(showLegalComparison({ price: 117.3, returnApplied: false, distanceKm: 18, estimatedDurationMin: 25 }), true);
});

test("F-30 copy: alle opbouwlabels bestaan in nl en en", () => {
  for (const file of ["messages/nl.json", "messages/en.json"]) {
    const rz = JSON.parse(readFileSync(file, "utf8")).routezoeker as Record<string, string>;
    for (const k of ["opbouwRitprijs", "opbouwNachttarief", "opbouwNachttariefHeen", "opbouwNachttariefRetour"]) {
      assert.equal(typeof rz[k], "string", `${file}: ${k}`);
    }
  }
});
