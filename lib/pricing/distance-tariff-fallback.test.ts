import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveQuoteWith,
  type ResolveQuoteDeps,
  type PricingQuoteInput,
} from "@/lib/pricing/service";
import { priceFromDistance } from "@/lib/pricing/distance-tariff";
import { getDrivingRoute, resolveDepartureTime } from "@/lib/pricing/routing";
import { mapPricingSource, buildPriceSnapshot, validateSnapshot } from "@/lib/pricing/snapshot";
import { neutralPickupApproachDeps, wrapGetRouteWithNeutralApproach } from "@/lib/pricing/pickup-approach-fake";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const loc = (slug: string, airport = false) => ({
  id: `${slug}-id`,
  slug,
  name: slug,
  active: true,
  location_type: airport ? "airport" : "district",
  city_id: null,
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
const baseDeps = (o: Partial<ResolveQuoteDeps> = {}): ResolveQuoteDeps => {
  const { getRoute: passengerGetRoute, ...rest } = o;
  return {
    findLocation: async () => null,
    findVehicleClass: async () => vclass,
    findFixedRoute: async () => null,
    getRoute: wrapGetRouteWithNeutralApproach(passengerGetRoute ?? (async () => ({ distanceKm: 20, durationMin: 30 }))),
    ...neutralPickupApproachDeps,
    ...rest,
  };
};

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

test("Routes API v2: geen route in de response → getDrivingRoute geeft null", async () => {
  const prevKey = process.env.GOOGLE_MAPS_API_KEY;
  const prevFetch = globalThis.fetch;
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ routes: [] }),
  })) as unknown as typeof fetch;
  try {
    assert.equal(await getDrivingRoute("A", "B"), null);
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey !== undefined) process.env.GOOGLE_MAPS_API_KEY = prevKey;
    else delete process.env.GOOGLE_MAPS_API_KEY;
  }
});

test("Routes API v2: non-2xx HTTP → getDrivingRoute geeft null", async () => {
  const prevKey = process.env.GOOGLE_MAPS_API_KEY;
  const prevFetch = globalThis.fetch;
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  globalThis.fetch = (async () => ({
    ok: false,
    status: 400,
    json: async () => ({}),
  })) as unknown as typeof fetch;
  try {
    assert.equal(await getDrivingRoute("A", "B"), null);
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey !== undefined) process.env.GOOGLE_MAPS_API_KEY = prevKey;
    else delete process.env.GOOGLE_MAPS_API_KEY;
  }
});

test("Routes API v2: POST computeRoutes met field mask, key in header (niet in URL), parse distanceMeters/duration", async () => {
  const prevKey = process.env.GOOGLE_MAPS_API_KEY;
  const prevFetch = globalThis.fetch;
  process.env.GOOGLE_MAPS_API_KEY = "test-key";

  let seenUrl = "";
  let seenInit: RequestInit | undefined;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    seenUrl = String(url);
    seenInit = init;
    return {
      ok: true,
      json: async () => ({ routes: [{ distanceMeters: 20000, duration: "1800s" }] }),
    };
  }) as unknown as typeof fetch;

  try {
    const route = await getDrivingRoute("Amsterdam", "Utrecht");
    // 20 km, 30 min uit 20000 m / 1800 s
    assert.deepEqual(route, { distanceKm: 20, durationMin: 30 });

    // Endpoint + methode
    assert.equal(seenUrl, "https://routes.googleapis.com/directions/v2:computeRoutes");
    assert.equal(seenInit?.method, "POST");

    // Key uitsluitend in de header, NOOIT in de URL
    const headers = (seenInit?.headers ?? {}) as Record<string, string>;
    assert.equal(headers["X-Goog-Api-Key"], "test-key");
    assert.equal(headers["X-Goog-FieldMask"], "routes.distanceMeters,routes.duration");
    assert.ok(!seenUrl.includes("test-key"), "API-key mag niet in de URL staan");

    // Body: DRIVE, traffic-aware, gepland vertrektijdstip
    const body = JSON.parse(String(seenInit?.body));
    assert.equal(body.travelMode, "DRIVE");
    assert.equal(body.routingPreference, "TRAFFIC_AWARE");
    assert.ok(typeof body.departureTime === "string" && body.departureTime.length > 0);
    assert.equal(body.origin.address, "Amsterdam");
    assert.equal(body.destination.address, "Utrecht");
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

test("validateSnapshot accepteert een dynamic distance_tariff-snapshot (persist-regressie)", async () => {
  const quote = await resolveQuoteWith(input(), baseDeps());
  assert.equal(quote.available, true);
  if (!quote.available) return;
  const snap = buildPriceSnapshot(quote, { quoteId: "q-2", now: new Date("2026-07-20T10:00:00Z") });
  assert.ok(snap);
  const v = validateSnapshot(snap!);
  assert.equal(v.ok, true, `dynamic-snapshot moet geldig zijn, kreeg: ${v.ok ? "" : v.error}`);
});

// ── Gepland vertrektijdstip (departureAt) ────────────────────────────────────

test("toekomstige boeking: geldige toekomstige departureAt wordt gebruikt", () => {
  const now = Date.parse("2026-08-10T12:00:00Z");
  const future = "2026-08-10T14:00:00.000Z";
  assert.equal(resolveDepartureTime(future, now).toISOString(), future);
});

test("boeking dezelfde dag maar later: wordt gebruikt zolang in de toekomst", () => {
  const now = Date.parse("2026-08-10T12:00:00Z");
  const sameDayLater = "2026-08-10T12:05:00.000Z";
  assert.equal(resolveDepartureTime(sameDayLater, now).toISOString(), sameDayLater);
});

test("verstreken vertrektijd → noodwaarde nu + 1 min", () => {
  const now = Date.parse("2026-08-10T12:00:00Z");
  const past = "2026-08-10T09:00:00.000Z";
  assert.equal(resolveDepartureTime(past, now).getTime(), now + 60_000);
});

test("ontbrekende of ongeldige departureAt → noodwaarde nu + 1 min", () => {
  const now = Date.parse("2026-08-10T12:00:00Z");
  assert.equal(resolveDepartureTime(undefined, now).getTime(), now + 60_000);
  assert.equal(resolveDepartureTime("geen-datum", now).getTime(), now + 60_000);
});

test("service leidt input.departureAt door naar de routing-laag", async () => {
  let seen: string | undefined = "NIET-AANGEROEPEN";
  const deps = baseDeps({
    getRoute: async (_o, _d, departureAt) => {
      seen = departureAt;
      return { distanceKm: 20, durationMin: 30 };
    },
  });
  await resolveQuoteWith(input({ departureAt: "2026-08-10T14:00:00.000Z" }), deps);
  assert.equal(seen, "2026-08-10T14:00:00.000Z");
});
