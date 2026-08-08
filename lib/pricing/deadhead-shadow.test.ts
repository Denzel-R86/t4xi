// Pure unit tests voor het deadhead-shadowmodel (SHADOW-ONLY). Vaste, niet aan
// live verkeer gebonden fixtures. Bewijst: fail-closed classificatie, het
// analysis-only kandidaatpad voor "unknown", en dat qualifies/eligibleForActivation
// uitsluitend true zijn op het bewezen "peripheral"-pad.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyDestination,
  computeShadowDeadhead,
  type DeadheadConfig,
} from "@/lib/pricing/deadhead-shadow";

const CONFIG: DeadheadConfig = { minDistanceKm: 80, deadheadFactor: 0.6, maxDeadheadKm: 80 };

const HIGH_DEMAND = {
  highDemandLocationIds: new Set(["schiphol-airport-id"]),
  highDemandCityIds: new Set(["amsterdam-city-id"]),
};

// ── classifyDestination — fail-closed ────────────────────────────────────────

test("classifyDestination: dropoff null → altijd unknown, nooit automatisch perifeer", () => {
  const c = classifyDestination({ dropoff: null, ...HIGH_DEMAND });
  assert.deepEqual(c, { classification: "unknown", source: "unresolved", confidence: 0 });
});

test("classifyDestination: bekende locatie-id in high-demand-set → high_demand", () => {
  const c = classifyDestination({
    dropoff: { id: "schiphol-airport-id", city_id: null },
    ...HIGH_DEMAND,
  });
  assert.deepEqual(c, { classification: "high_demand", source: "location_row", confidence: 1 });
});

test("classifyDestination: bekende stad-id in high-demand-set → high_demand", () => {
  const c = classifyDestination({
    dropoff: { id: "amsterdam-centrum-id", city_id: "amsterdam-city-id" },
    ...HIGH_DEMAND,
  });
  assert.deepEqual(c, { classification: "high_demand", source: "location_row", confidence: 1 });
});

test("classifyDestination: bekende locatie, geen match → peripheral", () => {
  const c = classifyDestination({
    dropoff: { id: "roermond-id", city_id: "roermond-city-id" },
    ...HIGH_DEMAND,
  });
  assert.deepEqual(c, { classification: "peripheral", source: "location_row", confidence: 1 });
});

// ── computeShadowDeadhead — 5 verplichte gevallen ────────────────────────────

test("1. unknown, afstand > 80km → analysis-only kandidaat berekend, nooit qualifies/eligible", () => {
  // Laren → Eindhoven Airport: 104.8 km / 72 min (op 2026-08-09 vastgelegd tegen live API).
  const classification = classifyDestination({ dropoff: null, ...HIGH_DEMAND });
  const r = computeShadowDeadhead({ distanceKm: 104.8, durationMin: 72, classification, config: CONFIG });

  assert.equal(r.classification, "unknown");
  assert.equal(r.classificationSource, "unresolved");
  assert.equal(r.classificationConfidence, 0);
  assert.equal(r.qualifies, false);
  assert.equal(r.eligibleForActivation, false);
  assert.equal(r.exclusionReason, "unresolved_destination");
  assert.equal(r.analysisOnly, true);

  // Normaal pad blijft leeg — dit is uitdrukkelijk GEEN bewezen perifere route.
  assert.equal(r.deadheadKm, null);
  assert.equal(r.effectiveKm, null);
  assert.equal(r.shadowPrice, null);
  assert.equal(r.deltaFromLive, null);

  // candidateDeadheadKm = min(104.8 * 0.6, 80) = 62.88; candidateEffectiveKm = 167.68
  // (IEEE754: 104.8*0.6 rondt binnen machine-epsilon af, vandaar de tolerantie)
  assert.ok(Math.abs(r.candidateDeadheadKm! - 62.88) < 1e-9, `verwacht ~62.88, kreeg ${r.candidateDeadheadKm}`);
  assert.ok(Math.abs(r.candidateEffectiveKm! - 167.68) < 1e-9, `verwacht ~167.68, kreeg ${r.candidateEffectiveKm}`);
  // raw = 10.75 + 167.68*0.65 + 72*1.10 = 198.942 → afgerond €199
  assert.equal(r.candidateShadowPrice, 199);
  // live price voor 104.8km/72min = 158 (10.75+68.12+79.2=158.07→158) → delta = 41
  assert.equal(r.candidateDeltaFromLive, 41);
});

test("2. unknown, afstand ≤ 80km → geen kandidaat", () => {
  const classification = classifyDestination({ dropoff: null, ...HIGH_DEMAND });
  const r = computeShadowDeadhead({ distanceKm: 60, durationMin: 50, classification, config: CONFIG });

  assert.equal(r.classification, "unknown");
  assert.equal(r.qualifies, false);
  assert.equal(r.eligibleForActivation, false);
  assert.equal(r.exclusionReason, "unresolved_destination");
  assert.equal(r.analysisOnly, false);
  assert.equal(r.candidateDeadheadKm, null);
  assert.equal(r.candidateEffectiveKm, null);
  assert.equal(r.candidateShadowPrice, null);
  assert.equal(r.candidateDeltaFromLive, null);
});

test("3. high_demand, afstand > 80km → geen kandidaat, geen normale berekening", () => {
  const classification = classifyDestination({
    dropoff: { id: "schiphol-airport-id", city_id: null },
    ...HIGH_DEMAND,
  });
  const r = computeShadowDeadhead({ distanceKm: 150, durationMin: 100, classification, config: CONFIG });

  assert.equal(r.classification, "high_demand");
  assert.equal(r.qualifies, false);
  assert.equal(r.eligibleForActivation, false);
  assert.equal(r.exclusionReason, "high_demand_zone");
  assert.equal(r.analysisOnly, false);
  assert.equal(r.deadheadKm, null);
  assert.equal(r.shadowPrice, null);
  assert.equal(r.candidateDeadheadKm, null);
  assert.equal(r.candidateShadowPrice, null);
});

test("4. peripheral, afstand > 80km → normale shadowPrice-berekening, qualifies/eligible true", () => {
  const classification = classifyDestination({
    dropoff: { id: "roermond-id", city_id: "roermond-city-id" },
    ...HIGH_DEMAND,
  });
  const r = computeShadowDeadhead({ distanceKm: 90, durationMin: 70, classification, config: CONFIG });

  assert.equal(r.classification, "peripheral");
  assert.equal(r.qualifies, true);
  assert.equal(r.eligibleForActivation, true);
  assert.equal(r.exclusionReason, null);
  assert.equal(r.analysisOnly, false);

  // deadheadKm = min(90*0.6, 80) = 54; effectiveKm = 144
  assert.equal(r.deadheadKm, 54);
  assert.equal(r.effectiveKm, 144);
  // raw = 10.75 + 144*0.65 + 70*1.10 = 181.35 → afgerond €181
  assert.equal(r.shadowPrice, 181);
  // live price voor 90km/70min = round(max(30, 10.75+58.5+77=146.25)) = 146 → delta = 35
  assert.equal(r.deltaFromLive, 35);

  // Kandidaatpad blijft leeg — dit is het bewezen pad, geen analysis-only kandidaat.
  assert.equal(r.candidateDeadheadKm, null);
  assert.equal(r.candidateShadowPrice, null);
});

test("peripheral, afstand exact op de drempel (niet erboven) → nog niet qualifies", () => {
  const classification = classifyDestination({
    dropoff: { id: "roermond-id", city_id: "roermond-city-id" },
    ...HIGH_DEMAND,
  });
  const r = computeShadowDeadhead({ distanceKm: 80, durationMin: 60, classification, config: CONFIG });
  assert.equal(r.qualifies, false);
  assert.equal(r.eligibleForActivation, false);
  assert.equal(r.exclusionReason, "below_distance_threshold");
});

test("5. geen enkele variant beïnvloedt de live prijs — computeShadowDeadhead raakt priceFromDistance niet aan", async () => {
  // computeShadowDeadhead heeft geen toegang tot en geen effect op priceFromDistance;
  // dit wordt end-to-end (via resolveQuoteWith) bewezen in distance-tariff-regression.test.ts.
  // Hier: bewijs dat de module zelf geen mutatie/side effect op de invoer heeft.
  const classification = classifyDestination({ dropoff: null, ...HIGH_DEMAND });
  const input = { distanceKm: 104.8, durationMin: 72 };
  const before = { ...input };
  computeShadowDeadhead({ ...input, classification, config: CONFIG });
  assert.deepEqual(input, before);
});
