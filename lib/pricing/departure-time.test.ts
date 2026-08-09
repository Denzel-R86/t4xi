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
