// Tests voor de genormaliseerde locatiecontext (Phase 5.5) en de doorwerking
// ervan in de actieve prijspijplijn. De adresvormen hieronder zijn geverifieerd
// tegen de live PDOK Locatieserver (2026-08-27), inclusief de twee vormen die
// de adres-autocomplete daadwerkelijk oplevert.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildLocationContext, parseLocality, EMPTY_LOCATION_CONTEXT } from "@/lib/pricing/location-context";
import { calculateBookingPrice } from "@/lib/pricing/engine";
import { NO_AIRPORT, type PricingQuoteResult } from "@/lib/pricing/service";
import { eurosToCents } from "@/lib/payments/create-intent";
import type { EventPricingData } from "@/lib/pricing/event-store";
import type { EventFeeRule, EventImpactLevel, PricingEvent, PricingEventWindow, PricingEventZone } from "@/lib/pricing/event-pricing";

type AvailableQuote = Extract<PricingQuoteResult, { available: true }>;

const DEPART = "2026-10-24T13:00:00.000Z";
const RETURN_DEPART = "2026-10-25T13:00:00.000Z";

// ── Pure parsing ─────────────────────────────────────────────────────────────

test("adreslabel (type 'adres') levert postcode4 én woonplaats", () => {
  assert.deepEqual(buildLocationContext("Spijkweg 30A, 8256RJ Biddinghuizen"), {
    locationSlug: null,
    postcode4: 8256,
    locality: "biddinghuizen",
    gemeente: null,
  });
});

test("plaatslabel (type 'woonplaats') levert de PLAATS, niet de provincie", () => {
  // PDOK geeft "plaats, gemeente, provincie" — het laatste segment is de provincie.
  assert.equal(parseLocality("Biddinghuizen, Dronten, Flevoland"), "biddinghuizen");
  assert.equal(parseLocality("Landgraaf, Landgraaf, Limburg"), "landgraaf");
  assert.equal(parseLocality("Zandvoort, Zandvoort, Noord-Holland"), "zandvoort");
});

test("een achterliggende landnaam wordt genegeerd", () => {
  assert.equal(parseLocality("Damrak 1, 1012 LG Amsterdam, Netherlands"), "amsterdam");
  assert.equal(parseLocality("Amsterdam, Nederland"), "amsterdam");
});

test("7. een huisnummer wordt nooit voor een postcode aangezien", () => {
  assert.equal(buildLocationContext("Hoofdstraat 12").postcode4, null);
  assert.equal(buildLocationContext("Kalverstraat 1234").postcode4, null);
  // Vier cijfers MET de twee letters is wél een postcode.
  assert.equal(buildLocationContext("Kalverstraat 1, 1012 NX Amsterdam").postcode4, 1012);
});

test("6. een adres zonder herkenbare plaats levert een lege context op", () => {
  assert.deepEqual(buildLocationContext("Hoofdstraat 12"), {
    ...EMPTY_LOCATION_CONTEXT,
    locationSlug: null,
    locality: null,
  });
  assert.deepEqual(buildLocationContext(""), EMPTY_LOCATION_CONTEXT);
  assert.deepEqual(buildLocationContext(null), EMPTY_LOCATION_CONTEXT);
});

test("reeds bekende slug en gemeente worden doorgegeven, nooit opnieuw bepaald", () => {
  const ctx = buildLocationContext("Coolsingel 1, 3011 AD Rotterdam", {
    locationSlug: "rotterdam-centrum",
    gemeente: "Rotterdam",
  });
  assert.equal(ctx.locationSlug, "rotterdam-centrum");
  assert.equal(ctx.gemeente, "Rotterdam");
  assert.equal(ctx.postcode4, 3011);
  assert.equal(ctx.locality, "rotterdam");
});

// ── Doorwerking in de prijspijplijn ──────────────────────────────────────────

function quoteFixed(price: number, slugs: { pickup: string; dropoff: string }): AvailableQuote {
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
    distanceKm: 45,
    estimatedDurationMin: 40,
    vehicleClass: "executive-ev",
    route: { pickupSlug: slugs.pickup, dropoffSlug: slugs.dropoff, label: "vast" },
    isAirportTransfer: false,
    airport: NO_AIRPORT,
    dataSource: "supabase",
    fingerprint: "fp",
    pickupApproach: null,
    economicFloor: null,
  };
}

function quoteDistance(price: number, gemeente: string | null): AvailableQuote {
  const base = quoteFixed(price, { pickup: "almere", dropoff: "spijkweg-30a-8256rj-biddinghuizen" });
  return {
    ...base,
    source: "distance_tariff",
    dataSource: "routing",
    route: { ...base.route, label: null },
    pickupApproach:
      gemeente === null
        ? null
        : {
            baseId: "b1",
            baseSlug: "almere",
            serviceAreaGemeente: gemeente,
            distanceKm: 8,
            durationMin: 12,
            referenceCents: 1840,
            exemptionFactor: 0.3,
            customerSharePct: 0.5,
            customerComponentBeforeCapCents: 276,
            customerComponentCents: 276,
            capped: false,
            t4xiAbsorbedReferenceCents: 1564,
            isNightPickup: false,
            approachNightPremiumCents: 0,
            totalPickupContributionCents: 276,
          },
  };
}

function event(): PricingEvent {
  return {
    id: "evt-1",
    slug: "lowlands-test",
    name: "Testfestival",
    category: "festival",
    city: "Biddinghuizen",
    venue: null,
    startsAt: "2026-10-24T06:00:00.000Z",
    endsAt: "2026-10-24T20:00:00.000Z",
    status: "confirmed",
    expectedAttendance: null,
    sourceUrl: "https://example.org",
    sourceName: "Test",
    sourceType: "organiser",
    sourcePriority: 1,
    verificationStatus: "verified",
    lastVerifiedAt: null,
    lastChangedAt: null,
    requiresAnnualConfirmation: true,
    pricingEnabled: true,
  };
}

function window(): PricingEventWindow {
  return {
    id: "win-1",
    eventId: "evt-1",
    startsAt: "2026-10-24T06:00:00.000Z",
    endsAt: "2026-10-24T20:00:00.000Z",
    phase: "arrival",
    pickupImpactLevel: "high",
    dropoffImpactLevel: "high",
  };
}

function zone(overrides: Partial<PricingEventZone>): PricingEventZone {
  return {
    id: "zone-1",
    eventId: "evt-1",
    zoneType: "location_slug",
    locationSlug: null,
    gemeenteNaam: null,
    locality: null,
    postcode4: null,
    direction: "both",
    impactOverride: null,
    ...overrides,
  };
}

function data(zones: PricingEventZone[]): EventPricingData {
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
    zones,
    rules: new Map<EventImpactLevel, EventFeeRule>([["high", { feeCents: 2500, maxUpliftPct: null }], ["very_high", { feeCents: 4000, maxUpliftPct: null }]]),
  };
}

async function price(
  quote: AvailableQuote,
  eventData: EventPricingData | null,
  addresses: { pickup: string; dropoff: string },
  extra: { returnDepartureAt?: string } = {}
) {
  return calculateBookingPrice(
    {
      pickup: addresses.pickup,
      dropoff: addresses.dropoff,
      returnTrip: quote.returnApplied,
      departureAt: DEPART,
      ...extra,
    },
    {
      getQuote: async () => quote,
      now: () => new Date("2026-10-20T10:00:00.000Z"),
      generateQuoteId: () => "00000000-0000-7000-8000-000000000001",
      loadEventPricing: async () => eventData,
    }
  );
}

const ADDR = { pickup: "Marktgracht 23, 1353 AL Almere", dropoff: "Spijkweg 30A, 8256RJ Biddinghuizen" };

test("1. vaste route levert dezelfde context als voorheen én matcht op postcode4", async () => {
  const result = await price(
    quoteFixed(100, { pickup: "almere", dropoff: "schiphol-airport" }),
    data([zone({ zoneType: "postcode4", postcode4: 1353 })]),
    ADDR
  );
  assert.equal(result.snapshot?.totalCents, 12500);
});

test("2. afstandstarief met exact dezelfde adressen geeft exact dezelfde toeslag", async () => {
  const zones = [zone({ zoneType: "postcode4", postcode4: 1353 })];
  const fixed = await price(quoteFixed(100, { pickup: "almere", dropoff: "schiphol-airport" }), data(zones), ADDR);
  const distance = await price(quoteDistance(100, "Almere"), data(zones), ADDR);
  const fee = (r: typeof fixed) =>
    r.snapshot?.adjustments.find((a) => a.code === "event_outbound")?.amountCents ?? 0;
  assert.equal(fee(fixed), 2500);
  assert.equal(fee(distance), fee(fixed));
});

test("3. onbekende location_slug maar bekende postcode4 → match", async () => {
  // De bestemming heeft geen catalogus-slug; het afstandstarief slugificeert de
  // ruwe tekst. Alleen de postcode kan hier matchen.
  const result = await price(
    quoteDistance(100, "Almere"),
    data([zone({ zoneType: "postcode4", postcode4: 8256 })]),
    ADDR
  );
  assert.equal(result.snapshot?.totalCents, 12500);
});

test("4. onbekende slug maar bekende woonplaats → match (de Phase 5-blokkade)", async () => {
  const result = await price(
    quoteDistance(100, "Almere"),
    data([zone({ zoneType: "locality", locality: "Biddinghuizen" })]),
    ADDR
  );
  assert.equal(result.snapshot?.totalCents, 12500);
});

test("4b. woonplaatszone werkt óók vanaf een VASTE route — Phase 5 kon dit niet", async () => {
  const result = await price(
    quoteFixed(100, { pickup: "almere", dropoff: "schiphol-airport" }),
    data([zone({ zoneType: "locality", locality: "biddinghuizen" })]),
    ADDR
  );
  assert.equal(result.snapshot?.totalCents, 12500);
});

test("5. gemeente blijft de laatste terugval en werkt alleen waar die al bekend is", async () => {
  const zones = [zone({ zoneType: "gemeente", gemeenteNaam: "Almere" })];
  // Afstandstarief: de aanrijcomponent heeft de gemeente al opgezocht → match.
  const withGemeente = await price(quoteDistance(100, "Almere"), data(zones), ADDR);
  assert.equal(withGemeente.snapshot?.totalCents, 12500);
  // Vaste route: geen aanrijcomponent, dus geen gemeente → fail-closed.
  const fixed = await price(quoteFixed(100, { pickup: "almere", dropoff: "schiphol-airport" }), data(zones), ADDR);
  assert.equal(fixed.snapshot?.totalCents, 10000);
});

test("6b. volledig onbekende locatie → geen enkele match", async () => {
  const zones = [
    zone({ id: "z1", zoneType: "postcode4", postcode4: 8256 }),
    zone({ id: "z2", zoneType: "locality", locality: "biddinghuizen" }),
  ];
  const result = await price(quoteDistance(100, null), data(zones), {
    pickup: "Hoofdstraat 12",
    dropoff: "Ergensweg 3",
  });
  assert.equal(result.snapshot?.totalCents, 10000);
  assert.deepEqual(result.snapshot?.adjustments, []);
});

test("8. bestaande vaste-routeprijs blijft cent-identiek zonder eventdata", async () => {
  const quote = quoteFixed(137, { pickup: "almere", dropoff: "schiphol-airport" });
  const result = await price(quote, null, ADDR);
  assert.equal(result.snapshot?.subtotalCents, quote.priceCents);
  assert.equal(result.snapshot?.totalCents, quote.priceCents);
  assert.deepEqual(result.snapshot?.adjustments, []);
});

test("9. bestaande afstandsprijs blijft cent-identiek zonder eventdata", async () => {
  const quote = quoteDistance(213, "Almere");
  const result = await price(quote, null, ADDR);
  assert.equal(result.snapshot?.subtotalCents, quote.priceCents);
  assert.equal(result.snapshot?.totalCents, quote.priceCents);
});

test("10. waar de oude én de nieuwe context matchen is de toeslag identiek", async () => {
  const bySlug = await price(
    quoteFixed(100, { pickup: "almere", dropoff: "schiphol-airport" }),
    data([zone({ zoneType: "location_slug", locationSlug: "almere" })]),
    ADDR
  );
  const byPostcode = await price(
    quoteFixed(100, { pickup: "almere", dropoff: "schiphol-airport" }),
    data([zone({ zoneType: "postcode4", postcode4: 1353 })]),
    ADDR
  );
  const byLocality = await price(
    quoteFixed(100, { pickup: "almere", dropoff: "schiphol-airport" }),
    data([zone({ zoneType: "locality", locality: "almere" })]),
    ADDR
  );
  assert.equal(bySlug.snapshot?.totalCents, 12500);
  assert.equal(byPostcode.snapshot?.totalCents, 12500);
  assert.equal(byLocality.snapshot?.totalCents, 12500);
});

test("12. bij een retour draait de volledige context om", async () => {
  const returnWindow: PricingEventWindow = {
    ...window(),
    id: "win-ret",
    startsAt: "2026-10-25T06:00:00.000Z",
    endsAt: "2026-10-25T20:00:00.000Z",
    phase: "departure",
    pickupImpactLevel: "very_high",
    dropoffImpactLevel: "none",
  };
  // Zone op de BESTEMMING van de heenrit. Op de terugrit is dat het OPHAALPUNT,
  // dus het pickup-niveau van het vertrekvenster hoort te gelden.
  const eventData: EventPricingData = {
    ...data([zone({ zoneType: "locality", locality: "biddinghuizen" })]),
    windows: [returnWindow],
  };
  const returning = { ...quoteFixed(100, { pickup: "almere", dropoff: "schiphol-airport" }), returnApplied: true };
  const result = await price(returning, eventData, ADDR, { returnDepartureAt: RETURN_DEPART });
  assert.equal(result.snapshot?.adjustments.find((a) => a.code === "event_outbound"), undefined);
  assert.equal(result.snapshot?.adjustments.find((a) => a.code === "event_return")?.amountCents, 4000);
});

// ── 11. Geen extra externe aanroepen ─────────────────────────────────────────

/** Broncode zonder commentaar — anders triggert de toelichting zelf de check. */
function codeOf(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

test("11. de contextlaag doet geen enkele netwerkaanroep", () => {
  const src = codeOf("lib/pricing/location-context.ts");
  for (const forbidden of ["fetch(", "http://", "https://", "lookupOfficialGemeente", "lookupOfficialWoonplaats", "geocod"]) {
    assert.ok(!src.includes(forbidden), `location-context.ts mag "${forbidden}" niet bevatten`);
  }
});

test("11b. de event-koppeling in de prijsfunctie voegt geen lookup toe", () => {
  const src = codeOf("lib/pricing/engine.ts");
  for (const forbidden of ["lookupOfficialGemeente", "lookupOfficialWoonplaats", "getDrivingRoute", "geocod", "fetch("]) {
    assert.ok(!src.includes(forbidden), `engine.ts mag "${forbidden}" niet aanroepen`);
  }
  // De gemeente komt uitsluitend uit de AL berekende aanrijcomponent.
  assert.ok(src.includes("quote.pickupApproach?.serviceAreaGemeente"));
});
