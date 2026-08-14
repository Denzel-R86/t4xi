// Prijsgedrag-tests voor het geactiveerde deadhead-model. Bewijst dat de
// klantprijs UITSLUITEND verandert wanneer classification==="peripheral" +
// eligibleForActivation===true + een geldige shadowPrice — en in elk ander
// geval (vaste route, unknown/analysis-only, high_demand, ontbrekende config,
// queryfout, timeout) exact de basisprijs blijft (fail-closed).
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
// Standaard: LEGE allowlist. `classification==='peripheral'` alleen mag nooit
// meer activeren (hotfix 2026-08-13) — elke test die activatie verwacht moet
// expliciet zijn eigen `loadDeadheadEligibleZoneCityIds` meegeven met het
// betreffende city_id erin. Dit is bewust het "veilige" default zodat een
// vergeten override altijd zichtbaar faalt als "geen activatie", nooit als
// stilzwijgende activatie.
const NO_ELIGIBLE_ZONES = new Set<string>();
// Standaard: LEGE woonplaats-map EN een PDOK-lookup die niets vindt — een
// onopgeloste bestemming promoveert dus nooit stilzwijgend naar een zone
// tenzij een test dat expliciet met een eigen map/lookup aantoont.
const NO_ZONE_BY_WOONPLAATS = new Map<string, string>();

function makeDeps(o: Partial<ResolveQuoteDeps> & { onShadow?: (e: ShadowLogEntry) => void } = {}): ResolveQuoteDeps {
  const { onShadow, ...rest } = o;
  return {
    findLocation: async () => null,
    findVehicleClass: async () => vclass,
    findFixedRoute: async () => null,
    getRoute: async () => ({ distanceKm: 20, durationMin: 30 }),
    loadDeadheadConfig: async () => CONFIG,
    loadHighDemandZones: async () => NO_HIGH_DEMAND,
    loadDeadheadEligibleZoneCityIds: async () => NO_ELIGIBLE_ZONES,
    loadDeadheadZoneCityIdByWoonplaats: async () => NO_ZONE_BY_WOONPLAATS,
    lookupOfficialWoonplaats: async () => null,
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
    // De kandidaat-berekening draait (analysisOnly), maar raakt price niet aan:
    // candidateShadowPrice wordt NOOIT toegepast, ongeacht de hoogte ervan.
    const computed = assertComputed(shadow);
    assert.equal(computed.classification, "unknown");
    assert.equal(computed.analysisOnly, true);
    assert.equal(computed.qualifies, false);
    assert.equal(computed.eligibleForActivation, false);
    assert.equal(computed.applied, false);
    assert.equal(computed.basePrice, route.price);
    assert.equal(computed.finalPrice, route.price);
  });
}

// ── Groep 3: synthetische fixtures — peripheral (qualifies) en high_demand ───

test("ACTIVATIE — bekende perifere bestemming >80km (qualifies=true) BINNEN de toegestane zone-allowlist: shadowPrice wordt de echte prijs", async () => {
  let shadow: ShadowLogEntry | null = null;
  const dropoff = { id: "roermond-id", slug: "roermond", name: "Roermond", active: true, location_type: "city" as const, city_id: "roermond-city-id" };
  const res = await resolveQuoteWith(
    input(),
    makeDeps({
      findLocation: async (raw) => (raw === "dropoff" ? dropoff : null),
      getRoute: async () => ({ distanceKm: 90, durationMin: 70 }),
      loadDeadheadEligibleZoneCityIds: async () => new Set(["roermond-city-id"]),
      onShadow: (e) => {
        shadow = e;
      },
    })
  );
  assert.equal(res.available, true);
  if (res.available) {
    // 10.75 + 90*0.65 + 70*1.10 = 146.25 → basisprijs €146 (ongebruikt als eindprijs).
    // deadheadKm = min(90*0.6,80) = 54; effectiveKm = 144;
    // raw = 10.75 + 144*0.65 + 70*1.10 = 181.35 → shadowPrice €181 = de ECHTE prijs.
    assert.equal(res.price, 181);
    assert.equal(res.singlePrice, 181);
    assert.equal(res.source, "distance_tariff");
  }
  const computed = assertComputed(shadow);
  assert.equal(computed.classification, "peripheral");
  assert.equal(computed.qualifies, true);
  assert.equal(computed.eligibleForActivation, true);
  assert.equal(computed.zoneEligible, true);
  assert.equal(computed.applied, true);
  assert.equal(computed.shadowPrice, 181);
  assert.equal(computed.basePrice, 146);
  assert.equal(computed.finalPrice, 181);
  assert.equal(computed.deltaFromLive, 35);
});

// ── HOTFIX 2026-08-13 — dit is de kernregressietest voor de productiebug: ────
// exact dezelfde bekende, perifere bestemming (classification=peripheral,
// eligibleForActivation=true) als hierboven, maar NU zonder dat de stad in de
// expliciete deadhead-eligible-zone-allowlist staat. Vóór deze hotfix
// activeerde dit (bug: elke herkenbare, niet-high-demand stad >80km kreeg
// deadhead). Na de hotfix: classification==='peripheral' alleen is nooit meer
// voldoende — price blijft de basisprijs.
test("GEEN ACTIVATIE — bekende perifere bestemming >80km (qualifies=true) BUITEN de zone-allowlist: basisprijs blijft leidend (regressie van de productiebug)", async () => {
  let shadow: ShadowLogEntry | null = null;
  // Zelfde synthetische bestemming als de ACTIVATIE-test hierboven, maar met
  // een ander city_id — staat niet in de (lege, default) allowlist.
  const dropoff = { id: "arnhem-id", slug: "arnhem", name: "Arnhem", active: true, location_type: "city" as const, city_id: "arnhem-city-id" };
  const res = await resolveQuoteWith(
    input(),
    makeDeps({
      findLocation: async (raw) => (raw === "dropoff" ? dropoff : null),
      getRoute: async () => ({ distanceKm: 90, durationMin: 70 }),
      // loadDeadheadEligibleZoneCityIds: default (lege set) — "arnhem-city-id" staat er niet in.
      onShadow: (e) => {
        shadow = e;
      },
    })
  );
  assert.equal(res.available, true);
  if (res.available) {
    assert.equal(res.price, 146); // basisprijs, ONgewijzigd — dit is exact de bug die deze hotfix voorkomt
    assert.equal(res.source, "distance_tariff");
  }
  const computed = assertComputed(shadow);
  assert.equal(computed.classification, "peripheral");
  assert.equal(computed.qualifies, true); // de pure classificatie/berekening blijft ongewijzigd (deadhead-shadow.ts niet aangeraakt)
  assert.equal(computed.eligibleForActivation, true); // ook ongewijzigd — dit ALLEEN is niet meer genoeg
  assert.equal(computed.zoneEligible, false); // de nieuwe gate: blokkeert activering
  assert.equal(computed.applied, false);
  assert.equal(computed.basePrice, 146);
  assert.equal(computed.finalPrice, 146);
});

// ── Bewijs voor meerdere, met opzet NIET-goedgekeurde perifere steden ────────
// Elk van deze steden is een bestaande, herkenbare, niet-high-demand
// bestemming >80km — precies het soort bestemming dat vóór de hotfix per
// ongeluk activeerde. Geen van deze steden staat in de allowlist
// (pricing_deadhead_eligible_zones bevat uitsluitend eindhoven/roermond).
const NON_ZONE_PERIPHERAL_CITIES: Array<{ label: string; cityId: string; km: number; min: number }> = [
  { label: "Maastricht", cityId: "maastricht-city-id", km: 197, min: 137 },
  { label: "Arnhem", cityId: "arnhem-city-id", km: 100, min: 70 },
  { label: "Groningen", cityId: "groningen-city-id", km: 190, min: 120 },
  { label: "Breda", cityId: "breda-city-id", km: 105, min: 75 },
];

for (const city of NON_ZONE_PERIPHERAL_CITIES) {
  test(`GEEN ACTIVATIE — ${city.label} (bekende, perifere, niet-goedgekeurde stad): basisprijs blijft leidend`, async () => {
    let shadow: ShadowLogEntry | null = null;
    const dropoff = {
      id: `${city.label}-id`,
      slug: city.label.toLowerCase(),
      name: city.label,
      active: true,
      location_type: "city" as const,
      city_id: city.cityId,
    };
    const basePrice = Math.round(Math.max(30, 10.75 + city.km * 0.65 + city.min * 1.1));
    const res = await resolveQuoteWith(
      input(),
      makeDeps({
        findLocation: async (raw) => (raw === "dropoff" ? dropoff : null),
        getRoute: async () => ({ distanceKm: city.km, durationMin: city.min }),
        // Bewijst dat zelfs als de zone-eligible-zones-loader WÉL Eindhoven/Roermond
        // teruggeeft (realistische productie-allowlist), deze stad er terecht buiten valt.
        loadDeadheadEligibleZoneCityIds: async () => new Set(["eindhoven-city-id", "roermond-city-id"]),
        onShadow: (e) => {
          shadow = e;
        },
      })
    );
    assert.equal(res.available, true);
    if (res.available) assert.equal(res.price, basePrice);
    const computed = assertComputed(shadow);
    assert.equal(computed.classification, "peripheral");
    assert.equal(computed.zoneEligible, false);
    assert.equal(computed.applied, false);
    assert.equal(computed.finalPrice, basePrice);
  });
}

// ── Bewijs: ontbrekende zone-allowlist-dependency zelf → fail-closed ────────
test("ontbrekende loadDeadheadEligibleZoneCityIds-dependency → shadow volledig overgeslagen (geen log), price ongewijzigd", async () => {
  let shadowCalled = false;
  const dropoff = { id: "roermond-id", slug: "roermond", name: "Roermond", active: true, location_type: "city" as const, city_id: "roermond-city-id" };
  const res = await resolveQuoteWith(
    input(),
    makeDeps({
      findLocation: async (raw) => (raw === "dropoff" ? dropoff : null),
      getRoute: async () => ({ distanceKm: 90, durationMin: 70 }),
      loadDeadheadEligibleZoneCityIds: undefined,
      onShadow: () => {
        shadowCalled = true;
      },
    })
  );
  assert.equal(res.available, true);
  if (res.available) assert.equal(res.price, 146); // basisprijs, ongewijzigd
  assert.equal(shadowCalled, false, "zonder deze dependency mag zelfs de skip-log niet lopen — zelfde patroon als de bestaande twee deps");
});

test("zone-eligible-zones-loader gooit → zelfde bescherming (reason load_error), price ongewijzigd", async () => {
  let shadow: ShadowLogEntry | null = null;
  const res = await resolveQuoteWith(
    input(),
    makeDeps({
      loadDeadheadEligibleZoneCityIds: async () => {
        throw new Error("connection reset");
      },
      getRoute: async () => ({ distanceKm: 104.8, durationMin: 72 }),
      onShadow: (e) => {
        shadow = e;
      },
    })
  );
  assert.equal(res.available, true);
  if (res.available) assert.equal(res.price, 158);
  assert.deepEqual(shadow, { shadowSkipped: true, reason: "load_error", basePrice: 158, finalPrice: 158 });
});

// RETOURSEMANTIEK (expliciet vastgelegd, audit 2026-08-12):
// De deadhead-aanpassing wordt ÉÉNMAAL berekend, in de enkele-reisprijs
// (single). Er is geen apart retour-pad: het bestaande, ongewijzigde
// retourbeleid verdubbelt simpelweg de VOLLEDIGE enkele-reisprijs
// (returnPrice = single * 2, exact zoals vóór deadhead-activering al het
// geval was voor de basisprijs). Omdat `single` nu de deadhead-aangepaste
// prijs kan zijn, wordt de deadheadcomponent daardoor MEE verdubbeld voor het
// retourproduct — dat is een rekenkundig gevolg van het bestaande "2× enkele
// prijs"-beleid, geen bug en geen losse toeslag: er vindt precies ÉÉN
// classificatie en ÉÉN computeShadowDeadhead-aanroep plaats per offerte,
// ongeacht returnTrip. Dit gedrag is bewust ongewijzigd gelaten (zelfde
// aanname als de bestaande "Retour = 2× de enkele rit"-commentaar in
// tryDistanceTariff) en niet stilzwijgend "gecorrigeerd" naar een aparte
// retour-deadheadregel — dat zou een nieuwe, hier niet aangevraagde
// commerciële beslissing zijn.
test("ACTIVATIE + retour: deadhead loopt éénmaal door de enkele-reisprijs; bestaand 2×-beleid verdubbelt ook die component; geen tweede classificatie/berekening", async () => {
  let classifyCount = 0;
  const dropoff = { id: "roermond-id", slug: "roermond", name: "Roermond", active: true, location_type: "city" as const, city_id: "roermond-city-id" };
  const res = await resolveQuoteWith(
    input({ returnTrip: true }),
    makeDeps({
      findLocation: async (raw) => (raw === "dropoff" ? dropoff : null),
      getRoute: async () => ({ distanceKm: 90, durationMin: 70 }),
      loadDeadheadEligibleZoneCityIds: async () => new Set(["roermond-city-id"]),
      loadDeadheadConfig: async () => {
        classifyCount += 1; // proxy: precies één keer geladen/berekend per offerte
        return CONFIG;
      },
    })
  );
  assert.equal(res.available, true);
  if (res.available) {
    assert.equal(res.singlePrice, 181); // de éénmalig geactiveerde enkele prijs (zie test hierboven)
    assert.equal(res.returnPrice, 362); // = 2 × 181 (bestaand beleid) — deadheadcomponent wordt dus MEE verdubbeld
    assert.equal(res.returnApplied, true);
    assert.equal(res.price, 362);
  }
  assert.equal(classifyCount, 1, "classificatie/deadhead-berekening mag maar éénmaal draaien, niet apart voor de retourleg");
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
  assert.equal(computed.applied, false);
  assert.equal(computed.basePrice, 218);
  assert.equal(computed.finalPrice, 218);
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
  assert.deepEqual(shadow, { shadowSkipped: true, reason: "missing_config", basePrice: 158, finalPrice: 158 });
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
  assert.deepEqual(shadow, { shadowSkipped: true, reason: "load_error", basePrice: 158, finalPrice: 158 });
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
  assert.deepEqual(shadow, { shadowSkipped: true, reason: "load_error", basePrice: 158, finalPrice: 158 });
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
  assert.deepEqual(shadow, { shadowSkipped: true, reason: "timeout", basePrice: 158, finalPrice: 158 });
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
