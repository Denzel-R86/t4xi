// Tests voor de 0.4a-weekaggregatie (pure functies, synthetische data, geen DB).
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildServerTruthReport,
  classifyExclusions,
  formatRatio,
  isoWeekKey,
  isoWeekOfDate,
  mondayOfIsoWeek,
  ratio,
  weeksBetween,
  type BookingRow,
} from "@/lib/baseline/server-truth";

function booking(overrides: Partial<BookingRow> & { id: string; createdAt: string }): BookingRow {
  return {
    quoteId: null,
    status: "inquiry",
    paymentStatus: "unpaid",
    hasPaymentIntent: false,
    paidAt: null,
    amountDueCents: null,
    amountPaidCents: null,
    priceEuros: 57,
    testMarker: false,
    internalDomain: false,
    contactKeys: [],
    ...overrides,
  };
}

test("ISO-week volgt ISO-8601, ook rond de jaarwisseling", () => {
  assert.equal(isoWeekOfDate("2026-07-30"), "2026-W31");
  assert.equal(isoWeekOfDate("2026-01-01"), "2026-W01"); // donderdag
  assert.equal(isoWeekOfDate("2027-01-01"), "2026-W53"); // vrijdag → week 53 van 2026
  assert.equal(isoWeekOfDate("2024-12-30"), "2025-W01");
  assert.equal(mondayOfIsoWeek("2026-W31"), "2026-07-27");
  assert.equal(mondayOfIsoWeek("2025-W01"), "2024-12-30");
});

test("week wordt in Europe/Amsterdam bepaald, niet in UTC", () => {
  // Zondag 2 aug 22:30 UTC = maandag 3 aug 00:30 in Amsterdam (CEST).
  assert.equal(isoWeekKey("2026-08-02T22:30:00Z"), "2026-W32");
  assert.equal(isoWeekKey("2026-08-02T21:30:00Z"), "2026-W31");
});

test("weeksBetween vult lege weken op", () => {
  assert.deepEqual(weeksBetween("2026-W52", "2027-W01"), ["2026-W52", "2026-W53", "2027-W01"]);
});

test("ratio geeft null bij noemer 0 en toont altijd absolute aantallen", () => {
  assert.equal(ratio(0, 0).pct, null);
  assert.equal(formatRatio(ratio(0, 0)), "0 / 0 (n.v.t.)");
  assert.equal(formatRatio(ratio(1, 3)), "1 / 3 (33,3%)");
});

test("testuitsluiting: markering, intern domein en gedeeld contact (één stap)", () => {
  const ex = classifyExclusions([
    booking({ id: "a", createdAt: "2026-07-29T10:00:00Z", testMarker: true, contactKeys: ["k1"] }),
    booking({ id: "b", createdAt: "2026-07-29T10:00:00Z", contactKeys: ["k1", "k2"] }),
    booking({ id: "c", createdAt: "2026-07-29T10:00:00Z", contactKeys: ["k2"] }),
    booking({ id: "d", createdAt: "2026-07-29T10:00:00Z", internalDomain: true }),
    booking({ id: "e", createdAt: "2026-07-29T10:00:00Z", contactKeys: ["k3"] }),
  ]);
  assert.equal(ex.get("a"), "test_marker");
  assert.equal(ex.get("b"), "shared_contact");
  assert.equal(ex.has("c"), false, "geen transitieve keten via b");
  assert.equal(ex.get("d"), "internal_domain");
  assert.equal(ex.has("e"), false);
});

test("weekaggregatie telt quotes, bookings en betaald per week, test uitgesloten", () => {
  const report = buildServerTruthReport({
    generatedAt: "2026-10-06T00:00:00Z",
    snapshots: [
      { createdAt: "2026-08-03T08:00:00Z", pricingSource: "dynamic", totalCents: 5700, fingerprint: "f1" },
      { createdAt: "2026-08-03T08:01:00Z", pricingSource: "dynamic", totalCents: 5700, fingerprint: "f1" },
      { createdAt: "2026-08-12T08:00:00Z", pricingSource: "fixed_route_prices", totalCents: 9900, fingerprint: "f2" },
      { createdAt: "2026-08-12T08:02:00Z", pricingSource: "fixed_route_prices", totalCents: 9900, fingerprint: null },
    ],
    quoteLogs: [
      { createdAt: "2026-08-03T08:00:00Z", available: true },
      { createdAt: "2026-08-03T08:05:00Z", available: false },
    ],
    bookings: [
      booking({
        id: "real-paid",
        createdAt: "2026-08-03T09:00:00Z",
        quoteId: "q1",
        hasPaymentIntent: true,
        paymentStatus: "paid",
        paidAt: "2026-08-03T09:05:00Z",
        amountDueCents: 5700,
        amountPaidCents: 5700,
      }),
      booking({ id: "real-open", createdAt: "2026-08-12T09:00:00Z", quoteId: "q2" }),
      booking({ id: "test", createdAt: "2026-08-03T10:00:00Z", testMarker: true, paymentStatus: "paid", paidAt: "2026-08-03T10:01:00Z" }),
    ],
    webhooks: [{ paymentIntentId: "pi_orphan", eventType: "payment_intent.succeeded" }],
    transitions: [],
    bookingPaymentIntents: new Set(["pi_known"]),
  });

  assert.deepEqual(
    report.weeks.map((w) => [w.week, w.quotes, w.uniqueQuoteFingerprints, w.quotesWithoutFingerprint, w.bookings, w.paidBookings, w.excludedTestBookings]),
    [
      ["2026-W32", 2, 1, 0, 1, 1, 1],
      ["2026-W33", 2, 1, 1, 1, 0, 0],
    ]
  );
  assert.equal(report.totals.bookings, 2);
  assert.equal(report.totals.bookingsExcluded, 1);
  assert.equal(report.totals.paidBookings, 1);
  assert.equal(report.totals.paidRevenueCents, 5700);
  assert.deepEqual(report.totals.quoteToBooking, { numerator: 2, denominator: 4, pct: 50 });
  assert.equal(report.totals.quoteCalculationsAvailable, 1);
  assert.ok(report.findings.some((f) => f.code === "payment_without_booking" && f.count === 1));
  assert.ok(report.findings.some((f) => f.code === "paid_but_lifecycle_inquiry"));
});

test("rapport bevat geen contactsleutels of ids", () => {
  const report = buildServerTruthReport({
    generatedAt: "2026-10-06T00:00:00Z",
    snapshots: [],
    quoteLogs: [],
    bookings: [booking({ id: "secret-id", createdAt: "2026-08-03T09:00:00Z", contactKeys: ["secret-key"] })],
    webhooks: [],
    transitions: [],
    bookingPaymentIntents: new Set(["pi_secret"]),
  });
  const json = JSON.stringify(report);
  for (const s of ["secret-id", "secret-key", "pi_secret"]) assert.equal(json.includes(s), false);
});
