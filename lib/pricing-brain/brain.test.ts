import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateCost,
  decide,
  buildDefaultProviders,
  DEFAULT_FACTOR_CONFIG,
  psychoRound,
  type RouteContext,
} from "./index";
import { STUB_FACTOR_KEYS } from "./factors/stubs";

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
