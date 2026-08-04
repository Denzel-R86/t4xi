import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveQuoteWith,
  type ResolveQuoteDeps,
  type PricingQuoteInput,
} from "@/lib/pricing/service";
import { priceFromDistance } from "@/lib/pricing/distance-tariff";
import { getDrivingRoute } from "@/lib/pricing/routing";
import { mapPricingSource, buildPriceSnapshot } from "@/lib/pricing/snapshot";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const loc = (slug: string, airport = false) => ({
  id: `${slug}-id`,
  slug,
  name: slug,
  active: true,
  location_type: airport ? "airport" : "district",
});

const vclass = {
  id: "veh-exec-ev",
  code: "executive-ev",
  max_passengers: 3,
  max_luggage: 3,
  active: true,
};

const fixedRow = {
  price: 69,
  return_price: 120,
  currency: "EUR",
  distance_km: 14,
  estimated_duration_min: 24,
  vat_rate: 9,
  source_label: "Amsterdam Centrum → Schiphol",
  valid_from: "2026-01-01T00:00:00.000Z",
  active: true,
};

// Default deps: locaties onbekend, klasse bekend, geen vaste route, routing levert
// een normale rit. Tests overschrijven per geval alleen wat relevant is.
const baseDeps = (o: Partial<ResolveQuoteDeps> = {}): ResolveQuoteDeps => ({
  findLocation: async () => null,
  findVehicleClass: async () => vclass,
  findFixedRoute: async () => null,
  getRoute: async () => ({ distanceKm: 20, durationMin: 30 }),
  ...o,
});

const input = (o: Partial<PricingQuoteInput> = {}): PricingQuoteInput => ({
  pickup: "Sterduinstraat 2, 1361BP Almere",
  dropoff: "Drachtenstraat 28, Almere",
  ...o,
});

// ── Vaste route blijft leidend ───────────────────────────────────────────────

test("vaste route blijft leidend — afstand-tarief wordt niet aangeroepen", async () => {
  let routeCalled = false;
  const res = await resolveQuoteWith(
    input({ pickup: "amsterdam-centrum", dropoff: "schiphol-airport" }),
    baseDeps({
      findLocation: async (raw) => loc(raw),
      findFixedRoute: async () => fixedRow,
      getRoute: async () => {
        routeCalled = true;
        return { distanceKm: 999, durationMin: 999 };
      },
    })
  );
  assert.equal(res.available, true);
  assert.equal(res.available && res.source, "fixed_route_prices");
  assert.equal(res.available && res.price, 69);
  assert.equal(routeCalled, false, "routing mag niet worden geraadpleegd bij een vaste route");
});

// ── Vrije adressen → bindend afstand-tarief ──────────────────────────────────

test("vrije adressen zonder vaste route → afstand-tarief (bindende prijs)", async () => {
  const res = await resolveQuoteWith(input(), baseDeps());
  assert.equal(res.available, true);
  if (!res.available) return;
  assert.equal(res.source, "distance_tariff");
  assert.equal(res.price, priceFromDistance(20, 30));
  assert.equal(res.singlePrice, priceFromDistance(20, 30));
  assert.equal(res.distanceKm, 20);
  assert.equal(res.estimatedDurationMin, 30);
  assert.equal(res.route.pickupSlug, "sterduinstraat-2-1361bp-almere");
});

// ── Minimumprijs €30 ─────────────────────────────────────────────────────────

test("korte rit kapt af op de minimumprijs €30 (ook via de service)", async () => {
  const res = await resolveQuoteWith(
    input(),
    baseDeps({ getRoute: async () => ({ distanceKm: 2, durationMin: 5 }) })
  );
  assert.equal(res.available && res.price, 30);
});

// ── Retour = 2× enkel ────────────────────────────────────────────────────────

test("retour = 2× de enkele rit, geen korting", async () => {
  const res = await resolveQuoteWith(input({ returnTrip: true }), baseDeps());
  assert.equal(res.available, true);
  if (!res.available) return;
  const single = priceFromDistance(20, 30);
  assert.equal(res.returnApplied, true);
  assert.equal(res.returnPrice, single * 2);
  assert.equal(res.price, single * 2);
});

// ── Ontbrekende Google-key → offerte op aanvraag ─────────────────────────────

test("ontbrekende Google-key → getDrivingRoute geeft null", async () => {
  const prev = process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.GOOGLE_MAPS_API_KEY;
  try {
    assert.equal(await getDrivingRoute("A", "B"), null);
  } finally {
    if (prev !== undefined) process.env.GOOGLE_MAPS_API_KEY = prev;
  }
});

test("geen bruikbare route (bijv. geen key) → offerte op aanvraag", async () => {
  const res = await resolveQuoteWith(input(), baseDeps({ getRoute: async () => null }));
  assert.equal(res.available, false);
  assert.equal(res.available === false && res.message, "Offerte op aanvraag");
  assert.equal(res.available === false && res.reason, "unknown_location");
});

// ── Google/route-fout → offerte op aanvraag ──────────────────────────────────

test("routing-fout (fetch gooit) → getDrivingRoute geeft null", async () => {
  const prevKey = process.env.GOOGLE_MAPS_API_KEY;
  const prevFetch = globalThis.fetch;
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  try {
    assert.equal(await getDrivingRoute("A", "B"), null);
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey !== undefined) process.env.GOOGLE_MAPS_API_KEY = prevKey;
    else delete process.env.GOOGLE_MAPS_API_KEY;
  }
});

test("routing-status != OK → getDrivingRoute geeft null", async () => {
  const prevKey = process.env.GOOGLE_MAPS_API_KEY;
  const prevFetch = globalThis.fetch;
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ status: "ZERO_RESULTS", routes: [] }),
  })) as unknown as typeof fetch;
  try {
    assert.equal(await getDrivingRoute("A", "B"), null);
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey !== undefined) process.env.GOOGLE_MAPS_API_KEY = prevKey;
    else delete process.env.GOOGLE_MAPS_API_KEY;
  }
});

// ── Snapshot: distance_tariff → dynamic ──────────────────────────────────────

test("mapPricingSource: distance_tariff → dynamic", () => {
  assert.equal(mapPricingSource("distance_tariff"), "dynamic");
});

test("buildPriceSnapshot van een afstand-tarief-quote → pricingSource dynamic", async () => {
  const quote = await resolveQuoteWith(input(), baseDeps());
  assert.equal(quote.available, true);
  if (!quote.available) return;
  const snap = buildPriceSnapshot(quote, { quoteId: "q-1", now: new Date("2026-07-20T10:00:00Z") });
  assert.ok(snap, "snapshot moet gebouwd worden voor distance_tariff");
  assert.equal(snap?.pricingSource, "dynamic");
  assert.equal(snap?.routeSnapshot.source, "dynamic");
});
