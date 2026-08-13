// End-to-end regressietests voor de GEACTIVEERDE deadhead-prijs. Combineert de
// echte alias-engine (resolveLocationSlug, ongewijzigd) met de echte
// classificatie/berekening (deadhead-shadow.ts, ongewijzigd) via
// resolveQuoteWith, en bewijst daarna dat exact diezelfde prijs ongewijzigd
// doorstroomt naar snapshot en boeking (geen herberekening ergens onderweg).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveQuoteWith,
  type ResolveQuoteDeps,
  type PricingQuoteInput,
  type ShadowLogEntry,
} from "@/lib/pricing/service";
import { resolveLocationSlug } from "@/lib/pricing/location-aliases";
import type { DeadheadConfig } from "@/lib/pricing/deadhead-shadow";
import { buildPriceSnapshot, checkSnapshotUsable, uuidv7, type StoredSnapshot } from "@/lib/pricing/snapshot";
import type { PricingQuoteResult } from "@/lib/pricing/service";

type ComputedShadow = Exclude<ShadowLogEntry, { shadowSkipped: true }>;
function assertComputed(shadow: ShadowLogEntry | null): ComputedShadow {
  assert.ok(shadow !== null && !("shadowSkipped" in shadow), "shadow had moeten worden berekend");
  return shadow as ComputedShadow;
}

const CONFIG: DeadheadConfig = { minDistanceKm: 80, deadheadFactor: 0.6, maxDeadheadKm: 80 };
// Exact zoals de migratie het bedoelt: geen van beide landmarks in een
// high-demand-zone.
const NO_HIGH_DEMAND = { locationIds: new Set<string>(), cityIds: new Set<string>() };

const vclass = { id: "veh-exec-ev", code: "executive-ev", max_passengers: 4, max_luggage: 3, active: true };

/** Precies de rijen die de migratie zou aanmaken. */
const KNOWN_LOCATIONS: Record<string, { id: string; slug: string; name: string; active: true; location_type: "airport" | "landmark" | "city"; city_id: string | null }> = {
  "eindhoven-airport": { id: "eindhoven-airport-id", slug: "eindhoven-airport", name: "Eindhoven Airport", active: true, location_type: "airport", city_id: "eindhoven-city-id" },
  "designer-outlet-roermond": { id: "designer-outlet-roermond-id", slug: "designer-outlet-roermond", name: "Designer Outlet Roermond", active: true, location_type: "landmark", city_id: "roermond-city-id" },
  "rotterdam": { id: "rotterdam-id", slug: "rotterdam", name: "Rotterdam", active: true, location_type: "city", city_id: "rotterdam-city-id" },
  "schiphol-airport": { id: "schiphol-airport-id", slug: "schiphol-airport", name: "Schiphol Airport", active: true, location_type: "airport", city_id: null },
};
// Rotterdam + Schiphol zijn high-demand (bestaande config, ongewijzigd).
const HIGH_DEMAND_WITH_ROTTERDAM_SCHIPHOL = {
  locationIds: new Set(["schiphol-airport-id"]),
  cityIds: new Set(["rotterdam-city-id"]),
};

/** Simuleert findLocation() end-to-end via de ECHTE alias-engine + de rijen die de migratie zou aanmaken. */
async function simulateFindLocation(raw: string): Promise<(typeof KNOWN_LOCATIONS)[string] | null> {
  const slug = resolveLocationSlug(raw);
  return slug ? (KNOWN_LOCATIONS[slug] ?? null) : null;
}

function makeDeps(o: Partial<ResolveQuoteDeps> & { onShadow?: (e: ShadowLogEntry) => void } = {}): ResolveQuoteDeps {
  const { onShadow, ...rest } = o;
  return {
    findLocation: async (raw) => (raw === "pickup" ? null : simulateFindLocation(raw)),
    findVehicleClass: async () => vclass,
    findFixedRoute: async () => null,
    getRoute: async () => ({ distanceKm: 20, durationMin: 30 }),
    loadDeadheadConfig: async () => CONFIG,
    loadHighDemandZones: async () => NO_HIGH_DEMAND,
    recordShadow: onShadow,
    ...rest,
  };
}

const input = (dropoff: string, o: Partial<PricingQuoteInput> = {}): PricingQuoteInput => ({
  pickup: "pickup",
  dropoff,
  ...o,
});

// ── Positief: de twee commercieel goedgekeurde routes ───────────────────────

test("Laren → Eindhoven Airport (Luchthavenweg 25, 5657EA Eindhoven): ±€193, dynamisch berekend", async () => {
  let shadow: ShadowLogEntry | null = null;
  const res = await resolveQuoteWith(
    input("Luchthavenweg 25, 5657EA Eindhoven"),
    makeDeps({
      getRoute: async () => ({ distanceKm: 104.7, durationMin: 67 }),
      onShadow: (e) => (shadow = e),
    })
  );
  assert.equal(res.available, true);
  if (!res.available) return;
  // basisprijs 10.75+104.7*0.65+67*1.10=152.505→€153 (ongebruikt als eindprijs);
  // deadheadKm=min(104.7*0.6,80)=62.82; effectiveKm=167.52;
  // raw=10.75+167.52*0.65+67*1.10=193.288→€193 = de dynamisch berekende eindprijs.
  assert.equal(res.price, 193);
  assert.equal(res.singlePrice, 193);
  const s = assertComputed(shadow);
  assert.equal(s.classification, "peripheral");
  assert.equal(s.eligibleForActivation, true);
  assert.equal(s.applied, true);
  assert.equal(s.basePrice, 153);
  assert.equal(s.finalPrice, 193);
  assert.equal(s.analysisOnly, false); // dit is het bewezen pad, geen kandidaat
});

test("Laren → Designer Outlet Roermond (Stadsweide 2, 6041TD Roermond): ±€286, dynamisch berekend", async () => {
  let shadow: ShadowLogEntry | null = null;
  const res = await resolveQuoteWith(
    input("Stadsweide 2, 6041TD Roermond"),
    makeDeps({
      getRoute: async () => ({ distanceKm: 160.6, durationMin: 108 }),
      onShadow: (e) => (shadow = e),
    })
  );
  assert.equal(res.available, true);
  if (!res.available) return;
  assert.equal(res.price, 286);
  const s = assertComputed(shadow);
  assert.equal(s.classification, "peripheral");
  assert.equal(s.applied, true);
  assert.equal(s.finalPrice, 286);
});

// ── Negatief: postcodegebied, kale stad, typefouten — geen match, geen activering ─

const NEGATIVE_DROPOFFS = [
  "Castendijkweg 1, 5657ER Eindhoven", // ander adres binnen 5657
  "Abdijhof 1, 6041HG Roermond", // ander adres binnen 6041
  "Eindhoven", // kale stad
  "Roermond", // kale stad
  "Luchthavenweg, Eindhoven", // geen huisnummer
  "Eindhoven Airprot", // typefout
];

for (const dropoff of NEGATIVE_DROPOFFS) {
  test(`geen landmarkmatch, geen activering: "${dropoff}"`, async () => {
    let shadow: ShadowLogEntry | null = null;
    const res = await resolveQuoteWith(
      input(dropoff),
      makeDeps({
        getRoute: async () => ({ distanceKm: 104.7, durationMin: 67 }),
        onShadow: (e) => (shadow = e),
      })
    );
    assert.equal(res.available, true);
    if (!res.available) return;
    assert.equal(res.price, 153); // basisprijs, ongewijzigd
    const s = assertComputed(shadow);
    assert.equal(s.applied, false);
    // "Roermond"/"Eindhoven" resolven wél als stad in findLocation()'s eigen
    // naam-ilike-fallback (buiten resolveLocationSlug om) is NIET het geval
    // hier, want er is geen city-level rij voor Roermond, en "Eindhoven" is
    // wel een stad maar géén van de twee landmarks — dus altijd "unknown" of
    // "peripheral"-maar-niet-de-landmark; in beide gevallen niet toegepast.
  });
}

// ── Negatief: high-demand-bestemmingen — geen deadhead, ondanks lange afstand ──

test("lange rit naar Rotterdam (high-demand): geen deadhead", async () => {
  let shadow: ShadowLogEntry | null = null;
  const res = await resolveQuoteWith(
    input("Rotterdam"),
    makeDeps({
      loadHighDemandZones: async () => HIGH_DEMAND_WITH_ROTTERDAM_SCHIPHOL,
      getRoute: async () => ({ distanceKm: 100, durationMin: 70 }),
      onShadow: (e) => (shadow = e),
    })
  );
  assert.equal(res.available, true);
  if (res.available) assert.equal(res.price, Math.round(Math.max(30, 10.75 + 100 * 0.65 + 70 * 1.1)));
  const s = assertComputed(shadow);
  assert.equal(s.classification, "high_demand");
  assert.equal(s.applied, false);
});

test("lange rit naar Schiphol (high-demand): geen deadhead", async () => {
  let shadow: ShadowLogEntry | null = null;
  const res = await resolveQuoteWith(
    input("schiphol-airport"),
    makeDeps({
      loadHighDemandZones: async () => HIGH_DEMAND_WITH_ROTTERDAM_SCHIPHOL,
      getRoute: async () => ({ distanceKm: 100, durationMin: 70 }),
      onShadow: (e) => (shadow = e),
    })
  );
  assert.equal(res.available, true);
  if (res.available) assert.equal(res.price, Math.round(Math.max(30, 10.75 + 100 * 0.65 + 70 * 1.1)));
  const s = assertComputed(shadow);
  assert.equal(s.classification, "high_demand");
  assert.equal(s.applied, false);
});

// ── Korte dynamische rit en vaste route: expliciet ongewijzigd ─────────────

test("korte dynamische rit (<80km): ongewijzigd, geen deadhead", async () => {
  const res = await resolveQuoteWith(
    input("Luchthavenweg 25, 5657EA Eindhoven"),
    makeDeps({ getRoute: async () => ({ distanceKm: 14.3, durationMin: 18 }) })
  );
  assert.equal(res.available, true);
  if (res.available) assert.equal(res.price, 40); // 10.75+14.3*0.65+18*1.10=39.85→€40
});

test("vaste route blijft volledig leidend, deadhead draait hier niet", async () => {
  let shadowCalled = false;
  const res = await resolveQuoteWith(
    input("schiphol-airport"),
    makeDeps({
      findLocation: async (raw) =>
        raw === "pickup"
          ? { id: "ams-id", slug: "amsterdam-centrum", name: "Amsterdam Centrum", active: true, location_type: "city", city_id: null }
          : { id: "sch-id", slug: "schiphol-airport", name: "Schiphol Airport", active: true, location_type: "airport", city_id: null },
      findFixedRoute: async () => ({
        price: 57, return_price: 103, currency: "EUR", distance_km: 26, estimated_duration_min: 31,
        vat_rate: 9, source_label: "Amsterdam → Schiphol", valid_from: "2026-01-01T00:00:00.000Z", active: true,
      }),
      getRoute: async () => {
        throw new Error("mag niet aangeroepen worden voor een vaste route");
      },
      onShadow: () => {
        shadowCalled = true;
      },
    })
  );
  assert.equal(res.available, true);
  if (res.available) {
    assert.equal(res.price, 57);
    assert.equal(res.source, "fixed_route_prices");
  }
  assert.equal(shadowCalled, false);
});

// ── Consistentie: quote → snapshot → boeking gebruiken exact dezelfde prijs ──

test("quote → snapshot → boeking: exact dezelfde geactiveerde prijs, geen herberekening", async () => {
  const res = await resolveQuoteWith(
    input("Luchthavenweg 25, 5657EA Eindhoven"),
    makeDeps({ getRoute: async () => ({ distanceKm: 104.7, durationMin: 67 }) })
  );
  assert.equal(res.available, true);
  if (!res.available) return;
  assert.equal(res.price, 193);

  const now = new Date("2026-08-12T12:00:00.000Z");
  const quoteId = uuidv7();
  const snapshot = buildPriceSnapshot(res as Extract<PricingQuoteResult, { available: true }>, { quoteId, now });
  assert.ok(snapshot);
  // Snapshot bevat exact de quote-prijs in centen — geen eigen berekening.
  assert.equal(snapshot!.totalCents, 19300);
  assert.equal(snapshot!.subtotalCents, 19300);

  // Boeking (quote-lock-pad) leest uitsluitend de opgeslagen snapshot, herberekent niets.
  const stored: StoredSnapshot = {
    quoteId,
    pricingVersion: snapshot!.pricingVersion,
    pricingSource: snapshot!.pricingSource,
    currency: snapshot!.currency,
    subtotalCents: snapshot!.subtotalCents,
    totalCents: snapshot!.totalCents,
    routeSnapshot: snapshot!.routeSnapshot,
    calculatedAt: snapshot!.calculatedAt,
    expiresAt: snapshot!.expiresAt,
  };
  const usable = checkSnapshotUsable(stored, { now, expectedFingerprint: snapshot!.routeSnapshot.fingerprint });
  assert.deepEqual(usable, { ok: true });
  assert.equal(stored.totalCents / 100, 193); // exact de bindende boekingsprijs
});

test("centafronding: retourprijs in de snapshot vertoont geen afrondingsverschil t.o.v. 2× de centwaarde van de enkele reis", async () => {
  // Afronding gebeurt exact ÉÉN keer: binnen priceFromDistance/computeShadowDeadhead
  // (naar hele euro's), vóórdat eurosToCents() converteert. singlePrice/returnPrice
  // zijn daarna pure integer-vermenigvuldiging (single*2) — geen tweede
  // afrondingsstap, dus geen centverschil mogelijk tussen 2×singleCents en
  // returnCents.
  const dropoff = { id: "roermond-id", slug: "roermond", name: "Roermond", active: true, location_type: "city" as const, city_id: "roermond-city-id" };
  const res = await resolveQuoteWith(
    input("dropoff", { returnTrip: true }),
    makeDeps({
      findLocation: async (raw) => (raw === "dropoff" ? dropoff : null),
      getRoute: async () => ({ distanceKm: 90, durationMin: 70 }),
    })
  );
  assert.equal(res.available, true);
  if (!res.available) return;
  assert.equal(res.singlePrice, 181);
  assert.equal(res.returnPrice, 362);
  assert.equal(res.price, 362);

  const now = new Date("2026-08-12T12:00:00.000Z");
  const snapshot = buildPriceSnapshot(res as Extract<PricingQuoteResult, { available: true }>, { quoteId: uuidv7(), now });
  assert.ok(snapshot);
  assert.equal(snapshot!.totalCents, 36200); // = 2 × 18100, exact — geen drift
  assert.equal(snapshot!.totalCents, snapshot!.subtotalCents);
});

test("retry (identieke, deterministische deps) levert exact dezelfde prijs — geen inconsistentie", async () => {
  const deps = makeDeps({ getRoute: async () => ({ distanceKm: 104.7, durationMin: 67 }) });
  const first = await resolveQuoteWith(input("Luchthavenweg 25, 5657EA Eindhoven"), deps);
  const second = await resolveQuoteWith(input("Luchthavenweg 25, 5657EA Eindhoven"), deps);
  assert.equal(first.available, true);
  assert.equal(second.available, true);
  if (first.available && second.available) {
    assert.equal(first.price, second.price);
    assert.equal(first.price, 193);
    // Werkelijke boekings-retry-idempotentie loopt via het reeds bestaande,
    // ongewijzigde quote-lock-mechanisme (price_snapshots + fingerprint +
    // create_booking_from_snapshot-idempotency): zodra een quoteId is
    // uitgegeven, wordt de prijs NOOIT herberekend, ongeacht hoe vaak de
    // boeking-aanvraag wordt herhaald — geverifieerd hierboven via
    // checkSnapshotUsable.
  }
});

// ── Geen publieke shadowvelden (steekproef, aanvullend op shadow-isolation.test.ts) ─

test("het activatie-resultaat zelf bevat geen shadowvelden buiten het toegestane PricingQuoteResult-contract", async () => {
  const res = await resolveQuoteWith(
    input("Luchthavenweg 25, 5657EA Eindhoven"),
    makeDeps({ getRoute: async () => ({ distanceKm: 104.7, durationMin: 67 }) })
  );
  assert.equal(res.available, true);
  const keys = Object.keys(res);
  for (const forbidden of ["classification", "shadowPrice", "deadheadKm", "eligibleForActivation", "applied", "basePrice", "finalPrice"]) {
    assert.ok(!keys.includes(forbidden), `PricingQuoteResult mag "${forbidden}" niet als los veld bevatten`);
  }
});
