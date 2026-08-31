// Tests voor de Phase 6.3-meetlaag: aggregatie, poorten en eindoordeel.
//
// De kern die hier bewaakt wordt is niet "rekent hij goed op", maar: kan een
// ontbrekende meting NOOIT als groen licht worden gelezen, en leidt bewezen
// schade ALTIJD tot NO-GO.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  aggregateShadowObservations,
  cappedFeeCents,
  compareCapPolicies,
  simulateCapPolicy,
  DEFAULT_EVIDENCE,
  NO_EXTERNAL_EVIDENCE,
  type ExternalEvidence,
  type ShadowObservation,
} from "@/lib/pricing/event-shadow-report";
import { evaluateGates, formatShadowReport, verdictOf } from "@/lib/pricing/event-shadow-gates";

let seq = 0;
function obs(o: Partial<ShadowObservation> = {}): ShadowObservation {
  seq += 1;
  return {
    id: `obs-${seq}`,
    observedAt: "2026-10-24T22:00:00.000Z",
    mode: "shadow",
    quoteId: `q-${seq}`,
    leg: "outbound",
    pricingSource: "fixed_route_prices",
    matched: false,
    impactLevel: "none",
    potentialFeeCents: 0,
    configuredFeeCents: null,
    maxUpliftPct: null,
    baselineSubtotalCents: 10000,
    eventSlugs: [],
    windowIds: [],
    zoneTypes: [],
    matchSides: [],
    concurrentEventCount: 0,
    upgradeApplied: false,
    cappedByMaxLevel: false,
    ...o,
  };
}

function match(o: Partial<ShadowObservation> = {}): ShadowObservation {
  return obs({
    matched: true,
    impactLevel: "high",
    potentialFeeCents: 2500,
    eventSlugs: ["ade-2026"],
    windowIds: ["win-1"],
    zoneTypes: ["location_slug"],
    matchSides: ["pickup"],
    concurrentEventCount: 1,
    ...o,
  });
}

/** Alles gemeten en in orde — de enige situatie waarin GO mogelijk is. */
const FULL_EVIDENCE: ExternalEvidence = {
  runtimeErrors: 0,
  eventAdjustmentsOnShadowSnapshots: 0,
  snapshotUpdateRevoked: true,
  prohibitedPiiColumns: 0,
  manualReview: null,
};

// ── Aggregatie ───────────────────────────────────────────────────────────────

test("lege dataset levert nulwaarden en geen deling door nul", () => {
  const m = aggregateShadowObservations([]);
  assert.equal(m.evaluatedLegs, 0);
  assert.equal(m.matchedLegs, 0);
  assert.equal(m.matchRate, null);
  assert.equal(m.fee.averageCents, 0);
  assert.equal(m.fee.medianCents, 0);
  assert.equal(m.observationDays, 0);
  assert.deepEqual(m.malformed, []);
});

test("alleen non-matches: matchratio 0, geen tariefstatistiek", () => {
  const m = aggregateShadowObservations([obs(), obs(), obs()]);
  assert.equal(m.evaluatedLegs, 3);
  assert.equal(m.matchedLegs, 0);
  assert.equal(m.matchRate, 0);
  assert.equal(m.fee.count, 0);
  assert.deepEqual(m.malformed, []);
});

test("matches worden per evenement, zonesoort, kant en niveau geteld", () => {
  const m = aggregateShadowObservations([match(), match({ impactLevel: "very_high", potentialFeeCents: 4000 }), obs()]);
  assert.equal(m.matchedLegs, 2);
  assert.equal(m.matchRate, 2 / 3);
  assert.equal(m.byEvent.get("ade-2026"), 2);
  assert.equal(m.byZoneType.get("location_slug"), 2);
  assert.equal(m.byMatchSide.get("pickup"), 2);
  assert.equal(m.byImpactLevel.get("high"), 1);
  assert.equal(m.byImpactLevel.get("very_high"), 1);
  assert.equal(m.fee.totalCents, 6500);
  assert.equal(m.fee.averageCents, 3250);
  assert.equal(m.fee.maxCents, 4000);
});

test("gemengde prijsbronnen worden apart geteld", () => {
  const m = aggregateShadowObservations([
    match(),
    obs(),
    match({ pricingSource: "distance_tariff" }),
    obs({ pricingSource: "distance_tariff" }),
  ]);
  assert.deepEqual(m.byPricingSource.get("fixed_route_prices"), { evaluated: 2, matched: 1 });
  assert.deepEqual(m.byPricingSource.get("distance_tariff"), { evaluated: 2, matched: 1 });
});

test("heen- en retourdelen worden apart geteld", () => {
  const m = aggregateShadowObservations([match(), obs({ leg: "return" })]);
  assert.deepEqual(m.byLeg.get("outbound"), { evaluated: 1, matched: 1 });
  assert.deepEqual(m.byLeg.get("return"), { evaluated: 1, matched: 0 });
});

test("dubbele quote/ritdeel-combinatie wordt herkend", () => {
  const m = aggregateShadowObservations([match({ quoteId: "same" }), match({ quoteId: "same" })]);
  assert.equal(m.duplicates.length, 1);
  assert.ok(m.duplicates[0]!.includes("same / outbound"));
});

test("dezelfde quote met verschillende ritdelen is GEEN dubbele", () => {
  const m = aggregateShadowObservations([match({ quoteId: "q" }), obs({ quoteId: "q", leg: "return" })]);
  assert.deepEqual(m.duplicates, []);
});

test("inconsistente observaties worden als malformed gemeld", () => {
  const m = aggregateShadowObservations([
    obs({ matched: true, eventSlugs: [], impactLevel: "high", potentialFeeCents: 2500 }),
    obs({ matched: false, potentialFeeCents: 500 }),
    obs({ leg: "middle" }),
    obs({ pricingSource: null }),
  ]);
  assert.equal(m.malformed.length, 4);
});

test("match met €0 tarief wordt apart geteld", () => {
  const m = aggregateShadowObservations([match({ potentialFeeCents: 0 })]);
  assert.equal(m.zeroFeeMatches, 1);
});

test("extreem hoge toeslag wordt als economisch signaal gemarkeerd", () => {
  const m = aggregateShadowObservations([match({ potentialFeeCents: 9000, baselineSubtotalCents: 100000 })]);
  assert.ok(m.economicOutliers.some((s) => s.includes("boven de absolute grens")));
  assert.equal(m.absoluteFeeOutliers, 1);
});

test("extreem hoog opslagpercentage valt in de faalband", () => {
  const m = aggregateShadowObservations([match({ potentialFeeCents: 4000, baselineSubtotalCents: 5000 })]);
  assert.equal(m.upliftBands.fail, 1);
  assert.ok(m.economicOutliers.some((s) => s.includes("boven 50%")));
});

test("opslag tussen 40 en 50 procent komt in de beoordelingsband, niet in de faalband", () => {
  // €40 op €90 = 44,4%
  const m = aggregateShadowObservations([match({ potentialFeeCents: 4000, baselineSubtotalCents: 9000 })]);
  assert.deepEqual(m.upliftBands, { ok: 0, review: 1, fail: 0 });
  const gates = evaluateGates(m, { ...FULL_EVIDENCE, manualReview: null });
  assert.equal(gates.find((g) => g.id === 9)!.status, "REVIEW");
  assert.equal(verdictOf(gates), "INSUFFICIENT EVIDENCE");
});

test("opslag tot en met 40 procent is gewoon in orde", () => {
  // €40 op €120 = 33,3%
  const m = aggregateShadowObservations([match({ potentialFeeCents: 4000, baselineSubtotalCents: 12000 })]);
  assert.deepEqual(m.upliftBands, { ok: 1, review: 0, fail: 0 });
  assert.equal(evaluateGates(m, FULL_EVIDENCE).find((g) => g.id === 9)!.status, "PASS");
});

test("toeslag die de ritprijs evenaart wordt gemarkeerd", () => {
  const m = aggregateShadowObservations([match({ potentialFeeCents: 4000, baselineSubtotalCents: 4000 })]);
  assert.ok(m.economicOutliers.some((s) => s.includes("evenaart")));
});

test("verschillende GECONFIGUREERDE bedragen voor één niveau vallen op", () => {
  const m = aggregateShadowObservations([
    match({ configuredFeeCents: 2500, potentialFeeCents: 2500 }),
    match({ configuredFeeCents: 3000, potentialFeeCents: 3000 }),
  ]);
  assert.equal(m.inconsistentFeePerLevel.length, 1);
  assert.ok(m.inconsistentFeePerLevel[0]!.startsWith("high:"));
});

test("verschillende EFFECTIEVE bedragen door de cap zijn juist géén signaal", () => {
  // Dit is de kern van Phase 6.3.2: onder een cap loopt het effectieve bedrag
  // per definitie uiteen. Alleen het geconfigureerde bedrag zegt iets over drift.
  const m = aggregateShadowObservations([
    match({ configuredFeeCents: 4000, potentialFeeCents: 2280, baselineSubtotalCents: 5700, maxUpliftPct: 40 }),
    match({ configuredFeeCents: 4000, potentialFeeCents: 4000, baselineSubtotalCents: 14778, maxUpliftPct: 40 }),
  ]);
  assert.deepEqual(m.inconsistentFeePerLevel, []);
  assert.equal(m.capAppliedCount, 1);
  assert.deepEqual(m.configuredFeeCoverage, { withConfigured: 2, withoutConfigured: 0 });
  assert.equal(evaluateGates(m, FULL_EVIDENCE).find((g) => g.id === 9)!.status, "PASS");
});

test("oude observaties zonder geconfigureerd bedrag leiden nooit tot een FAIL", () => {
  // De 13 historische rijen worden bewust niet gebackfild.
  const m = aggregateShadowObservations([
    match({ configuredFeeCents: null, potentialFeeCents: 2500 }),
    match({ configuredFeeCents: null, potentialFeeCents: 4000, impactLevel: "very_high" }),
  ]);
  assert.deepEqual(m.configuredFeeCoverage, { withConfigured: 0, withoutConfigured: 2 });
  const g9 = evaluateGates(m, FULL_EVIDENCE).find((g) => g.id === 9)!;
  assert.notEqual(g9.status, "FAIL");
  assert.ok(g9.detail.includes("niet meetbaar"));
});

// ── Poorten en eindoordeel ───────────────────────────────────────────────────

test("zonder extern bewijs is de uitkomst INSUFFICIENT EVIDENCE, nooit GO", () => {
  const m = aggregateShadowObservations([match(), obs({ pricingSource: "distance_tariff" })]);
  const gates = evaluateGates(m, NO_EXTERNAL_EVIDENCE);
  assert.equal(verdictOf(gates), "INSUFFICIENT EVIDENCE");
  for (const id of [1, 2, 3, 6]) {
    assert.equal(gates.find((g) => g.id === id)!.status, "UNKNOWN");
  }
});

test("prijsisolatie-schending is een harde NO-GO", () => {
  const m = aggregateShadowObservations([match()]);
  const gates = evaluateGates(m, { ...FULL_EVIDENCE, eventAdjustmentsOnShadowSnapshots: 1 });
  const g = gates.find((x) => x.id === 2)!;
  assert.equal(g.status, "FAIL");
  assert.equal(g.hard, true);
  assert.equal(verdictOf(gates), "NO-GO");
});

test("muteerbare snapshots zijn een harde NO-GO", () => {
  const m = aggregateShadowObservations([match()]);
  const gates = evaluateGates(m, { ...FULL_EVIDENCE, snapshotUpdateRevoked: false });
  assert.equal(gates.find((x) => x.id === 3)!.status, "FAIL");
  assert.equal(verdictOf(gates), "NO-GO");
});

test("locatie-PII in de log is een harde NO-GO", () => {
  const m = aggregateShadowObservations([match()]);
  const gates = evaluateGates(m, { ...FULL_EVIDENCE, prohibitedPiiColumns: 1 });
  assert.equal(gates.find((x) => x.id === 6)!.status, "FAIL");
  assert.equal(verdictOf(gates), "NO-GO");
});

test("dubbele observatie is een harde NO-GO", () => {
  const m = aggregateShadowObservations([match({ quoteId: "d" }), match({ quoteId: "d" })]);
  const gates = evaluateGates(m, FULL_EVIDENCE);
  assert.equal(gates.find((x) => x.id === 7)!.status, "FAIL");
  assert.equal(verdictOf(gates), "NO-GO");
});

test("een prijsbron zonder waarnemingen is onvoldoende bewijs, geen defect", () => {
  const m = aggregateShadowObservations([match(), obs()]);
  const gates = evaluateGates(m, FULL_EVIDENCE);
  assert.equal(gates.find((x) => x.id === 5)!.status, "UNKNOWN");
  assert.equal(verdictOf(gates), "INSUFFICIENT EVIDENCE");
});

test("een als onterecht beoordeelde match is een harde NO-GO", () => {
  const m = aggregateShadowObservations([match()]);
  const gates = evaluateGates(m, {
    ...FULL_EVIDENCE,
    manualReview: { reviewed: 10, correct: 9, incorrect: 1, ambiguous: 0 },
  });
  assert.equal(gates.find((x) => x.id === 8)!.status, "FAIL");
  assert.equal(verdictOf(gates), "NO-GO");
});

test("te kleine steekproef levert INSUFFICIENT EVIDENCE, niet NO-GO", () => {
  const rows = [match(), obs(), match({ pricingSource: "distance_tariff" }), obs({ leg: "return" })];
  const m = aggregateShadowObservations(rows);
  const gates = evaluateGates(m, { ...FULL_EVIDENCE, manualReview: { reviewed: 2, correct: 2, incorrect: 0, ambiguous: 0 } });
  assert.equal(gates.find((x) => x.id === 10)!.status, "UNKNOWN");
  assert.equal(verdictOf(gates), "INSUFFICIENT EVIDENCE");
});

/** Bouwt een dataset die alle bewijsdrempels haalt. */
function sufficientDataset(): ShadowObservation[] {
  const rows: ShadowObservation[] = [];
  const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n, 12)).toISOString();
  for (let i = 0; i < 20; i += 1) {
    rows.push(match({ observedAt: day(i % 20), pricingSource: "fixed_route_prices", matchSides: ["pickup"] }));
    rows.push(match({ observedAt: day(i % 20), pricingSource: "distance_tariff", matchSides: ["dropoff"], impactLevel: "very_high", potentialFeeCents: 4000 }));
  }
  for (let i = 0; i < 160; i += 1) {
    rows.push(obs({ observedAt: day(i % 20), pricingSource: i % 2 ? "distance_tariff" : "fixed_route_prices", leg: i % 5 === 0 ? "return" : "outbound" }));
  }
  return rows;
}

test("alle poorten geslaagd én genoeg bewijs levert GO", () => {
  const rows = sufficientDataset();
  const m = aggregateShadowObservations(rows);
  assert.ok(m.evaluatedLegs >= DEFAULT_EVIDENCE.minEvaluatedLegs);
  assert.ok(m.matchedLegs >= DEFAULT_EVIDENCE.minMatchedLegs);
  const gates = evaluateGates(m, {
    ...FULL_EVIDENCE,
    manualReview: { reviewed: m.matchedLegs, correct: m.matchedLegs, incorrect: 0, ambiguous: 0 },
  });
  const failing = gates.filter((g) => g.status !== "PASS");
  assert.deepEqual(failing.map((g) => `${g.id} ${g.name}: ${g.status} — ${g.detail}`), []);
  assert.equal(verdictOf(gates), "GO");
});

test("dezelfde dataset zonder handmatige beoordeling blijft INSUFFICIENT EVIDENCE", () => {
  const m = aggregateShadowObservations(sufficientDataset());
  const gates = evaluateGates(m, FULL_EVIDENCE);
  assert.equal(gates.find((x) => x.id === 8)!.status, "UNKNOWN");
  assert.equal(verdictOf(gates), "INSUFFICIENT EVIDENCE");
});

test("het rapport noemt het eindoordeel en verzwijgt geen ontbrekende meting", () => {
  const m = aggregateShadowObservations([match(), obs({ pricingSource: "distance_tariff" })]);
  const gates = evaluateGates(m, NO_EXTERNAL_EVIDENCE);
  const text = formatShadowReport(m, gates, NO_EXTERNAL_EVIDENCE);
  assert.ok(text.includes("EINDOORDEEL: INSUFFICIENT EVIDENCE"));
  assert.ok(text.includes("niet gemeten"));
  assert.ok(text.includes("nog niet uitgevoerd"));
  assert.ok(text.includes("SUBTOTAAL"));
});

// ── Policy-calibratie (Phase 6.3.1) ──────────────────────────────────────────

test("cappedFeeCents laat het bedrag staan zolang de cap niet knelt", () => {
  assert.equal(cappedFeeCents(4000, 20000, 40), 4000); // 40% van €200 = €80 > €40
  assert.equal(cappedFeeCents(4000, 10000, 40), 4000); // precies €40
  assert.equal(cappedFeeCents(4000, 5700, 40), 2280); // 40% van €57
  assert.equal(cappedFeeCents(2500, 12900, 40), 2500); // cap raakt dit niet
});

test("zonder cap of zonder subtotaal blijft het geconfigureerde bedrag staan", () => {
  assert.equal(cappedFeeCents(4000, 5700, null), 4000);
  assert.equal(cappedFeeCents(4000, null, 40), 4000);
  assert.equal(cappedFeeCents(4000, 0, 40), 4000);
});

test("simulatie zonder cap reproduceert het huidige vlakke model", () => {
  const rows = [match({ potentialFeeCents: 4000, baselineSubtotalCents: 5700 }), match({ potentialFeeCents: 2500, baselineSubtotalCents: 12900 })];
  const sim = simulateCapPolicy(rows, null);
  assert.equal(sim.totalCents, 6500);
  assert.equal(sim.cappedCount, 0);
  assert.equal(sim.deltaVsFlatCents, 0);
  assert.ok(Math.abs(sim.maxUpliftPct - 70.175) < 0.01);
});

test("een cap verlaagt uitsluitend de ritten waar hij knelt", () => {
  const rows = [
    match({ potentialFeeCents: 4000, baselineSubtotalCents: 5700 }),
    match({ potentialFeeCents: 4000, baselineSubtotalCents: 20000 }),
  ];
  const sim = simulateCapPolicy(rows, 40);
  assert.equal(sim.cappedCount, 1);
  assert.equal(sim.totalCents, 2280 + 4000);
  assert.equal(sim.deltaVsFlatCents, -1720);
  assert.ok(sim.maxUpliftPct <= 40.0001);
});

test("compareCapPolicies zet het vlakke model vooraan en dan de varianten", () => {
  const rows = [match({ potentialFeeCents: 4000, baselineSubtotalCents: 5700 })];
  const sims = compareCapPolicies(rows, [30, 40]);
  assert.deepEqual(sims.map((s) => s.capPct), [null, 30, 40]);
  assert.equal(sims[0]!.totalCents, 4000);
  assert.equal(sims[1]!.totalCents, 1710);
  assert.equal(sims[2]!.totalCents, 2280);
});

test("de simulatie raakt de observaties niet en dus ook de prijsengine niet", () => {
  const rows = [match({ potentialFeeCents: 4000, baselineSubtotalCents: 5700 })];
  const before = JSON.stringify(rows);
  simulateCapPolicy(rows, 30);
  compareCapPolicies(rows);
  assert.equal(JSON.stringify(rows), before);
});
