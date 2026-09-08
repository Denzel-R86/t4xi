// Integratietests voor het evenemententarief in de ACTIEVE prijspijplijn
// (Phase 4). Bewijst dat de toeslag via `calculateBookingPrice` in de snapshot
// landt, dat het no-quoteId-boekingspad exact dezelfde uitkomst geeft, en dat
// een uitgebrachte quote-lock immuun is voor latere wijzigingen in de
// evenementconfiguratie. De onderliggende quote-bron en de eventdata worden
// beide geïnjecteerd — geen database, geen netwerk, geen klok.
import { test } from "node:test";
import assert from "node:assert/strict";

import { calculateBookingPrice, resolveBookingPrice } from "@/lib/pricing/engine";
import { NO_AIRPORT, quoteFingerprint, type PricingQuoteResult } from "@/lib/pricing/service";
import { eurosToCents } from "@/lib/payments/create-intent";
import type { EventPricingData } from "@/lib/pricing/event-store";
import type {
  EventFeeRule,
  EventImpactLevel,
  PricingEvent,
  PricingEventWindow,
  PricingEventZone,
} from "@/lib/pricing/event-pricing";
import type { StoredSnapshot } from "@/lib/pricing/snapshot";

type AvailableQuote = Extract<PricingQuoteResult, { available: true }>;

// ── Quote-fixtures ───────────────────────────────────────────────────────────

const PICKUP = "Coolsingel 1, 3011 AD Rotterdam";
const DROPOFF = "Schiphol Airport, 1118 CP Schiphol";
/** Vertrek binnen het venster hieronder (absoluut UTC-instant, zoals de pijplijn levert). */
const DEPART = "2026-10-24T13:00:00.000Z";
const RETURN_DEPART = "2026-10-25T13:00:00.000Z";

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
    economicFloor: null,
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

/** Afstandstarief-variant, inclusief de al opgezochte PDOK-gemeente van de pickup. */
function availableDistance(price: number): AvailableQuote {
  return {
    ...availableFixed(price),
    source: "distance_tariff",
    dataSource: "routing",
    route: { pickupSlug: "rotterdam", dropoffSlug: "schiphol", label: null },
    pickupApproach: {
      baseId: "base-1",
      baseSlug: "spijkenisse",
      serviceAreaGemeente: "Rotterdam",
      distanceKm: 12,
      durationMin: 18,
      referenceCents: 2760,
      exemptionFactor: 0.7,
      customerSharePct: 0.5,
      customerComponentBeforeCapCents: 966,
      customerComponentCents: 966,
      capped: false,
      t4xiAbsorbedReferenceCents: 1794,
      isNightPickup: false,
      approachNightPremiumCents: 0,
      totalPickupContributionCents: 966,
    },
  };
}

// ── Eventdata-fixtures ───────────────────────────────────────────────────────

function event(overrides: Partial<PricingEvent> = {}): PricingEvent {
  return {
    id: "evt-1",
    slug: "ade-2026",
    name: "Amsterdam Dance Event",
    category: "festival",
    city: "Amsterdam",
    venue: null,
    startsAt: "2026-10-21T00:00:00.000Z",
    endsAt: "2026-10-26T00:00:00.000Z",
    status: "confirmed",
    expectedAttendance: null,
    sourceUrl: null,
    sourceName: null,
    sourceType: "organiser",
    sourcePriority: 1,
    verificationStatus: "verified",
    lastVerifiedAt: null,
    lastChangedAt: null,
    requiresAnnualConfirmation: true,
    pricingEnabled: true,
    ...overrides,
  };
}

function window(overrides: Partial<PricingEventWindow> = {}): PricingEventWindow {
  return {
    id: "win-1",
    eventId: "evt-1",
    startsAt: "2026-10-24T06:00:00.000Z",
    endsAt: "2026-10-24T20:00:00.000Z",
    phase: "active",
    pickupImpactLevel: "high",
    dropoffImpactLevel: "none",
    ...overrides,
  };
}

function zone(overrides: Partial<PricingEventZone> = {}): PricingEventZone {
  return {
    id: "zone-1",
    eventId: "evt-1",
    zoneType: "location_slug",
    locationSlug: "rotterdam",
    gemeenteNaam: null,
    locality: null,
    postcode4: null,
    direction: "both",
    impactOverride: null,
    ...overrides,
  };
}

const RULES = new Map<EventImpactLevel, EventFeeRule>([
  ["none", { feeCents: 0, maxUpliftPct: null }],
  ["elevated", { feeCents: 1250, maxUpliftPct: null }],
  ["high", { feeCents: 2500, maxUpliftPct: null }],
  ["very_high", { feeCents: 4000, maxUpliftPct: null }],
  ["extreme", { feeCents: 6000, maxUpliftPct: null }],
]);

function data(overrides: Partial<EventPricingData> = {}): EventPricingData {
  return {
    config: {
      mode: "live",
      concurrentUpgradeEnabled: false,
      concurrentUpgradeMinEvents: 2,
      concurrentUpgradeMinLevel: "high",
      maxImpactLevel: "extreme",
    },
    events: [event()],
    windows: [window()],
    zones: [zone()],
    rules: RULES,
    ...overrides,
  };
}

const loader = (d: EventPricingData | null) => async () => d;

async function priceWith(
  quote: AvailableQuote,
  eventData: EventPricingData | null,
  input: { departureAt?: string; returnDepartureAt?: string } = { departureAt: DEPART }
) {
  return calculateBookingPrice(
    {
      pickup: PICKUP,
      dropoff: DROPOFF,
      returnTrip: quote.returnApplied,
      ...input,
    },
    {
      getQuote: async () => quote,
      now: () => new Date("2026-10-20T10:00:00.000Z"),
      generateQuoteId: () => "00000000-0000-7000-8000-000000000001",
      loadEventPricing: loader(eventData),
    }
  );
}

function adjustment(result: Awaited<ReturnType<typeof priceWith>>, code: string) {
  return result.snapshot?.adjustments.find((a) => a.code === code) ?? null;
}

// ── 1. Ongewijzigd gedrag zonder evenement ───────────────────────────────────

test("zonder eventdata blijft de quote exact gelijk aan de basisprijs", async () => {
  const result = await priceWith(availableFixed(100), null);
  assert.equal(result.snapshot?.subtotalCents, 10000);
  assert.equal(result.snapshot?.totalCents, 10000);
  assert.deepEqual(result.snapshot?.adjustments, []);
  assert.equal(result.quote.available && result.quote.priceCents, 10000);
});

test("uitgeschakelde module (kill switch) verandert de prijs niet", async () => {
  const disabled = data({ config: { ...data().config, mode: "off" } });
  const result = await priceWith(availableFixed(100), disabled);
  assert.equal(result.snapshot?.totalCents, 10000);
  assert.deepEqual(result.snapshot?.adjustments, []);
});

// ── 2–4. Heen- en retourrit ──────────────────────────────────────────────────

test("evenement op de heenrit → één adjustment, additief op het subtotaal", async () => {
  const result = await priceWith(availableFixed(100), data());
  const adj = adjustment(result, "event_outbound");
  assert.equal(adj?.amountCents, 2500);
  assert.equal(adj?.taxable, true);
  assert.equal(adj?.vatRate, 9);
  assert.equal(adj?.sortOrder, 4);
  assert.equal(result.snapshot?.subtotalCents, 10000);
  assert.equal(result.snapshot?.totalCents, 12500);
});

test("evenement op de retourrit → aparte return-adjustment", async () => {
  const returnWindow = window({
    id: "win-return",
    startsAt: "2026-10-25T06:00:00.000Z",
    endsAt: "2026-10-25T20:00:00.000Z",
    pickupImpactLevel: "none",
    dropoffImpactLevel: "very_high",
  });
  const result = await priceWith(availableReturn(100, 180), data({ windows: [returnWindow] }), {
    departureAt: DEPART,
    returnDepartureAt: RETURN_DEPART,
  });
  assert.equal(adjustment(result, "event_outbound"), null);
  assert.equal(adjustment(result, "event_return")?.amountCents, 4000);
  assert.equal(result.snapshot?.totalCents, 18000 + 4000);
});

test("heen- en retourrit kunnen een verschillend niveau hebben", async () => {
  const windows = [
    window({ id: "win-out", pickupImpactLevel: "elevated" }),
    window({
      id: "win-ret",
      startsAt: "2026-10-25T06:00:00.000Z",
      endsAt: "2026-10-25T20:00:00.000Z",
      pickupImpactLevel: "none",
      dropoffImpactLevel: "extreme",
    }),
  ];
  const result = await priceWith(availableReturn(100, 180), data({ windows }), {
    departureAt: DEPART,
    returnDepartureAt: RETURN_DEPART,
  });
  assert.equal(adjustment(result, "event_outbound")?.amountCents, 1250);
  assert.equal(adjustment(result, "event_return")?.amountCents, 6000);
  assert.equal(result.snapshot?.totalCents, 18000 + 1250 + 6000);
});

test("retour zonder returnDepartureAt → alleen de heenrit krijgt een toeslag", async () => {
  const result = await priceWith(availableReturn(100, 180), data(), { departureAt: DEPART });
  assert.equal(adjustment(result, "event_outbound")?.amountCents, 2500);
  assert.equal(adjustment(result, "event_return"), null);
  assert.equal(result.snapshot?.totalCents, 18000 + 2500);
});

// ── 5–9. Geen toeslag ────────────────────────────────────────────────────────

test("vertrek buiten het tijdvenster → geen toeslag", async () => {
  // 22:30 Amsterdamse tijd: ná het venster (dat om 20:00Z sluit) en nog vóór
  // het nachtvenster, zodat er hoe dan ook geen enkele toeslag hoort te gelden.
  const result = await priceWith(availableFixed(100), data(), {
    departureAt: "2026-10-24T20:30:00.000Z",
  });
  assert.deepEqual(result.snapshot?.adjustments, []);
  assert.equal(result.snapshot?.totalCents, 10000);
});

test("evenement buiten de zone van deze rit → geen toeslag", async () => {
  const elsewhere = data({ zones: [zone({ locationSlug: "groningen" })] });
  const result = await priceWith(availableFixed(100), elsewhere);
  assert.equal(result.snapshot?.totalCents, 10000);
});

test("geannuleerd evenement → geen toeslag", async () => {
  const result = await priceWith(availableFixed(100), data({ events: [event({ status: "cancelled" })] }));
  assert.equal(result.snapshot?.totalCents, 10000);
});

test("evenement dat verificatie behoeft → geen toeslag", async () => {
  const result = await priceWith(
    availableFixed(100),
    data({ events: [event({ status: "verification_required" })] })
  );
  assert.equal(result.snapshot?.totalCents, 10000);
});

test("niet-vrijgegeven evenement → geen toeslag", async () => {
  const result = await priceWith(availableFixed(100), data({ events: [event({ pricingEnabled: false })] }));
  assert.equal(result.snapshot?.totalCents, 10000);
});

// ── 10–12. Overlap, bovengrens en ontbrekend tarief ──────────────────────────

test("twee overlappende evenementen → hoogste tarief, nooit de som", async () => {
  const overlapping = data({
    events: [event(), event({ id: "evt-2", slug: "amf-2026", name: "AMF" })],
    windows: [window(), window({ id: "win-2", eventId: "evt-2", pickupImpactLevel: "extreme" })],
    zones: [zone(), zone({ id: "zone-2", eventId: "evt-2" })],
  });
  const result = await priceWith(availableFixed(100), overlapping);
  assert.equal(adjustment(result, "event_outbound")?.amountCents, 6000);
  assert.equal(result.snapshot?.totalCents, 16000);
});

test("maxImpactLevel topt af tot in de uiteindelijke prijs", async () => {
  const capped = data({
    windows: [window({ pickupImpactLevel: "extreme" })],
    config: { ...data().config, maxImpactLevel: "high" },
  });
  const result = await priceWith(availableFixed(100), capped);
  assert.equal(adjustment(result, "event_outbound")?.amountCents, 2500);
  assert.equal(result.snapshot?.totalCents, 12500);
});

test("ontbrekende tariefregel → geen toeslag, nooit een geraden bedrag", async () => {
  const noRule = data({ rules: new Map<EventImpactLevel, EventFeeRule>([["extreme", { feeCents: 6000, maxUpliftPct: null }]]) });
  const result = await priceWith(availableFixed(100), noRule);
  assert.deepEqual(result.snapshot?.adjustments, []);
  assert.equal(result.snapshot?.totalCents, 10000);
});

// ── 13. Onveranderlijke verklaring in de snapshot ────────────────────────────

test("snapshot bewaart de volledige, PII-vrije verklaring van de toeslag", async () => {
  const result = await priceWith(availableFixed(100), data());
  const meta = adjustment(result, "event_outbound")?.metadata;
  assert.ok(meta);
  assert.equal(meta.level, "high");
  assert.equal(meta.amountCents, 2500);
  assert.equal(meta.concurrentEventCount, 1);
  assert.deepEqual(meta.matches, [
    {
      eventId: "evt-1",
      eventSlug: "ade-2026",
      eventName: "Amsterdam Dance Event",
      windowId: "win-1",
      zoneId: "zone-1",
      zoneType: "location_slug",
      side: "pickup",
      level: "high",
    },
  ]);
  // Geen adres-, naam- of andere klantgegevens in de opgeslagen verklaring.
  const serialised = JSON.stringify(meta);
  assert.ok(!serialised.includes("Coolsingel"));
  assert.ok(!serialised.includes("Schiphol Airport"));
});

test("label noemt het evenement bij één bron en blijft generiek bij meerdere", async () => {
  const single = await priceWith(availableFixed(100), data());
  assert.equal(adjustment(single, "event_outbound")?.label, "Evenemententarief Amsterdam Dance Event");

  const multiple = await priceWith(
    availableFixed(100),
    data({
      events: [event(), event({ id: "evt-2", slug: "amf-2026", name: "AMF" })],
      windows: [window(), window({ id: "win-2", eventId: "evt-2" })],
      zones: [zone(), zone({ id: "zone-2", eventId: "evt-2" })],
    })
  );
  assert.equal(adjustment(multiple, "event_outbound")?.label, "Evenemententarief");
});

// ── 14. Quote-lock is immuun voor latere configuratiewijzigingen ─────────────

test("een geldige quote-lock houdt de prijs vast, ook als het evenement daarna verandert", async () => {
  const quoted = await priceWith(availableFixed(100), data());
  assert.equal(quoted.snapshot?.totalCents, 12500);

  const stored: StoredSnapshot = {
    quoteId: quoted.snapshot!.quoteId,
    pricingVersion: quoted.snapshot!.pricingVersion,
    pricingSource: quoted.snapshot!.pricingSource,
    currency: "EUR",
    subtotalCents: quoted.snapshot!.subtotalCents,
    totalCents: quoted.snapshot!.totalCents,
    routeSnapshot: quoted.snapshot!.routeSnapshot,
    calculatedAt: quoted.snapshot!.calculatedAt,
    expiresAt: quoted.snapshot!.expiresAt,
  };

  const request = {
    pickup: PICKUP,
    dropoff: DROPOFF,
    vehicleClass: "executive-ev",
    returnTrip: false,
    passengers: 2,
    departureAt: DEPART,
    quoteId: stored.quoteId,
  };
  // De vingerafdruk moet overeenkomen, anders wordt de lock (terecht) geweigerd.
  stored.routeSnapshot = { ...stored.routeSnapshot, fingerprint: quoteFingerprint(request) };

  const outcome = await resolveBookingPrice(request, {
    now: new Date("2026-10-20T10:05:00.000Z"),
    readSnapshot: async () => stored,
    // Het evenement is inmiddels geannuleerd én de module staat uit: de
    // vergrendelde prijs mag daar niet door veranderen.
    loadEventPricing: loader(data({ config: { ...data().config, mode: "off" } })),
    computeQuote: async () => {
      throw new Error("quote-lock mag nooit herberekenen");
    },
  });

  assert.equal(outcome.kind, "priced");
  assert.equal(outcome.kind === "priced" && outcome.priceEuros, 125);
});

// ── 15. No-quoteId-boeking geeft dezelfde uitkomst ───────────────────────────

test("directe boeking zonder quoteId krijgt exact hetzelfde evenemententarief", async () => {
  const quote = availableFixed(100);
  const viaQuote = await priceWith(quote, data());

  const outcome = await resolveBookingPrice(
    {
      pickup: PICKUP,
      dropoff: DROPOFF,
      returnTrip: false,
      passengers: 2,
      departureAt: DEPART,
      quoteId: null,
    },
    {
      now: new Date("2026-10-20T10:00:00.000Z"),
      readSnapshot: async () => null,
      computeQuote: async () => quote,
      loadEventPricing: loader(data()),
    }
  );

  assert.equal(outcome.kind, "priced");
  assert.equal(outcome.kind === "priced" && outcome.priceEuros, viaQuote.snapshot!.totalCents / 100);
  assert.equal(outcome.kind === "priced" && outcome.priceEuros, 125);
});

test("directe boeking zonder eventdata blijft op de basisprijs", async () => {
  const outcome = await resolveBookingPrice(
    { pickup: PICKUP, dropoff: DROPOFF, returnTrip: false, passengers: 2, departureAt: DEPART, quoteId: null },
    {
      now: new Date("2026-10-20T10:00:00.000Z"),
      readSnapshot: async () => null,
      computeQuote: async () => availableFixed(100),
      loadEventPricing: loader(null),
    }
  );
  assert.equal(outcome.kind === "priced" && outcome.priceEuros, 100);
});

// ── 17–18. Samenloop met het nachttarief ─────────────────────────────────────

test("bestaand nachttarief blijft ongewijzigd wanneer er geen evenement is", async () => {
  const night = "2026-10-24T23:30:00.000Z"; // 01:30 Amsterdamse tijd
  const result = await priceWith(availableFixed(100), null, { departureAt: night });
  assert.equal(adjustment(result, "night_outbound")?.amountCents, 1500);
  assert.equal(result.snapshot?.totalCents, 11500);
});

test("nachttarief en evenemententarief tellen beide op, elk als eigen regel", async () => {
  const night = "2026-10-24T23:30:00.000Z";
  const nightWindow = window({
    startsAt: "2026-10-24T20:00:00.000Z",
    endsAt: "2026-10-25T06:00:00.000Z",
    phase: "exit",
    pickupImpactLevel: "very_high",
  });
  const result = await priceWith(availableFixed(100), data({ windows: [nightWindow] }), {
    departureAt: night,
  });
  assert.equal(adjustment(result, "night_outbound")?.amountCents, 1500);
  assert.equal(adjustment(result, "event_outbound")?.amountCents, 4000);
  assert.equal(result.snapshot?.totalCents, 10000 + 1500 + 4000);
  // Volgorde in de opgeslagen breakdown is stabiel: nacht vóór evenement.
  assert.deepEqual(
    result.snapshot?.adjustments.map((a) => a.code),
    ["night_outbound", "event_outbound"]
  );
});

// ── 19–20. Beide prijsbronnen ────────────────────────────────────────────────

test("vaste route + evenemententarief", async () => {
  const result = await priceWith(availableFixed(100), data());
  assert.equal(result.snapshot?.pricingSource, "fixed_route_prices");
  assert.equal(result.snapshot?.totalCents, 12500);
});

test("afstandstarief + evenemententarief, matchend op de al bekende PDOK-gemeente", async () => {
  const byGemeente = data({
    zones: [zone({ zoneType: "gemeente", locationSlug: null, gemeenteNaam: "rotterdam", direction: "pickup" })],
  });
  const result = await priceWith(availableDistance(120), byGemeente);
  assert.equal(result.snapshot?.pricingSource, "dynamic");
  assert.equal(adjustment(result, "event_outbound")?.amountCents, 2500);
  assert.equal(result.snapshot?.totalCents, 14500);
});

test("postcode4 uit het ruwe adres matcht; een huisnummer nooit", async () => {
  const byPostcode = data({ zones: [zone({ zoneType: "postcode4", locationSlug: null, postcode4: 3011 })] });
  const matched = await priceWith(availableFixed(100), byPostcode);
  assert.equal(adjustment(matched, "event_outbound")?.amountCents, 2500);

  const houseNumber = data({ zones: [zone({ zoneType: "postcode4", locationSlug: null, postcode4: 1000 })] });
  const unmatched = await priceWith(availableFixed(100), houseNumber);
  assert.equal(unmatched.snapshot?.totalCents, 10000);
});
