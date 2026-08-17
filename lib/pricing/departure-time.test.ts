import { test } from "node:test";
import assert from "node:assert/strict";
import { amsterdamDepartureIso } from "@/lib/pricing/departure-time";

test("wintertijd (UTC+1): 09:00 Amsterdam → 08:00 UTC", () => {
  assert.equal(amsterdamDepartureIso("2026-01-15", "09:00"), "2026-01-15T08:00:00.000Z");
});

test("zomertijd (UTC+2): 09:00 Amsterdam → 07:00 UTC", () => {
  assert.equal(amsterdamDepartureIso("2026-07-15", "09:00"), "2026-07-15T07:00:00.000Z");
});

test("middernacht en late avond ronden correct om over de datumgrens", () => {
  // 23:30 zomertijd = 21:30 UTC (zelfde dag)
  assert.equal(amsterdamDepartureIso("2026-07-15", "23:30"), "2026-07-15T21:30:00.000Z");
  // 00:30 wintertijd = 23:30 UTC de dag ervoor
  assert.equal(amsterdamDepartureIso("2026-01-15", "00:30"), "2026-01-14T23:30:00.000Z");
});

test("ongeldig formaat of onmogelijke waarden → null", () => {
  assert.equal(amsterdamDepartureIso("", ""), null);
  assert.equal(amsterdamDepartureIso("15-01-2026", "09:00"), null);
  assert.equal(amsterdamDepartureIso("2026-01-15", "9:00"), null);
  assert.equal(amsterdamDepartureIso("2026-13-40", "09:00"), null);
  assert.equal(amsterdamDepartureIso("2026-02-29", "09:00"), null);
  assert.equal(amsterdamDepartureIso("2026-04-31", "09:00"), null);
  assert.equal(amsterdamDepartureIso("2026-01-15", "25:00"), null);
});

test("niet-bestaande Amsterdamse zomertijd → null", () => {
  assert.equal(amsterdamDepartureIso("2026-03-29", "02:30"), null);
});

// ── isNightTariff: venster [23:00, 06:00) in Amsterdamse lokale tijd ──────────
import { isNightTariff } from "@/lib/pricing/departure-time";

test("isNightTariff: grenzen 23:00 (nacht) en 06:00 (dag)", () => {
  const iso = (d: string, t: string) => amsterdamDepartureIso(d, t)!;
  assert.equal(isNightTariff(iso("2026-07-15", "22:59")), false, "22:59 = dag");
  assert.equal(isNightTariff(iso("2026-07-15", "23:00")), true, "23:00 = nacht");
  assert.equal(isNightTariff(iso("2026-07-15", "05:59")), true, "05:59 = nacht");
  assert.equal(isNightTariff(iso("2026-07-15", "06:00")), false, "06:00 = dag");
  assert.equal(isNightTariff(iso("2026-07-15", "00:00")), true, "00:00 = nacht");
  assert.equal(isNightTariff(iso("2026-07-15", "12:00")), false, "12:00 = dag");
});

test("isNightTariff: DST-correct — 23:30 nacht in zomer- én wintertijd", () => {
  assert.equal(isNightTariff(amsterdamDepartureIso("2026-07-15", "23:30")!), true);
  assert.equal(isNightTariff(amsterdamDepartureIso("2026-01-15", "23:30")!), true);
  assert.equal(isNightTariff(amsterdamDepartureIso("2026-01-15", "03:00")!), true);
});

test("isNightTariff: leeg/ongeldig → false (fail-open)", () => {
  assert.equal(isNightTariff(null), false);
  assert.equal(isNightTariff(""), false);
  assert.equal(isNightTariff("niet-een-datum"), false);
});
