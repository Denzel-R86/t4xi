// Prijsinvariant-tests voor het deadhead-shadowmodel (SHADOW-ONLY). Bewijst dat
// het wiren van de shadow-berekening in tryDistanceTariff/logQuote de bindende
// klantprijs (`resolveQuoteWith(...).price`) NOOIT aanraakt — voor elke
// classificatie (vaste route, unknown, high_demand, peripheral-qualifies).
//
// Alle km/min/prijs-fixtures zijn VAST — geen enkele test hangt af van live
// verkeersduur. De "onopgeloste lange routes"-fixtures zijn op 2026-08-09
// vastgelegd tegen de live productie-API (zie plan §6, groep 2).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveQuoteWith,
  quoteFingerprint,
  loadDeadheadConfig,
  SHADOW_LOAD_TIMEOUT_MS,
  type ResolveQuoteDeps,
  type PricingQuoteInput,
  type ShadowLogEntry,
} from "@/lib/pricing/service";
import type { DeadheadConfig } from "@/lib/pricing/deadhead-shadow";
import type { PricingSupabaseClient } from "@/lib/supabase/server";

/** De computed (niet-overgeslagen) variant van ShadowLogEntry, voor test-asserties. */
type ComputedShadow = Exclude<ShadowLogEntry, { shadowSkipped: true }>;

function assertComputed(shadow: ShadowLogEntry | null): ComputedShadow {
  assert.ok(shadow !== null && !("shadowSkipped" in shadow), "shadow had moeten worden berekend");
  return shadow as ComputedShadow;
}

const vclass = {
  id: "veh-exec-ev",
  code: "executive-ev",
  max_passengers: 4,
  max_luggage: 3,
  active: true,
};

const CONFIG: DeadheadConfig = { minDistanceKm: 80, deadheadFactor: 0.6, maxDeadheadKm: 80 };
const NO_HIGH_DEMAND = { locationIds: new Set<string>(), cityIds: new Set<string>() };

function makeDeps(o: Partial<ResolveQuoteDeps> & { onShadow?: (e: ShadowLogEntry) => void } = {}): ResolveQuoteDeps {
  const { onShadow, ...rest } = o;
  return {
    findLocation: async () => null,
    findVehicleClass: async () => vclass,
    findFixedRoute: async () => null,
    getRoute: async () => ({ distanceKm: 20, durationMin: 30 }),
    loadDeadheadConfig: async () => CONFIG,
    loadHighDemandZones: async () => NO_HIGH_DEMAND,
    recordShadow: onShadow,
    ...rest,
  };
}

const input = (o: Partial<PricingQuoteInput> = {}): PricingQuoteInput => ({
  pickup: "pickup",
  dropoff: "dropoff",
  ...o,
});

// ── Groep 1: vaste routes — tryDistanceTariff/shadow draait hier niet ────────

const FIXED_ROUTES: Array<{ label: string; km: number; min: number; price: number }> = [
  { label: "Amsterdam Centrum → Schiphol (vast)", km: 26, min: 31, price: 57 },
  { label: "Almere Poort → Schiphol (vast)", km: 39, min: 38, price: 102 },
  { label: "Utrecht Centrum → Schiphol (vast)", km: 51, min: 49, price: 110 },
  { label: "Rotterdam → Schiphol (vast)", km: 61, min: 54, price: 119 },
];

for (const route of FIXED_ROUTES) {
  test(`prijsinvariant — vaste route: ${route.label}`, async () => {
    let shadowCalled = false;
    const loc = { id: `${route.label}-id`, slug: route.label, name: route.label, active: true, location_type: "city" as const, city_id: null };
    const res = await resolveQuoteWith(
      input(),
      makeDeps({
        findLocation: async () => loc,
        findFixedRoute: async () => ({
          price: route.price,
          return_price: route.price * 2,
          currency: "EUR",
          distance_km: route.km,
          estimated_duration_min: route.min,
          vat_rate: 9,
          source_label: route.label,
          valid_from: "2026-01-01T00:00:00.000Z",
          active: true,
        }),
        getRoute: async () => {
          throw new Error("getRoute mag voor een vaste route nooit worden aangeroepen");
        },
        onShadow: () => {
          shadowCalled = true;
        },
      })
    );
    assert.equal(res.available, true);
    if (res.available) {
      assert.equal(res.price, route.price);
      assert.equal(res.source, "fixed_route_prices");
    }
    assert.equal(shadowCalled, false, "shadow-berekening mag niet draaien op het vaste-route-pad");
  });
}

// ── Groep 2: onopgeloste lange routes — classification "unknown" ────────────

const UNKNOWN_LONG_ROUTES: Array<{ label: string; km: number; min: number; price: number }> = [
  { label: "Laren → Eindhoven Airport", km: 104.8, min: 72, price: 158 },
  { label: "Laren → Designer Outlet Roermond", km: 160.7, min: 115, price: 242 },
  { label: "Laren → Maastricht", km: 197.7, min: 137, price: 290 },
  { label: "Amsterdam → Eindhoven Airport", km: 119.7, min: 84, price: 181 },
  { label: "Amsterdam → Roermond", km: 175.5, min: 127, price: 265 },
  { label: "Amsterdam → Maastricht", km: 212.5, min: 150, price: 314 },
  { label: "Almere → Eindhoven Airport", km: 121.3, min: 80, price: 178 },
  { label: "Almere → Roermond", km: 177.1, min: 123, price: 261 },
  { label: "Almere → Maastricht", km: 214.1, min: 146, price: 311 },
  { label: "Utrecht → Eindhoven Airport", km: 86.6, min: 64, price: 137 },
  { label: "Utrecht → Roermond", km: 142.5, min: 106, price: 220 },
  { label: "Utrecht → Maastricht", km: 179.4, min: 129, price: 269 },
];

for (const route of UNKNOWN_LONG_ROUTES) {
  test(`prijsinvariant — onopgeloste lange route (unknown, analysis-only): ${route.label}`, async () => {
    let shadow: ShadowLogEntry | null = null;
    const res = await resolveQuoteWith(
      input(),
      makeDeps({
        getRoute: async () => ({ distanceKm: route.km, durationMin: route.min }),
        onShadow: (e) => {
          shadow = e;
        },
      })
    );
    assert.equal(res.available, true);
    if (res.available) {
      assert.equal(res.price, route.price);
      assert.equal(res.source, "distance_tariff");
    }
    // De kandidaat-berekening draait (analysisOnly), maar raakt price niet aan.
    const computed = assertComputed(shadow);
    assert.equal(computed.classification, "unknown");
    assert.equal(computed.analysisOnly, true);
    assert.equal(computed.qualifies, false);
    assert.equal(computed.eligibleForActivation, false);
  });
}

// ── Groep 3: synthetische fixtures — peripheral (qualifies) en high_demand ───

test("prijsinvariant — bekende perifere bestemming >80km (qualifies=true) verandert price niet", async () => {
  let shadow: ShadowLogEntry | null = null;
  const dropoff = { id: "roermond-id", slug: "roermond", name: "Roermond", active: true, location_type: "city" as const, city_id: "roermond-city-id" };
  const res = await resolveQuoteWith(
    input(),
    makeDeps({
      findLocation: async (raw) => (raw === "dropoff" ? dropoff : null),
      getRoute: async () => ({ distanceKm: 90, durationMin: 70 }),
      onShadow: (e) => {
        shadow = e;
      },
    })
  );
  assert.equal(res.available, true);
  if (res.available) {
    // 10.75 + 90*0.65 + 70*1.10 = 146.25 → €146 — ONGEWIJZIGD ondanks qualifies=true.
    assert.equal(res.price, 146);
    assert.equal(res.source, "distance_tariff");
  }
  const computed = assertComputed(shadow);
  assert.equal(computed.classification, "peripheral");
  assert.equal(computed.qualifies, true);
  assert.equal(computed.eligibleForActivation, true);
  // De shadow-prijs wijkt bewust af van de live prijs — dat bewijst juist dat
  // hij er los van staat, niet dat hij hem beïnvloedt.
  assert.equal(computed.shadowPrice, 181);
});

test("prijsinvariant — bekende high-demand-bestemming >80km levert geen kandidaat en verandert price niet", async () => {
  let shadow: ShadowLogEntry | null = null;
  const dropoff = { id: "schiphol-airport-id", slug: "schiphol-airport", name: "Schiphol Airport", active: true, location_type: "airport" as const, city_id: null };
  const res = await resolveQuoteWith(
    input(),
    makeDeps({
      findLocation: async (raw) => (raw === "dropoff" ? dropoff : null),
      loadHighDemandZones: async () => ({ locationIds: new Set(["schiphol-airport-id"]), cityIds: new Set<string>() }),
      getRoute: async () => ({ distanceKm: 150, durationMin: 100 }),
      onShadow: (e) => {
        shadow = e;
      },
    })
  );
  assert.equal(res.available, true);
  if (res.available) {
    // 10.75 + 150*0.65 + 100*1.10 = 218.25 → €218
    assert.equal(res.price, 218);
    assert.equal(res.source, "distance_tariff");
  }
  const computed = assertComputed(shadow);
  assert.equal(computed.classification, "high_demand");
  assert.equal(computed.qualifies, false);
  assert.equal(computed.analysisOnly, false);
  assert.equal(computed.candidateShadowPrice, null);
});

// ── Ontbrekende config: shadow overgeslagen, price ongewijzigd ───────────────

test("ontbrekende deadhead-config → shadow overgeslagen (gelogd), price ongewijzigd, offerte niet geblokkeerd", async () => {
  let shadow: ShadowLogEntry | null = null;
  const res = await resolveQuoteWith(
    input(),
    makeDeps({
      loadDeadheadConfig: async () => null,
      getRoute: async () => ({ distanceKm: 104.8, durationMin: 72 }),
      onShadow: (e) => {
        shadow = e;
      },
    })
  );
  assert.equal(res.available, true);
  if (res.available) assert.equal(res.price, 158);
  assert.deepEqual(shadow, { shadowSkipped: true, reason: "missing_config" });
});

// ── Robuustheid: throw, timeout, ontbrekende/dubbele config ─────────────────
// (pre-commit-audit) Elke variant moet: (a) price/source/fingerprint ongewijzigd
// laten, (b) de offerte nooit blokkeren of laten falen, (c) een expliciete,
// specifieke skip-reden loggen.

test("loader gooit (bv. netwerkfout) → shadow overgeslagen (reason load_error), price/fingerprint ongewijzigd", async () => {
  let shadow: ShadowLogEntry | null = null;
  const req = input();
  const res = await resolveQuoteWith(
    req,
    makeDeps({
      loadDeadheadConfig: async () => {
        throw new Error("connection reset");
      },
      getRoute: async () => ({ distanceKm: 104.8, durationMin: 72 }),
      onShadow: (e) => {
        shadow = e;
      },
    })
  );
  assert.equal(res.available, true);
  if (res.available) {
    assert.equal(res.price, 158);
    assert.equal(res.source, "distance_tariff");
    assert.equal(res.fingerprint, quoteFingerprint(req));
  }
  assert.deepEqual(shadow, { shadowSkipped: true, reason: "load_error" });
});

test("high-demand-zones-loader gooit → zelfde bescherming (reason load_error), price ongewijzigd", async () => {
  let shadow: ShadowLogEntry | null = null;
  const res = await resolveQuoteWith(
    input(),
    makeDeps({
      loadHighDemandZones: async () => {
        throw new Error("timeout van upstream");
      },
      getRoute: async () => ({ distanceKm: 104.8, durationMin: 72 }),
      onShadow: (e) => {
        shadow = e;
      },
    })
  );
  assert.equal(res.available, true);
  if (res.available) assert.equal(res.price, 158);
  assert.deepEqual(shadow, { shadowSkipped: true, reason: "load_error" });
});

test("hangende loader → begrensd door SHADOW_LOAD_TIMEOUT_MS, geen onbeperkt wachten, price ongewijzigd", async () => {
  let shadow: ShadowLogEntry | null = null;
  const start = Date.now();
  const res = await resolveQuoteWith(
    input(),
    makeDeps({
      // Lost nooit op — bewijst dat de quote NIET onbeperkt op deze dependency wacht.
      loadDeadheadConfig: () => new Promise<DeadheadConfig | null>(() => {}),
      getRoute: async () => ({ distanceKm: 104.8, durationMin: 72 }),
      onShadow: (e) => {
        shadow = e;
      },
    })
  );
  const elapsedMs = Date.now() - start;
  assert.equal(res.available, true);
  if (res.available) assert.equal(res.price, 158);
  assert.deepEqual(shadow, { shadowSkipped: true, reason: "timeout" });
  // Begrensd: niet te vroeg (timeout moet echt gelden) en niet te laat (ruime
  // marge voor test-jitter, maar bewijst dat er geen onbeperkt wachten is).
  assert.ok(elapsedMs >= SHADOW_LOAD_TIMEOUT_MS, `timeout ging te vroeg af: ${elapsedMs}ms < ${SHADOW_LOAD_TIMEOUT_MS}ms`);
  assert.ok(
    elapsedMs < SHADOW_LOAD_TIMEOUT_MS + 300,
    `verwacht ~${SHADOW_LOAD_TIMEOUT_MS}ms, duurde ${elapsedMs}ms — geen bovengrens op de wachttijd?`
  );
});

/** Minimale, chainable Supabase-fake — alleen wat loadDeadheadConfig gebruikt (from/select/eq/limit). */
function fakeSupabaseRows(rows: Array<Record<string, unknown>>): PricingSupabaseClient {
  const builder = {
    select: () => builder,
    eq: () => builder,
    limit: () => Promise.resolve({ data: rows, error: null }),
  };
  return { from: () => builder } as unknown as PricingSupabaseClient;
}

test("loadDeadheadConfig: nul actieve rijen → null (shadow overgeslagen)", async () => {
  assert.equal(await loadDeadheadConfig(fakeSupabaseRows([])), null);
});

test("loadDeadheadConfig: precies één actieve rij → correct gemapt", async () => {
  const config = await loadDeadheadConfig(
    fakeSupabaseRows([{ min_distance_km: 80, deadhead_factor: 0.6, max_deadhead_km: 80 }])
  );
  assert.deepEqual(config, { minDistanceKm: 80, deadheadFactor: 0.6, maxDeadheadKm: 80 });
});

test("loadDeadheadConfig: dubbele actieve rij (ondanks de DB-constraint) → defensief null, geen gok", async () => {
  const config = await loadDeadheadConfig(
    fakeSupabaseRows([
      { min_distance_km: 80, deadhead_factor: 0.6, max_deadhead_km: 80 },
      { min_distance_km: 90, deadhead_factor: 0.5, max_deadhead_km: 70 },
    ])
  );
  assert.equal(config, null);
});

// ── Latency: shadow-berekening voegt geen merkbare vertraging toe (snelle deps) ─

test("latency-overhead: shadow-berekening met snelle (in-memory) deps blijft marginaal", async () => {
  const ITER = 25;
  async function avgMs(withShadow: boolean): Promise<number> {
    const start = Date.now();
    for (let i = 0; i < ITER; i++) {
      await resolveQuoteWith(
        input(),
        withShadow
          ? makeDeps({ getRoute: async () => ({ distanceKm: 104.8, durationMin: 72 }) })
          : makeDeps({
              getRoute: async () => ({ distanceKm: 104.8, durationMin: 72 }),
              loadDeadheadConfig: undefined,
              loadHighDemandZones: undefined,
              recordShadow: undefined,
            })
      );
    }
    return (Date.now() - start) / ITER;
  }
  const withShadowMs = await avgMs(true);
  const withoutShadowMs = await avgMs(false);
  const overheadMs = withShadowMs - withoutShadowMs;
  // Puur informatief voor de audit-rapportage; ruime marge om CI-jitter te
  // absorberen — dit is geen strikte performance-SLA-test.
  console.log(
    `[latency] met shadow: ${withShadowMs.toFixed(3)}ms/call, zonder: ${withoutShadowMs.toFixed(3)}ms/call, overhead: ${overheadMs.toFixed(3)}ms/call`
  );
  assert.ok(overheadMs < 50, `overhead te groot voor snelle in-memory deps: ${overheadMs.toFixed(3)}ms/call`);
});

// ── Volledige publieke response identiek met/zonder shadow-deps ─────────────

test("volledig PricingQuoteResult-object is identiek met en zonder shadow-deps — geen enkel publiek veld verandert", async () => {
  const withShadow = await resolveQuoteWith(
    input(),
    makeDeps({ getRoute: async () => ({ distanceKm: 104.8, durationMin: 72 }) })
  );
  const withoutShadow = await resolveQuoteWith(
    input(),
    makeDeps({
      getRoute: async () => ({ distanceKm: 104.8, durationMin: 72 }),
      loadDeadheadConfig: undefined,
      loadHighDemandZones: undefined,
      recordShadow: undefined,
    })
  );
  assert.deepEqual(withShadow, withoutShadow);
});

test("volledig PricingQuoteResult-object blijft identiek als de shadow-loaders falen", async () => {
  const clean = await resolveQuoteWith(
    input(),
    makeDeps({
      getRoute: async () => ({ distanceKm: 104.8, durationMin: 72 }),
      loadDeadheadConfig: undefined,
      loadHighDemandZones: undefined,
      recordShadow: undefined,
    })
  );
  const withFailingLoaders = await resolveQuoteWith(
    input(),
    makeDeps({
      getRoute: async () => ({ distanceKm: 104.8, durationMin: 72 }),
      loadDeadheadConfig: async () => {
        throw new Error("boom");
      },
    })
  );
  assert.deepEqual(clean, withFailingLoaders);
});
