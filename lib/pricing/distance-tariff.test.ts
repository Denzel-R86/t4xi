import { test } from "node:test";
import assert from "node:assert/strict";
import { priceFromDistance, DEFAULT_DISTANCE_TARIFF } from "@/lib/pricing/distance-tariff";

test("rekent starttarief + km + minuten lineair door", () => {
  // 10.75 + 10*0.65 + 20*1.10 = 10.75 + 6.5 + 22 = 39.25
  assert.equal(priceFromDistance(10, 20), 39.25);
});

test("kapt af op de minimumprijs voor korte ritten", () => {
  // 10.75 + 3*0.65 + 10*1.10 = 10.75 + 1.95 + 11 = 23.70 → onder €30 → 30
  assert.equal(priceFromDistance(3, 10), DEFAULT_DISTANCE_TARIFF.minimumFare);
});

test("niet-eindige of negatieve invoer levert nooit NaN/negatief, minimaal de ondergrens", () => {
  assert.equal(priceFromDistance(Number.NaN, Number.NaN), 30);
  assert.equal(priceFromDistance(-5, -5), 30);
  assert.equal(priceFromDistance(0, 0), 30);
});

test("reproduceert het bestaande prijsniveau bij een gemiddelde route", () => {
  // Gem. echte route ≈ 48,6 km / 45,8 min → verwacht ~€92,9 (werkelijk gem. €95,95).
  const p = priceFromDistance(48.6, 45.8);
  assert.ok(p > 88 && p < 98, `verwacht ~€93, kreeg €${p}`);
});

test("langere rit levert een hogere prijs dan een kortere", () => {
  assert.ok(priceFromDistance(60, 55) > priceFromDistance(20, 20));
});
