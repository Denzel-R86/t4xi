// Tests voor shadow mode (Phase 6): dezelfde berekening als live, maar
// financieel volstrekt inert. Het bewijs dat hier telt is niet "de shadow-log
// werkt", maar "de klantprijs is cent-identiek aan een offerte zonder deze
// module" — in élk pad.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { calculateBookingPrice, resolveBookingPrice } from "@/lib/pricing/engine";
import { NO_AIRPORT, quoteFingerprint, type PricingQuoteResult } from "@/lib/pricing/service";
import { eurosToCents } from "@/lib/payments/create-intent";
import { observationRow, type EventShadowObservation } from "@/lib/pricing/event-shadow-log";
import { loadEventPricingData, EVENT_PRICING_CACHE_TTL_MS } from "@/lib/pricing/event-store";
import type { PricingSupabaseClient } from "@/lib/supabase/server";
import type { EventPricingData } from "@/lib/pricing/event-store";
import type {
  EventFeeRule,
  EventImpactLevel,
  EventPricingMode,
  PricingEvent,
  PricingEventWindow,
  PricingEventZone,
} from "@/lib/pricing/event-pricing";
import type { StoredSnapshot } from "@/lib/pricing/snapshot";

type AvailableQuote = Extract<PricingQuoteResult, { available: true }>;

const PICKUP = "Coolsingel 1, 3011 AD Rotterdam";
const DROPOFF = "Schiphol Airport, 1118 CP Schiphol";
const DEPART = "2026-10-24T13:00:00.000Z";
const RETURN_DEPART = "2026-10-25T13:00:00.000Z";

// ── Fixtures ─────────────────────────────────────────────────────────────────

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
    fingerprint: "fp",
    pickupApproach: null,
    economicFloor: null,
  };
}

function availableReturn(single: number, ret: number): AvailableQuote {
  return { ...availableFixed(single), price: ret, returnPrice: ret, returnApplied: true, priceCents: eurosToCents(ret), returnPriceCents: eurosToCents(ret) };
}

function availableDistance(price: number): AvailableQuote {
  return {
    ...availableFixed(price),
    source: "distance_tariff",
    dataSource: "routing",
    route: { pickupSlug: "rotterdam", dropoffSlug: "schiphol", label: null },
    pickupApproach: {
      baseId: "b", baseSlug: "spijkenisse", serviceAreaGemeente: "Rotterdam",
      distanceKm: 12, durationMin: 18, referenceCents: 2760, exemptionFactor: 0.7,
      customerSharePct: 0.5, customerComponentBeforeCapCents: 966, customerComponentCents: 966,
      capped: false, t4xiAbsorbedReferenceCents: 1794, isNightPickup: false,
      approachNightPremiumCents: 0, totalPickupContributionCents: 966,
    },
  };
}

function event(o: Partial<PricingEvent> = {}): PricingEvent {
  return {
    id: "evt-1", slug: "ade-2026", name: "Amsterdam Dance Event", category: "festival",
    city: "Amsterdam", venue: null, startsAt: "2026-10-21T00:00:00.000Z", endsAt: "2026-10-26T00:00:00.000Z",
    status: "confirmed", expectedAttendance: null, sourceUrl: "https://example.org", sourceName: null,
    sourceType: "organiser", sourcePriority: 1, verificationStatus: "verified",
    lastVerifiedAt: null, lastChangedAt: null, requiresAnnualConfirmation: true, pricingEnabled: true,
    ...o,
  };
}

function window(o: Partial<PricingEventWindow> = {}): PricingEventWindow {
  return {
    id: "win-1", eventId: "evt-1", startsAt: "2026-10-24T06:00:00.000Z", endsAt: "2026-10-24T20:00:00.000Z",
    phase: "active", pickupImpactLevel: "high", dropoffImpactLevel: "none", ...o,
  };
}

function zone(o: Partial<PricingEventZone> = {}): PricingEventZone {
  return {
    id: "zone-1", eventId: "evt-1", zoneType: "location_slug", locationSlug: "rotterdam",
    gemeenteNaam: null, locality: null, postcode4: null, direction: "both", impactOverride: null, ...o,
  };
}

const RULES = new Map<EventImpactLevel, EventFeeRule>([
  ["none", { feeCents: 0, maxUpliftPct: null }], ["elevated", { feeCents: 1250, maxUpliftPct: null }], ["high", { feeCents: 2500, maxUpliftPct: null }], ["very_high", { feeCents: 4000, maxUpliftPct: null }], ["extreme", { feeCents: 6000, maxUpliftPct: null }],
]);

function data(mode: EventPricingMode, o: Partial<EventPricingData> = {}): EventPricingData {
  return {
    config: {
      mode,
      concurrentUpgradeEnabled: false,
      concurrentUpgradeMinEvents: 2,
      concurrentUpgradeMinLevel: "high",
      maxImpactLevel: "extreme",
    },
    events: [event()],
    windows: [window()],
    zones: [zone()],
    rules: RULES,
    ...o,
  };
}

/** Vangt de observaties op in plaats van ze naar de database te schrijven. */
function collector() {
  const seen: EventShadowObservation[] = [];
  return {
    seen,
    record: async (entries: readonly EventShadowObservation[]) => {
      seen.push(...entries);
    },
  };
}

async function priceWith(
  quote: AvailableQuote,
  eventData: EventPricingData | null,
  log = collector(),
  extra: { returnDepartureAt?: string } = {}
) {
  const result = await calculateBookingPrice(
    { pickup: PICKUP, dropoff: DROPOFF, returnTrip: quote.returnApplied, departureAt: DEPART, ...extra },
    {
      getQuote: async () => quote,
      now: () => new Date("2026-10-20T10:00:00.000Z"),
      generateQuoteId: () => "00000000-0000-7000-8000-000000000001",
      loadEventPricing: async () => eventData,
      recordShadowLog: log.record,
    }
  );
  return { result, log };
}

const eventAdjustments = (r: Awaited<ReturnType<typeof priceWith>>["result"]) =>
  r.snapshot?.adjustments.filter((a) => a.code.startsWith("event_")) ?? [];

// ── 1–3. De drie toestanden ──────────────────────────────────────────────────

test("1. off: geen berekening, geen observatie, geen toeslag", async () => {
  const { result, log } = await priceWith(availableFixed(100), data("off"));
  assert.equal(result.snapshot?.totalCents, 10000);
  assert.deepEqual(eventAdjustments(result), []);
  assert.deepEqual(log.seen, []);
});

test("2. shadow: match gevonden en geobserveerd, klantprijs onveranderd", async () => {
  const { result, log } = await priceWith(availableFixed(100), data("shadow"));
  // Geen cent verschil.
  assert.equal(result.snapshot?.subtotalCents, 10000);
  assert.equal(result.snapshot?.totalCents, 10000);
  assert.deepEqual(eventAdjustments(result), []);
  // Maar wél volledig doorgerekend en vastgelegd.
  assert.equal(log.seen.length, 1);
  assert.equal(log.seen[0]!.mode, "shadow");
  assert.equal(log.seen[0]!.leg, "outbound");
  assert.equal(log.seen[0]!.result.amountCents, 2500);
  assert.equal(log.seen[0]!.result.level, "high");
  assert.equal(log.seen[0]!.result.matches.length, 1);
});

test("3. live: identieke berekening, nu wél als adjustment", async () => {
  const { result, log } = await priceWith(availableFixed(100), data("live"));
  assert.equal(result.snapshot?.totalCents, 12500);
  assert.equal(eventAdjustments(result)[0]?.amountCents, 2500);
  assert.equal(log.seen[0]!.mode, "live");
  assert.equal(log.seen[0]!.result.amountCents, 2500);
});

test("shadow en live berekenen exact hetzelfde — alleen de afhandeling verschilt", async () => {
  const shadow = await priceWith(availableFixed(100), data("shadow"));
  const live = await priceWith(availableFixed(100), data("live"));
  assert.deepEqual(shadow.log.seen[0]!.result, live.log.seen[0]!.result);
});

// ── 4–5. Vrijgave per evenement blijft gelden ────────────────────────────────

test("4. shadow + niet-vrijgegeven evenement → geen match", async () => {
  const { result, log } = await priceWith(
    availableFixed(100),
    data("shadow", { events: [event({ pricingEnabled: false })] })
  );
  assert.equal(result.snapshot?.totalCents, 10000);
  assert.equal(log.seen[0]!.result.matches.length, 0);
  assert.equal(log.seen[0]!.result.amountCents, 0);
});

test("5. geannuleerd evenement → geen match, ook niet in shadow", async () => {
  const { log } = await priceWith(availableFixed(100), data("shadow", { events: [event({ status: "cancelled" })] }));
  assert.equal(log.seen[0]!.result.matches.length, 0);
});

// ── 6–8. Financieel inert ────────────────────────────────────────────────────

test("6. vaste route in shadow is cent-identiek aan zonder eventpricing", async () => {
  const quote = availableFixed(137);
  const zonder = await priceWith(quote, null);
  const met = await priceWith(quote, data("shadow"));
  assert.equal(met.result.snapshot?.subtotalCents, zonder.result.snapshot?.subtotalCents);
  assert.equal(met.result.snapshot?.totalCents, zonder.result.snapshot?.totalCents);
  assert.deepEqual(met.result.snapshot?.adjustments, zonder.result.snapshot?.adjustments);
});

test("7. afstandstarief in shadow is cent-identiek aan zonder eventpricing", async () => {
  const quote = availableDistance(213);
  const zonder = await priceWith(quote, null);
  const met = await priceWith(quote, data("shadow"));
  assert.equal(met.result.snapshot?.totalCents, zonder.result.snapshot?.totalCents);
  assert.equal(met.result.snapshot?.pricingSource, zonder.result.snapshot?.pricingSource);
});

test("8. nachttarief blijft in shadow exact ongewijzigd", async () => {
  const night = "2026-10-24T23:30:00.000Z"; // 01:30 Amsterdamse tijd
  const nightWindow = window({ startsAt: "2026-10-24T20:00:00.000Z", endsAt: "2026-10-25T06:00:00.000Z" });
  const zonder = await calculateBookingPrice(
    { pickup: PICKUP, dropoff: DROPOFF, returnTrip: false, departureAt: night },
    { getQuote: async () => availableFixed(100), now: () => new Date("2026-10-20T10:00:00.000Z"), generateQuoteId: () => "q", loadEventPricing: async () => null, recordShadowLog: async () => {} }
  );
  const met = await calculateBookingPrice(
    { pickup: PICKUP, dropoff: DROPOFF, returnTrip: false, departureAt: night },
    { getQuote: async () => availableFixed(100), now: () => new Date("2026-10-20T10:00:00.000Z"), generateQuoteId: () => "q", loadEventPricing: async () => data("shadow", { windows: [nightWindow] }), recordShadowLog: async () => {} }
  );
  assert.equal(zonder.snapshot?.adjustments.find((a) => a.code === "night_outbound")?.amountCents, 1500);
  assert.deepEqual(met.snapshot?.adjustments, zonder.snapshot?.adjustments);
  assert.equal(met.snapshot?.totalCents, zonder.snapshot?.totalCents);
});

// ── 9–12. Wat er wordt geobserveerd ──────────────────────────────────────────

test("9. retour: heen- en terugrit worden afzonderlijk geobserveerd", async () => {
  // Op de terugrit is de eventzone (Rotterdam) de AFZETkant, niet de ophaalkant:
  // de klant wordt op Schiphol opgehaald en in het evenementgebied afgezet.
  const returnWindow = window({
    id: "win-ret",
    startsAt: "2026-10-25T06:00:00.000Z",
    endsAt: "2026-10-25T20:00:00.000Z",
    pickupImpactLevel: "none",
    dropoffImpactLevel: "very_high",
  });
  const { result, log } = await priceWith(
    availableReturn(100, 180),
    data("shadow", { windows: [window(), returnWindow] }),
    collector(),
    { returnDepartureAt: RETURN_DEPART }
  );
  assert.equal(result.snapshot?.totalCents, 18000);
  assert.deepEqual(log.seen.map((e) => e.leg), ["outbound", "return"]);
  assert.equal(log.seen[0]!.result.amountCents, 2500);
  assert.equal(log.seen[1]!.result.amountCents, 4000);
});

test("10. gelijktijdige evenementen: de potentiële upgrade wordt vastgelegd", async () => {
  const { log } = await priceWith(
    availableFixed(100),
    data("shadow", {
      config: { mode: "shadow", concurrentUpgradeEnabled: true, concurrentUpgradeMinEvents: 2, concurrentUpgradeMinLevel: "high", maxImpactLevel: "extreme" },
      events: [event(), event({ id: "evt-2", slug: "amf-2026", name: "AMF" })],
      windows: [window(), window({ id: "win-2", eventId: "evt-2" })],
      zones: [zone(), zone({ id: "zone-2", eventId: "evt-2" })],
    })
  );
  assert.equal(log.seen[0]!.result.upgradeApplied, true);
  assert.equal(log.seen[0]!.result.concurrentEventCount, 2);
  assert.equal(log.seen[0]!.result.level, "very_high");
  assert.equal(observationRow(log.seen[0]!).upgrade_applied, true);
});

test("11. maxImpactLevel: de potentiële cap wordt vastgelegd", async () => {
  const { log } = await priceWith(
    availableFixed(100),
    data("shadow", {
      config: { mode: "shadow", concurrentUpgradeEnabled: false, concurrentUpgradeMinEvents: 2, concurrentUpgradeMinLevel: "high", maxImpactLevel: "elevated" },
    })
  );
  assert.equal(log.seen[0]!.result.cappedByMaxLevel, true);
  assert.equal(log.seen[0]!.result.level, "elevated");
  assert.equal(observationRow(log.seen[0]!).capped_by_max_level, true);
});

test("12. ontbrekende tariefregel: match wél geobserveerd, potentieel bedrag €0", async () => {
  const { log } = await priceWith(
    availableFixed(100),
    data("shadow", { rules: new Map<EventImpactLevel, EventFeeRule>([["extreme", { feeCents: 6000, maxUpliftPct: null }]]) })
  );
  assert.equal(log.seen[0]!.result.matches.length, 1);
  assert.equal(log.seen[0]!.result.amountCents, 0);
});

// ── 13–14. Publiek API-contract ──────────────────────────────────────────────

test("13/14. eventFee komt uitsluitend uit de snapshot-adjustments", () => {
  // In shadow bestaan die adjustments niet, dus kan het veld per constructie
  // niet in de response komen. In live wel. De route leidt niets zelf af.
  const src = readFileSync(resolve(process.cwd(), "app/api/pricing/quote/route.ts"), "utf8");
  assert.ok(src.includes("snapshot.adjustments"));
  assert.ok(!src.includes("shadow"));
  assert.ok(!src.includes("eventPricingMode"));
  assert.ok(src.includes("...(eventFee ? { eventFee } : {})"));
});

test("13b. in shadow bevat de snapshot geen enkele event-adjustment", async () => {
  const { result } = await priceWith(availableFixed(100), data("shadow"));
  assert.equal(result.snapshot?.adjustments.length, 0);
});

test("14b. in live bevat de snapshot de event-adjustment die de route uitleest", async () => {
  const { result } = await priceWith(availableFixed(100), data("live"));
  assert.deepEqual(eventAdjustments(result).map((a) => a.code), ["event_outbound"]);
});

// ── 15. Quote-lock ───────────────────────────────────────────────────────────

test("15. een in shadow uitgebrachte lock blijft gelijk als de modus daarna live wordt", async () => {
  const { result } = await priceWith(availableFixed(100), data("shadow"));
  assert.equal(result.snapshot?.totalCents, 10000);

  const request = {
    pickup: PICKUP, dropoff: DROPOFF, vehicleClass: "executive-ev",
    returnTrip: false, passengers: 2, departureAt: DEPART,
    quoteId: result.snapshot!.quoteId,
  };
  const stored: StoredSnapshot = {
    quoteId: result.snapshot!.quoteId,
    pricingVersion: result.snapshot!.pricingVersion,
    pricingSource: result.snapshot!.pricingSource,
    currency: "EUR",
    subtotalCents: result.snapshot!.subtotalCents,
    totalCents: result.snapshot!.totalCents,
    routeSnapshot: { ...result.snapshot!.routeSnapshot, fingerprint: quoteFingerprint(request) },
    calculatedAt: result.snapshot!.calculatedAt,
    expiresAt: result.snapshot!.expiresAt,
  };

  const outcome = await resolveBookingPrice(request, {
    now: new Date("2026-10-20T10:05:00.000Z"),
    readSnapshot: async () => stored,
    // De module staat inmiddels op LIVE — de vergrendelde prijs mag niet meebewegen.
    loadEventPricing: async () => data("live"),
    recordShadowLog: async () => {},
    computeQuote: async () => {
      throw new Error("quote-lock mag nooit herberekenen");
    },
  });
  assert.equal(outcome.kind === "priced" && outcome.priceEuros, 100);
});

// ── 16–17. Boeking zonder quoteId ────────────────────────────────────────────

async function bookWithout(mode: EventPricingMode, log = collector()) {
  return {
    outcome: await resolveBookingPrice(
      { pickup: PICKUP, dropoff: DROPOFF, returnTrip: false, passengers: 2, departureAt: DEPART, quoteId: null },
      {
        now: new Date("2026-10-20T10:00:00.000Z"),
        readSnapshot: async () => null,
        computeQuote: async () => availableFixed(100),
        loadEventPricing: async () => data(mode),
        recordShadowLog: log.record,
      }
    ),
    log,
  };
}

test("16. no-quoteId in shadow: geobserveerd, niet afgerekend", async () => {
  const { outcome, log } = await bookWithout("shadow");
  assert.equal(outcome.kind === "priced" && outcome.priceEuros, 100);
  assert.equal(log.seen.length, 1);
  assert.equal(log.seen[0]!.mode, "shadow");
  assert.equal(log.seen[0]!.result.amountCents, 2500);
  assert.equal(log.seen[0]!.quoteId, null);
});

test("17. no-quoteId in live: wél afgerekend", async () => {
  const { outcome, log } = await bookWithout("live");
  assert.equal(outcome.kind === "priced" && outcome.priceEuros, 125);
  assert.equal(log.seen[0]!.mode, "live");
});

test("16b. no-quoteId in off: niets berekend, niets geobserveerd", async () => {
  const { outcome, log } = await bookWithout("off");
  assert.equal(outcome.kind === "priced" && outcome.priceEuros, 100);
  assert.deepEqual(log.seen, []);
});

// ── 18. Geen persoonsgegevens ────────────────────────────────────────────────

test("18. de observatierij bevat geen adres of ander klantgegeven", async () => {
  const { log } = await priceWith(availableFixed(100), data("shadow"));
  const row = observationRow(log.seen[0]!);
  const serialised = JSON.stringify(row);
  for (const fragment of ["Coolsingel", "3011", "Schiphol Airport", "1118", PICKUP, DROPOFF]) {
    assert.ok(!serialised.includes(fragment), `observatierij mag "${fragment}" niet bevatten`);
  }
  assert.deepEqual(Object.keys(row).filter((k) => /address|adres|pickup_input|dropoff_input|lat|lng|postcode/.test(k)), []);
});

test("18b. de observatiemodule kent geen adresvelden", () => {
  const src = readFileSync(resolve(process.cwd(), "lib/pricing/event-shadow-log.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
  for (const forbidden of ["pickup", "dropoff", "postcode", "locality", "latitude", "longitude"]) {
    assert.ok(!src.includes(forbidden), `event-shadow-log.ts mag "${forbidden}" niet bevatten`);
  }
});

// ── 19. Noodknop ─────────────────────────────────────────────────────────────

test("19. mode 'off' stopt het laden vóór er ook maar één eventtabel wordt gelezen", async () => {
  const queried: string[] = [];
  const client = {
    from(table: string) {
      queried.push(table);
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        gte: () => builder,
        limit: () => Promise.resolve({ data: [{ mode: "off" }], error: null }),
        then: (r: (v: unknown) => unknown) => r({ data: [], error: null }),
      };
      return builder;
    },
  } as unknown as PricingSupabaseClient;

  const result = await loadEventPricingData(client);
  assert.equal(result.config.mode, "off");
  assert.deepEqual(result.events, []);
  // Uitsluitend de configuratietabel is geraadpleegd.
  assert.deepEqual(queried, ["pricing_event_config"]);
});

test("19b. de noodknop werkt binnen de cache-TTL van één minuut", () => {
  assert.equal(EVENT_PRICING_CACHE_TTL_MS, 60_000);
});

test("19c. een onbekende modus wordt behandeld als 'off' (fail-closed)", async () => {
  const client = {
    from() {
      const builder = {
        select: () => builder,
        eq: () => builder,
        limit: () => Promise.resolve({ data: [{ mode: "experimenteel" }], error: null }),
      };
      return builder;
    },
  } as unknown as PricingSupabaseClient;
  const result = await loadEventPricingData(client);
  assert.equal(result.config.mode, "off");
});
