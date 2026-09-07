// Fail-safety van de Event Pricing-applicatielaag in het LIVE quotepad.
//
// De vraag die hier beantwoord wordt is niet "rekent het evenemententarief
// goed", maar: kan deze module een normale offerte ooit breken, vertragen of
// veranderen wanneer hij uit staat of stuk is? Elke test hieronder hoort
// fail-open te bewijzen — de offerte gaat door zonder toeslag.
import { test } from "node:test";
import assert from "node:assert/strict";

import { calculateBookingPrice } from "@/lib/pricing/engine";
import { NO_AIRPORT, withRetryOnce, type PricingQuoteResult } from "@/lib/pricing/service";
import { eurosToCents } from "@/lib/payments/create-intent";
import type { EventPricingData } from "@/lib/pricing/event-store";
import type { EventFeeRule, EventImpactLevel } from "@/lib/pricing/event-pricing";

type AvailableQuote = Extract<PricingQuoteResult, { available: true }>;

const PICKUP = "Coolsingel 1, 3011 AD Rotterdam";
const DROPOFF = "Schiphol Airport, 1118 CP Schiphol";
const DEPART = "2026-10-24T13:00:00.000Z";

function quoteFixed(price: number): AvailableQuote {
  return {
    available: true, source: "fixed_route_prices", price, singlePrice: price,
    returnPrice: null, returnApplied: false,
    priceCents: eurosToCents(price), singlePriceCents: eurosToCents(price),
    returnPriceCents: null, rideOnlySinglePriceCents: eurosToCents(price),
    currency: "EUR", vatRate: 9, distanceKm: 22.5, estimatedDurationMin: 28,
    vehicleClass: "executive-ev",
    route: { pickupSlug: "rotterdam", dropoffSlug: "schiphol", label: "RTM → AMS" },
    isAirportTransfer: true,
    airport: { ...NO_AIRPORT, dropoffIsAirport: true, isAirportDropoff: true, isAirportTransfer: true },
    dataSource: "supabase", fingerprint: "rotterdam|schiphol|executive-ev|enkel",
    pickupApproach: null, economicFloor: null,
  };
}

function quoteDistance(price: number): AvailableQuote {
  return { ...quoteFixed(price), source: "distance_tariff", dataSource: "routing",
    route: { pickupSlug: "rotterdam", dropoffSlug: "schiphol", label: null } };
}

const RULES = new Map<EventImpactLevel, EventFeeRule>([
  ["high", { feeCents: 2500, maxUpliftPct: 40 }],
  ["very_high", { feeCents: 4000, maxUpliftPct: 40 }],
]);

/** Config met mode=off, maar mét volledig gevulde eventdata die WEL zou matchen. */
function dataOffButMatching(): EventPricingData {
  return {
    config: {
      mode: "off", concurrentUpgradeEnabled: false, concurrentUpgradeMinEvents: 2,
      concurrentUpgradeMinLevel: "high", maxImpactLevel: "extreme",
    },
    events: [], windows: [], zones: [], rules: RULES,
  };
}

async function price(
  quote: AvailableQuote,
  loadEventPricing: () => Promise<EventPricingData | null>,
  recordShadowLog?: () => Promise<void>
) {
  return calculateBookingPrice(
    { pickup: PICKUP, dropoff: DROPOFF, returnTrip: false, departureAt: DEPART },
    {
      getQuote: async () => quote,
      now: () => new Date("2026-10-20T10:00:00.000Z"),
      generateQuoteId: () => "00000000-0000-7000-8000-000000000001",
      loadEventPricing,
      ...(recordShadowLog ? { recordShadowLog } : {}),
    }
  );
}

/** De referentie: precies wat main doet, want main heeft deze module niet. */
async function baseline(quote: AvailableQuote) {
  return price(quote, async () => null);
}

function eventAdjustments(snapshot: { adjustments: readonly { code: string }[] } | null): readonly { code: string }[] {
  return (snapshot?.adjustments ?? []).filter((a) => a.code.startsWith("event_"));
}

// ── Config-load faalt ────────────────────────────────────────────────────────

test("config-query gooit een fout → offerte gaat normaal door, cent-identiek", async () => {
  const q = quoteFixed(100);
  const ref = await baseline(q);
  const res = await price(q, async () => {
    throw new Error("supabase: connection reset");
  });
  assert.equal(res.quote.available, true);
  assert.deepEqual(res.quote, ref.quote);
  assert.equal(res.snapshot?.totalCents, ref.snapshot?.totalCents);
  assert.equal(res.snapshot?.subtotalCents, ref.snapshot?.subtotalCents);
  assert.deepEqual(eventAdjustments(res.snapshot), []);
});

test("netwerkfout tijdens het laden verandert het afstandstarief evenmin", async () => {
  const q = quoteDistance(87.5);
  const ref = await baseline(q);
  const res = await price(q, async () => {
    throw Object.assign(new Error("fetch failed"), { code: "ECONNREFUSED" });
  });
  assert.equal(res.snapshot?.totalCents, ref.snapshot?.totalCents);
  assert.deepEqual(eventAdjustments(res.snapshot), []);
});

test("ontbrekende configrij (loader levert null) → geen toeslag, prijs ongewijzigd", async () => {
  const q = quoteFixed(100);
  const ref = await baseline(q);
  const res = await price(q, async () => null);
  assert.equal(res.snapshot?.totalCents, ref.snapshot?.totalCents);
  assert.deepEqual(eventAdjustments(res.snapshot), []);
});

test("een fout die geen Error is (string throw) breekt de offerte ook niet", async () => {
  const q = quoteFixed(100);
  const ref = await baseline(q);
  const res = await price(q, async () => {
    throw "kapot";
  });
  assert.equal(res.snapshot?.totalCents, ref.snapshot?.totalCents);
});

// ── mode=off met data die WEL zou matchen ────────────────────────────────────

test("mode=off met matchende eventdata blijft cent-identiek aan geen-eventpricing", async () => {
  // De scherpste variant: alles staat klaar om een toeslag te berekenen,
  // alleen de modus staat uit. Dit is de toestand waarin productie komt te
  // staan zodra de applicatielaag live gaat.
  const q = quoteFixed(100);
  const ref = await baseline(q);
  const res = await price(q, async () => dataOffButMatching());
  assert.equal(res.snapshot?.totalCents, ref.snapshot?.totalCents);
  assert.equal(res.snapshot?.subtotalCents, ref.snapshot?.subtotalCents);
  assert.deepEqual(eventAdjustments(res.snapshot), []);
});

test("mode=off schrijft geen enkele shadow-observatie", async () => {
  let aanroepen = 0;
  await price(quoteFixed(100), async () => dataOffButMatching(), async () => {
    aanroepen += 1;
  });
  assert.equal(aanroepen, 0);
});

// ── Shadow-logging isolatie ──────────────────────────────────────────────────

test("een falende shadow-insert breekt de offerte niet en verandert de prijs niet", async () => {
  const q = quoteFixed(100);
  const ref = await baseline(q);
  const res = await price(
    q,
    async () => ({ ...dataOffButMatching(), config: { ...dataOffButMatching().config, mode: "shadow" } }),
    async () => {
      throw new Error("insert into pricing_event_shadow_logs failed");
    }
  );
  assert.equal(res.quote.available, true);
  assert.equal(res.snapshot?.totalCents, ref.snapshot?.totalCents);
  assert.deepEqual(eventAdjustments(res.snapshot), []);
});

// ── Malformed data ───────────────────────────────────────────────────────────

test("malformed configdata levert geen toeslag en geen exception", async () => {
  const q = quoteFixed(100);
  const ref = await baseline(q);
  const kapot = {
    config: { mode: "shadow" },
    events: null,
    windows: undefined,
    zones: [{ nonsens: true }],
    rules: new Map(),
  } as unknown as EventPricingData;
  const res = await price(q, async () => kapot);
  assert.equal(res.quote.available, true);
  assert.equal(res.snapshot?.totalCents, ref.snapshot?.totalCents);
  assert.deepEqual(eventAdjustments(res.snapshot), []);
});

test("lege eventtabellen in shadow leveren geen toeslag", async () => {
  const q = quoteFixed(100);
  const ref = await baseline(q);
  const leeg: EventPricingData = {
    ...dataOffButMatching(),
    config: { ...dataOffButMatching().config, mode: "shadow" },
    events: [], windows: [], zones: [], rules: new Map(),
  };
  const res = await price(q, async () => leeg);
  assert.equal(res.snapshot?.totalCents, ref.snapshot?.totalCents);
  assert.deepEqual(eventAdjustments(res.snapshot), []);
});

// ── Begrensde wachttijd ──────────────────────────────────────────────────────

test("een hangende load wordt begrensd door withRetryOnce en gaat niet oneindig door", async () => {
  // De productieloader (`loadCachedEventPricingData`) wikkelt elke poging in
  // withRetryOnce(800, 800). Dit bewijst dat een promise die NOOIT resolvet
  // toch binnen twee begrensde pogingen wordt afgebroken — het scenario waar
  // een try/catch alleen niet tegen beschermt.
  const start = Date.now();
  await assert.rejects(
    withRetryOnce(() => new Promise<never>(() => {}), 40, 40),
    /exceeded/
  );
  const verstreken = Date.now() - start;
  assert.ok(verstreken >= 80, `verwacht twee pogingen van 40ms, kreeg ${verstreken}ms`);
  assert.ok(verstreken < 1000, `mag niet blijven hangen, kreeg ${verstreken}ms`);
});
