import { test } from "node:test";
import assert from "node:assert/strict";
import { eventFeeMetadata, resolveEventFee, type EventLegContext, type EventLegEndpoint } from "@/lib/pricing/event-fee";
import type {
  EventFeeRule,
  EventFeeRules,
  EventImpactLevel,
  EventPricingConfig,
  PricingEvent,
  PricingEventWindow,
  PricingEventZone,
} from "@/lib/pricing/event-pricing";

// ── Bouwstenen ───────────────────────────────────────────────────────────────
// Alle tests draaien op INGEGEVEN data: geen DB, geen klok, geen netwerk.

const RULES: EventFeeRules = new Map<EventImpactLevel, EventFeeRule>([
  ["none", { feeCents: 0, maxUpliftPct: null }],
  ["elevated", { feeCents: 1250, maxUpliftPct: null }],
  ["high", { feeCents: 2500, maxUpliftPct: null }],
  ["very_high", { feeCents: 4000, maxUpliftPct: null }],
  ["extreme", { feeCents: 6000, maxUpliftPct: null }],
]);

const CONFIG: EventPricingConfig = {
  mode: "live",
  concurrentUpgradeEnabled: false,
  concurrentUpgradeMinEvents: 2,
  concurrentUpgradeMinLevel: "high",
  maxImpactLevel: "extreme",
};

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
    startsAt: "2026-10-24T20:00:00.000Z",
    endsAt: "2026-10-25T06:00:00.000Z",
    phase: "exit",
    pickupImpactLevel: "extreme",
    dropoffImpactLevel: "none",
    ...overrides,
  };
}

function zone(overrides: Partial<PricingEventZone> = {}): PricingEventZone {
  return {
    id: "zone-1",
    eventId: "evt-1",
    zoneType: "gemeente",
    locationSlug: null,
    gemeenteNaam: "Amsterdam",
    locality: null,
    postcode4: null,
    direction: "both",
    impactOverride: null,
    ...overrides,
  };
}

function endpoint(overrides: Partial<EventLegEndpoint> = {}): EventLegEndpoint {
  return { locationSlug: null, gemeente: null, locality: null, postcode4: null, ...overrides };
}

/** Ritdeel Amsterdam → Schiphol, vertrek midden in het ADE-uitstroomvenster. */
function leg(overrides: Partial<EventLegContext> = {}): EventLegContext {
  return {
    pickup: endpoint({ gemeente: "Amsterdam" }),
    dropoff: endpoint({ locationSlug: "schiphol", locality: "schiphol" }),
    departureAt: new Date("2026-10-25T01:15:00.000Z"),
    ...overrides,
  };
}

function run(overrides: {
  leg?: EventLegContext;
  events?: readonly PricingEvent[];
  windows?: readonly PricingEventWindow[];
  zones?: readonly PricingEventZone[];
  rules?: EventFeeRules;
  config?: EventPricingConfig;
  baselineSubtotalCents?: number | null;
} = {}) {
  return resolveEventFee({
    leg: overrides.leg ?? leg(),
    events: overrides.events ?? [event()],
    windows: overrides.windows ?? [window()],
    zones: overrides.zones ?? [zone()],
    rules: overrides.rules ?? RULES,
    config: overrides.config ?? CONFIG,
    baselineSubtotalCents: overrides.baselineSubtotalCents ?? null,
  });
}

// ── Basisgedrag ──────────────────────────────────────────────────────────────

test("ophalen binnen zone én venster → toeslag van het geconfigureerde niveau", () => {
  const result = run();
  assert.equal(result.level, "extreme");
  assert.equal(result.amountCents, 6000);
  assert.equal(result.concurrentEventCount, 1);
  assert.equal(result.matches.length, 1);
  assert.deepEqual(
    { eventSlug: result.matches[0]!.eventSlug, windowId: result.matches[0]!.windowId, zoneId: result.matches[0]!.zoneId, side: result.matches[0]!.side },
    { eventSlug: "ade-2026", windowId: "win-1", zoneId: "zone-1", side: "pickup" }
  );
});

test("kill switch uit → nooit een toeslag, ongeacht de data", () => {
  const result = run({ config: { ...CONFIG, mode: "off" } });
  assert.equal(result.level, "none");
  assert.equal(result.amountCents, 0);
  assert.deepEqual(result.matches, []);
});

test("geen evenementen → geen toeslag", () => {
  const result = run({ events: [], windows: [], zones: [] });
  assert.equal(result.amountCents, 0);
});

test("evenement in een andere regio verhoogt een ongerelateerde rit niet", () => {
  // Rotterdams evenement, rit Almere → Schiphol: geen enkele kant matcht.
  const result = run({
    zones: [zone({ gemeenteNaam: "Rotterdam" })],
    leg: leg({
      pickup: endpoint({ gemeente: "Almere" }),
      dropoff: endpoint({ locationSlug: "schiphol", locality: "schiphol" }),
    }),
  });
  assert.equal(result.level, "none");
  assert.equal(result.amountCents, 0);
  assert.deepEqual(result.matches, []);
});

test("afzetten binnen zone telt óók — met het dropoff-niveau van het venster", () => {
  const result = run({
    windows: [window({ pickupImpactLevel: "none", dropoffImpactLevel: "high" })],
    zones: [zone({ gemeenteNaam: "Biddinghuizen" })],
    leg: leg({
      pickup: endpoint({ gemeente: "Amsterdam" }),
      dropoff: endpoint({ gemeente: "Biddinghuizen" }),
    }),
  });
  assert.equal(result.level, "high");
  assert.equal(result.amountCents, 2500);
  assert.equal(result.matches[0]!.side, "dropoff");
});

test("ophaal- en afzetkant kunnen verschillen: aankomst mild, uitstroom extreem", () => {
  const arrival = run({
    windows: [window({ id: "win-arrival", phase: "arrival", pickupImpactLevel: "none", dropoffImpactLevel: "high" })],
    zones: [zone({ gemeenteNaam: "Biddinghuizen" })],
    leg: leg({ pickup: endpoint({ gemeente: "Amsterdam" }), dropoff: endpoint({ gemeente: "Biddinghuizen" }) }),
  });
  const exit = run({
    windows: [window({ id: "win-exit", phase: "exit", pickupImpactLevel: "extreme", dropoffImpactLevel: "none" })],
    zones: [zone({ gemeenteNaam: "Biddinghuizen" })],
    leg: leg({ pickup: endpoint({ gemeente: "Biddinghuizen" }), dropoff: endpoint({ gemeente: "Amsterdam" }) }),
  });
  assert.equal(arrival.amountCents, 2500);
  assert.equal(exit.amountCents, 6000);
});

// ── Tijdvensters ─────────────────────────────────────────────────────────────

test("vertrek buiten het venster → geen toeslag", () => {
  const result = run({ leg: leg({ departureAt: new Date("2026-10-25T09:00:00.000Z") }) });
  assert.equal(result.amountCents, 0);
});

test("venster is half-open: start telt mee, einde niet", () => {
  const atStart = run({ leg: leg({ departureAt: new Date("2026-10-24T20:00:00.000Z") }) });
  const atEnd = run({ leg: leg({ departureAt: new Date("2026-10-25T06:00:00.000Z") }) });
  assert.equal(atStart.amountCents, 6000);
  assert.equal(atEnd.amountCents, 0);
});

// ── Richting en zonesoorten ──────────────────────────────────────────────────

test("zone met direction 'pickup' geldt niet voor de afzetkant", () => {
  const result = run({
    windows: [window({ pickupImpactLevel: "extreme", dropoffImpactLevel: "extreme" })],
    zones: [zone({ direction: "pickup", gemeenteNaam: "Biddinghuizen" })],
    leg: leg({ pickup: endpoint({ gemeente: "Amsterdam" }), dropoff: endpoint({ gemeente: "Biddinghuizen" }) }),
  });
  assert.equal(result.amountCents, 0);
});

test("route-slug en postcode4 matchen exact; hoofdletters/spaties zijn irrelevant", () => {
  const bySlug = run({
    zones: [zone({ zoneType: "location_slug", gemeenteNaam: null, locationSlug: " Schiphol " })],
    windows: [window({ pickupImpactLevel: "none", dropoffImpactLevel: "elevated" })],
  });
  const byPostcode = run({
    zones: [zone({ zoneType: "postcode4", gemeenteNaam: null, postcode4: 8256 })],
    leg: leg({ pickup: endpoint({ postcode4: 8256 }) }),
  });
  assert.equal(bySlug.amountCents, 1250);
  assert.equal(byPostcode.amountCents, 6000);
});

test("ontbrekend gegeven matcht nooit (fail-closed, geen gok)", () => {
  // PDOK-lookup faalde → gemeenteNaam is null aan beide kanten.
  const result = run({ leg: leg({ pickup: endpoint(), dropoff: endpoint() }) });
  assert.equal(result.amountCents, 0);
});

test("zone-override wint van het vensterniveau", () => {
  const result = run({
    windows: [window({ pickupImpactLevel: "elevated" })],
    zones: [zone({ impactOverride: "extreme" })],
  });
  assert.equal(result.level, "extreme");
  assert.equal(result.amountCents, 6000);
});

test("niveau 'none' levert geen match op, ook niet als zone en venster kloppen", () => {
  const result = run({ windows: [window({ pickupImpactLevel: "none", dropoffImpactLevel: "none" })] });
  assert.equal(result.amountCents, 0);
  assert.deepEqual(result.matches, []);
});

// ── Status en vrijgave ───────────────────────────────────────────────────────

test("geannuleerd evenement prijst niet mee", () => {
  const result = run({ events: [event({ status: "cancelled" })] });
  assert.equal(result.amountCents, 0);
});

test("evenement dat verificatie behoeft prijst niet mee", () => {
  const result = run({ events: [event({ status: "verification_required" })] });
  assert.equal(result.amountCents, 0);
});

test("afgerond evenement prijst niet mee", () => {
  const result = run({ events: [event({ status: "completed" })] });
  assert.equal(result.amountCents, 0);
});

test("niet-vrijgegeven evenement prijst niet mee (fail-closed)", () => {
  const result = run({ events: [event({ pricingEnabled: false })] });
  assert.equal(result.amountCents, 0);
});

test("verwacht (nog niet officieel bevestigd) evenement mag wél prijzen na vrijgave", () => {
  const result = run({ events: [event({ status: "expected", verificationStatus: "unverified" })] });
  assert.equal(result.amountCents, 6000);
});

// ── Overlap ──────────────────────────────────────────────────────────────────

test("overlappende evenementen: hoogste tarief wint, nooit de som", () => {
  const result = run({
    events: [event(), event({ id: "evt-2", slug: "amf-2026", name: "AMF" })],
    windows: [window({ pickupImpactLevel: "high" }), window({ id: "win-2", eventId: "evt-2", pickupImpactLevel: "very_high" })],
    zones: [zone(), zone({ id: "zone-2", eventId: "evt-2" })],
  });
  assert.equal(result.level, "very_high");
  assert.equal(result.amountCents, 4000); // niet 2500 + 4000
  assert.equal(result.concurrentEventCount, 2);
  assert.equal(result.matches.length, 2);
});

test("twee zones van hetzelfde evenement tellen als één evenement", () => {
  const result = run({
    zones: [zone(), zone({ id: "zone-1b", zoneType: "location_slug", gemeenteNaam: null, locationSlug: "schiphol" })],
    windows: [window({ pickupImpactLevel: "high", dropoffImpactLevel: "high" })],
  });
  assert.equal(result.concurrentEventCount, 1);
  assert.equal(result.matches.length, 2);
  assert.equal(result.amountCents, 2500);
});

test("gelijktijdigheid-upgrade: uit by default, aan één stap omhoog", () => {
  const events = [event(), event({ id: "evt-2", slug: "amf-2026", name: "AMF" })];
  const windows = [window({ pickupImpactLevel: "high" }), window({ id: "win-2", eventId: "evt-2", pickupImpactLevel: "high" })];
  const zones = [zone(), zone({ id: "zone-2", eventId: "evt-2" })];

  const off = run({ events, windows, zones });
  assert.equal(off.level, "high");
  assert.equal(off.upgradeApplied, false);

  const on = run({ events, windows, zones, config: { ...CONFIG, concurrentUpgradeEnabled: true } });
  assert.equal(on.level, "very_high");
  assert.equal(on.amountCents, 4000);
  assert.equal(on.upgradeApplied, true);
});

test("upgrade telt alleen evenementen die zelf zwaar genoeg wegen", () => {
  const result = run({
    events: [event(), event({ id: "evt-2", slug: "klein", name: "Klein evenement" })],
    windows: [window({ pickupImpactLevel: "high" }), window({ id: "win-2", eventId: "evt-2", pickupImpactLevel: "elevated" })],
    zones: [zone(), zone({ id: "zone-2", eventId: "evt-2" })],
    config: { ...CONFIG, concurrentUpgradeEnabled: true },
  });
  assert.equal(result.concurrentEventCount, 2);
  assert.equal(result.upgradeApplied, false);
  assert.equal(result.level, "high");
});

// ── Bovengrens en tarieven ───────────────────────────────────────────────────

test("maxImpactLevel topt globaal af, niet alleen na een upgrade", () => {
  const result = run({ config: { ...CONFIG, maxImpactLevel: "high" } });
  assert.equal(result.level, "high");
  assert.equal(result.amountCents, 2500);
  assert.equal(result.cappedByMaxLevel, true);
});

test("ontbrekende tariefregel → 0 cent, nooit een geraden bedrag", () => {
  const incomplete: EventFeeRules = new Map<EventImpactLevel, EventFeeRule>([["high", { feeCents: 2500, maxUpliftPct: null }]]);
  const result = run({ rules: incomplete });
  assert.equal(result.level, "extreme");
  assert.equal(result.amountCents, 0);
});

test("bedragen komen uitsluitend uit de ingegeven regels", () => {
  const alternative: EventFeeRules = new Map<EventImpactLevel, EventFeeRule>([["extreme", { feeCents: 7500, maxUpliftPct: null }]]);
  assert.equal(run({ rules: alternative }).amountCents, 7500);
});

// ── Uplift-cap (Phase 6.3.2) ─────────────────────────────────────────────────

const CAPPED_RULES: EventFeeRules = new Map<EventImpactLevel, EventFeeRule>([
  ["none", { feeCents: 0, maxUpliftPct: 40 }],
  ["elevated", { feeCents: 1250, maxUpliftPct: 40 }],
  ["high", { feeCents: 2500, maxUpliftPct: 40 }],
  ["very_high", { feeCents: 4000, maxUpliftPct: 40 }],
  ["extreme", { feeCents: 6000, maxUpliftPct: 40 }],
]);

function capped(baselineSubtotalCents: number | null) {
  return run({
    rules: CAPPED_RULES,
    windows: [window({ pickupImpactLevel: "very_high" })],
    baselineSubtotalCents,
  });
}

test("zonder cap in de tariefregel blijft het vlakke bedrag staan", () => {
  const r = run({ windows: [window({ pickupImpactLevel: "very_high" })], baselineSubtotalCents: 5700 });
  assert.equal(r.amountCents, 4000);
  assert.equal(r.configuredFeeCents, 4000);
  assert.equal(r.maxUpliftPct, null);
  assert.equal(r.capApplied, false);
});

test("de cap knijpt alleen waar het vlakke tarief onevenredig wordt", () => {
  // Exact de getallen uit de Phase 6.3.1-calibratie.
  assert.equal(capped(5700).amountCents, 2280); // €57 → 40% = €22,80
  assert.equal(capped(7778).amountCents, 3111); // €77,78 → €31,11
  assert.equal(capped(10300).amountCents, 4000); // €103 → cap €41,20, dus vol tarief
  assert.equal(capped(14778).amountCents, 4000); // ruim boven de cap
});

test("de cap laat zien dát hij is toegepast, zonder het tarief te vergeten", () => {
  const knijpt = capped(5700);
  assert.equal(knijpt.configuredFeeCents, 4000);
  assert.equal(knijpt.maxUpliftPct, 40);
  assert.equal(knijpt.capApplied, true);

  const ruim = capped(14778);
  assert.equal(ruim.configuredFeeCents, 4000);
  assert.equal(ruim.capApplied, false);
});

test("zonder subtotaal is er niets om tegen te cappen — vlak tarief blijft", () => {
  const r = capped(null);
  assert.equal(r.amountCents, 4000);
  assert.equal(r.capApplied, false);
});

test("de cap kent geen ondergrens: een zeer korte rit levert een klein bedrag", () => {
  const r = capped(1000); // €10 subtotaal → €4,00
  assert.equal(r.amountCents, 400);
  assert.equal(r.capApplied, true);
});

test("na de cap ligt de opslag nooit boven de ingestelde grens", () => {
  for (const base of [1000, 2500, 5700, 7778, 9999, 10300, 14778, 50000]) {
    const r = capped(base);
    const pct = (r.amountCents / base) * 100;
    assert.ok(pct <= 40.0001, `subtotaal ${base}: opslag ${pct.toFixed(2)}%`);
  }
});

test("de metadata maakt het toegepaste beleid herleidbaar", () => {
  const meta = eventFeeMetadata(capped(5700));
  assert.equal(meta.amountCents, 2280);
  assert.equal(meta.configuredFeeCents, 4000);
  assert.equal(meta.maxUpliftPct, 40);
  assert.equal(meta.capApplied, true);
});
