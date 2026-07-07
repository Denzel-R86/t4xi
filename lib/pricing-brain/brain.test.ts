import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateCost,
  decide,
  recommend,
  explain,
  buildDefaultProviders,
  DEFAULT_FACTOR_CONFIG,
  psychoRound,
  type RouteContext,
  type PriceDecision,
} from "./index";
import { STUB_FACTOR_KEYS } from "./factors/stubs";
import {
  analyzeRoute,
  toRouteContext,
  summarize,
  type BrainRoute,
} from "../../scripts/brain-analyze";

const ctx = (over: Partial<RouteContext> = {}): RouteContext => ({
  pickupSlug: "almere-poort",
  dropoffSlug: "schiphol-airport",
  vehicleClassCode: "executive-ev",
  serviceType: "airport",
  distanceKm: 39,
  estimatedDurationMin: 40,
  currentPrice: 102,
  currentReturnPrice: 184,
  dropoffIsAirport: true,
  vehicleMultiplier: 1,
  market: null,
  ...over,
});

test("cost model — 39 km / 40 min", () => {
  const c = estimateCost(39, 40);
  assert.equal(c.distanceCost, 16.38);
  assert.equal(c.timeCost, 28.8);
  assert.equal(c.total, 52.18);
});

test("factor aggregation — breakdown telt exact op tot recommendedPrice", () => {
  const d = decide(ctx(), buildDefaultProviders(), DEFAULT_FACTOR_CONFIG);
  const sum = d.breakdown.reduce((s, b) => s + b.contribution, 0);
  assert.ok(Math.abs(sum - d.recommendedPrice) < 0.001, `sum ${sum} != ${d.recommendedPrice}`);
});

test("confidence weighting — overallConfidence binnen [0,1] en > 0", () => {
  const d = decide(ctx(), buildDefaultProviders(), DEFAULT_FACTOR_CONFIG);
  assert.ok(d.overallConfidence >= 0 && d.overallConfidence <= 1);
  assert.ok(d.overallConfidence > 0);
});

test("stubs dragen 0 bij en veranderen het resultaat niet", () => {
  const all = buildDefaultProviders();
  const noStubs = all.filter((p) => !STUB_FACTOR_KEYS.includes(p.key as never));
  const dAll = decide(ctx(), all, DEFAULT_FACTOR_CONFIG);
  const dNo = decide(ctx(), noStubs, DEFAULT_FACTOR_CONFIG);

  for (const b of dAll.breakdown) {
    if (STUB_FACTOR_KEYS.includes(b.factorKey as never)) {
      assert.equal(b.contribution, 0);
      assert.equal(b.confidence, 0);
    }
  }
  assert.equal(dAll.recommendedPrice, dNo.recommendedPrice);
  assert.equal(dAll.overallConfidence, dNo.overallConfidence);
});

test("psychological pricing — afronding op 5/9 eindes", () => {
  assert.equal(psychoRound(100), 99);
  assert.equal(psychoRound(105), 105);
  assert.equal(psychoRound(70), 69);
  assert.equal(psychoRound(92.32), 89);
  assert.equal(psychoRound(53), 55);

  const d = decide(ctx(), buildDefaultProviders(), DEFAULT_FACTOR_CONFIG);
  assert.equal(d.recommendedPrice, psychoRound(d.rawRecommendedPrice));
  assert.ok([5, 9].includes(d.recommendedPrice % 10));
});

test("competitor — nudge gebruikt marktdata indien aanwezig", () => {
  const withMarket = decide(
    ctx({ market: { low: 60, mid: 75, high: 90, isEstimate: true } }),
    buildDefaultProviders(),
    DEFAULT_FACTOR_CONFIG
  );
  const noMarket = decide(ctx({ market: null }), buildDefaultProviders(), DEFAULT_FACTOR_CONFIG);

  const cWith = withMarket.breakdown.find((b) => b.factorKey === "competitor");
  const cNo = noMarket.breakdown.find((b) => b.factorKey === "competitor");
  assert.ok(cWith);
  assert.ok(cNo);
  assert.equal(cNo.contribution, 0);
  assert.notEqual(cWith.contribution, 0);
});

test("cost-floor — tilt een goedkope route naar de kostenondergrens", () => {
  // Korte, dure-in-tijd route met kunstmatig lage config zou onder de floor komen;
  // hier checken we dat de floor nooit een negatieve bijdrage geeft.
  const d = decide(ctx({ distanceKm: 2, estimatedDurationMin: 8 }), buildDefaultProviders(), DEFAULT_FACTOR_CONFIG);
  const floor = d.breakdown.find((b) => b.factorKey === "cost_floor");
  assert.ok(floor);
  assert.ok(floor.contribution >= 0);
});

// ── Stap 8c: Recommendation Engine ───────────────────────────────────────────

const rec = (over: Partial<RouteContext> = {}) => {
  const c = ctx(over);
  const d = decide(c, buildDefaultProviders(), DEFAULT_FACTOR_CONFIG);
  return recommend(c, d);
};

test("aanbeveling — verliesgevende route geeft RAISE_URGENT", () => {
  // kosten(35km/35min) = 7 + 14.7 + 25.2 = 46.9 > prijs 45 → marge < 0
  const r = rec({
    serviceType: "intercity",
    dropoffIsAirport: false,
    distanceKm: 35,
    estimatedDurationMin: 35,
    currentPrice: 45,
  });
  assert.equal(r.action, "RAISE_URGENT");
  assert.ok(r.currentMarginPct < 0);
  assert.ok(r.toPrice !== null && r.toPrice > r.fromPrice);
});

test("aanbeveling — lage marge geeft RAISE", () => {
  // kosten(120km/90min) = 7 + 50.4 + 64.8 = 122.2 → marge (139-122.2)/139 ≈ 12%
  const r = rec({
    serviceType: "intercity",
    dropoffIsAirport: false,
    distanceKm: 120,
    estimatedDurationMin: 90,
    currentPrice: 139,
  });
  assert.equal(r.action, "RAISE");
  assert.ok(r.currentMarginPct >= 0 && r.currentMarginPct < 15);
});

test("aanbeveling — gezonde route geeft HOLD", () => {
  // kosten(30km/30min) = 7 + 12.6 + 21.6 = 41.2 → marge bij 99 ≈ 58%; charm-prijs; geen markt
  const r = rec({
    serviceType: "intercity",
    dropoffIsAirport: false,
    distanceKm: 30,
    estimatedDurationMin: 30,
    currentPrice: 99,
  });
  assert.equal(r.action, "HOLD");
  assert.equal(r.toPrice, null);
});

test("aanbeveling — psychologische afwijking geeft REPRICE_PSYCH", () => {
  // gezonde marge, geen markt, maar 102 is geen charm-prijs (→ 99, delta 3)
  const r = rec({
    serviceType: "intercity",
    dropoffIsAirport: false,
    distanceKm: 40,
    estimatedDurationMin: 50,
    currentPrice: 102,
  });
  assert.equal(r.action, "REPRICE_PSYCH");
  assert.equal(r.toPrice, psychoRound(102));
});

test("aanbeveling — lage confidence geeft MANUAL_REVIEW", () => {
  const c = ctx({
    serviceType: "intercity",
    dropoffIsAirport: false,
    distanceKm: 30,
    estimatedDurationMin: 30,
    currentPrice: 99,
  });
  const lowConf: PriceDecision = {
    basePrice: 10.77,
    recommendedPrice: 105,
    rawRecommendedPrice: 105,
    psychologicalPrice: 105,
    overallConfidence: 0.3,
    breakdown: [],
    currency: "EUR",
  };
  const r = recommend(c, lowConf);
  assert.equal(r.action, "MANUAL_REVIEW");
  assert.equal(r.toPrice, null);
});

// ── Stap 8c: Explainer ───────────────────────────────────────────────────────

test("explainer — breakdown telt op tot recommendedPrice", () => {
  const d = decide(ctx(), buildDefaultProviders(), DEFAULT_FACTOR_CONFIG);
  const ex = explain(d);
  const sum = ex.lines.reduce((s, l) => s + l.amount, 0);
  assert.ok(Math.abs(sum - ex.recommendedPrice) < 0.001, `sum ${sum} != ${ex.recommendedPrice}`);
});

test("explainer — geeft base price, data_status per regel en stub-lijst", () => {
  const d = decide(ctx(), buildDefaultProviders(), DEFAULT_FACTOR_CONFIG);
  const ex = explain(d);
  assert.equal(ex.basePrice, d.basePrice);
  assert.equal(ex.currency, "EUR");
  // stubs staan niet tussen de regels, maar apart vermeld
  assert.equal(ex.stubbedFactors.length, STUB_FACTOR_KEYS.length);
  for (const l of ex.lines) {
    assert.notEqual(l.dataStatus, "stub");
    assert.ok(["active", "estimated"].includes(l.dataStatus));
  }
  assert.ok(ex.rationale.includes("Aanbevolen"));
});

// ── Stap 8d: Brain Analyze — pure analyse-kern ───────────────────────────────

const ACTIONS = [
  "RAISE_URGENT",
  "RAISE",
  "LOWER",
  "REPRICE_PSYCH",
  "POSITION_PREMIUM",
  "MANUAL_REVIEW",
  "HOLD",
] as const;

const brainRoute = (over: Partial<BrainRoute> = {}): BrainRoute => ({
  fixedRoutePriceId: "frp-1",
  pickupLocationId: "loc-a",
  dropoffLocationId: "loc-b",
  vehicleClassId: "vc-1",
  pickupSlug: "almere-poort",
  dropoffSlug: "schiphol-airport",
  vehicleClassCode: "executive-ev",
  serviceType: "airport",
  distanceKm: 39,
  estimatedDurationMin: 40,
  price: 102,
  returnPrice: 184,
  pickupIsAirport: false,
  dropoffIsAirport: true,
  vehicleMultiplier: 1,
  ...over,
});

test("brain-analyze — toRouteContext mapt een route 1:1 naar RouteContext", () => {
  const c = toRouteContext(brainRoute());
  assert.equal(c.currentPrice, 102);
  assert.equal(c.dropoffIsAirport, true);
  assert.equal(c.market, null);
  assert.equal(c.distanceKm, 39);
});

test("brain-analyze — analyzeRoute levert cost + decision + recommendation + explainer", () => {
  const a = analyzeRoute(brainRoute());
  assert.equal(a.cost.total, estimateCost(39, 40).total);
  assert.ok(ACTIONS.includes(a.recommendation.action));
  // explainer-breakdown telt op tot recommendedPrice
  const sum = a.explanation.lines.reduce((s, l) => s + l.amount, 0);
  assert.ok(Math.abs(sum - a.decision.recommendedPrice) < 0.001);
});

test("brain-analyze — verliesgevende route wordt RAISE_URGENT in de kern", () => {
  const a = analyzeRoute(
    brainRoute({
      serviceType: "intercity",
      dropoffIsAirport: false,
      distanceKm: 35,
      estimatedDurationMin: 35,
      price: 45,
    })
  );
  assert.equal(a.recommendation.action, "RAISE_URGENT");
});

test("brain-analyze — summarize telt acties en middelt marge/confidence", () => {
  const analyses = [
    analyzeRoute(brainRoute({ serviceType: "intercity", dropoffIsAirport: false, distanceKm: 35, estimatedDurationMin: 35, price: 45 })),
    analyzeRoute(brainRoute({ serviceType: "intercity", dropoffIsAirport: false, distanceKm: 30, estimatedDurationMin: 30, price: 99 })),
  ];
  const s = summarize(analyses);
  assert.equal(s.routesAnalyzed, 2);
  const totalCounts = ACTIONS.reduce((sum, a) => sum + s.counts[a], 0);
  assert.equal(totalCounts, 2);
  assert.ok(s.avgConfidence > 0 && s.avgConfidence <= 1);
});
