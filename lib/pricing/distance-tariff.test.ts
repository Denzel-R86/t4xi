import { test } from "node:test";
import assert from "node:assert/strict";
import { priceFromDistance, DEFAULT_DISTANCE_TARIFF } from "@/lib/pricing/distance-tariff";

test("rekent starttarief + km + minuten lineair door, afgerond op hele euro's", () => {
  // 10.75 + 10*0.65 + 20*1.10 = 39.25 → afgerond → €39
  assert.equal(priceFromDistance(10, 20), 39);
});

test("rondt normaal af naar de dichtstbijzijnde hele euro (runtime-voorbeelden)", () => {
  // 13.7 km / 12 min → 32.855 → €33 ; 38.9 km / 34 min → 73.435 → €73
  assert.equal(priceFromDistance(13.7, 12), 33);
  assert.equal(priceFromDistance(38.9, 34), 73);
  // Altijd een geheel bedrag
  for (const p of [priceFromDistance(13.7, 12), priceFromDistance(38.9, 34), priceFromDistance(3, 10)]) {
    assert.ok(Number.isInteger(p), `verwacht heel bedrag, kreeg €${p}`);
  }
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
  assert.equal(p, 93); // 92.72 → €93
});

test("langere rit levert een hogere prijs dan een kortere", () => {
  assert.ok(priceFromDistance(60, 55) > priceFromDistance(20, 20));
});
