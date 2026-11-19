import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { evaluateDistanceTariffHealth, type DistanceTariffCounts } from "@/lib/pricing/distance-tariff-health";

const NOW = new Date("2026-11-19T07:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
const base: DistanceTariffCounts = {
  successesInWindow: 0,
  routingFailuresInWindow: 0,
  missesInStalePeriod: 0,
  lastSuccessAt: daysAgo(1),
};
const ev = (over: Partial<DistanceTariffCounts>) => evaluateDistanceTariffHealth({ ...base, ...over }, { now: NOW });

test("een geslaagde afstandsprijs in het venster is altijd ok", () => {
  assert.deepEqual(ev({ successesInWindow: 1, routingFailuresInWindow: 5 }), { status: "ok", reason: "recent_success" });
});

test("routingstoring zonder enige geslaagde prijs -> unhealthy", () => {
  const h = ev({ routingFailuresInWindow: 1 });
  assert.equal(h.status, "unhealthy");
  assert.equal(h.status === "unhealthy" && h.reason, "routing_failing");
});

test("productiegeval 19-11: laatste succes 8 september, vier missers -> stale", () => {
  const h = ev({ lastSuccessAt: new Date("2026-09-08T21:37:48Z"), missesInStalePeriod: 4 });
  assert.equal(h.status, "unhealthy");
  if (h.status === "unhealthy") {
    assert.equal(h.reason, "stale");
    assert.equal(h.daysSinceLastSuccess, 71);
  }
});

test("nooit een succes en genoeg missers -> stale met null dagen", () => {
  const h = ev({ lastSuccessAt: null, missesInStalePeriod: 3 });
  assert.deepEqual(h, { status: "unhealthy", reason: "stale", daysSinceLastSuccess: null });
});

test("geen verkeer is nooit een alarm", () => {
  assert.deepEqual(ev({ lastSuccessAt: daysAgo(60) }), { status: "idle", reason: "no_traffic" });
});

test("te weinig missers voor stale -> ok zonder signaal", () => {
  assert.deepEqual(ev({ lastSuccessAt: daysAgo(30), missesInStalePeriod: 2 }), { status: "ok", reason: "no_signal" });
});

test("recent succes buiten het venster en missers -> nog niet stale", () => {
  assert.deepEqual(ev({ lastSuccessAt: daysAgo(3), missesInStalePeriod: 10 }), { status: "ok", reason: "no_signal" });
});

// ── Bronscan op de route: geheim verplicht, geen adressen in de response ──

const route = readFileSync(new URL("../../app/api/pricing/health/route.ts", import.meta.url), "utf8");

test("health-route vereist PRICING_HEALTH_SECRET en vergelijkt constant-time", () => {
  assert.match(route, /PRICING_HEALTH_SECRET/);
  assert.match(route, /timingSafeEqual/);
});

test("health-route selecteert nooit adresvelden", () => {
  for (const veld of ["pickup_input", "dropoff_input", "request_payload"]) {
    assert.ok(!route.includes(veld), `${veld} mag niet in de health-route`);
  }
});

test("unhealthy -> 503, zodat de geplande workflow faalt en mailt", () => {
  assert.match(route, /status === "unhealthy" \? 503 : 200/);
});
