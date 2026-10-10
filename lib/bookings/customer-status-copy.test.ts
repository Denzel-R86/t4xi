import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { BOOKING_STATUSES } from "@/lib/bookings/lifecycle";
import {
  BOOKING_STATUS_COPY,
  CUSTOMER_LOCALES,
  PRE_CONFIRMATION_PAYMENT_COPY,
  PRE_CONFIRMATION_STATUSES,
  SCREEN_BOOKING_STATUSES,
  screenBookingStatus,
  screenHeadline,
} from "@/lib/bookings/customer-status-copy";
import { serverPaidProof, type ServerPaidProof } from "@/lib/payments/server-paid";

/** ES 08: woorden die een aanvraag als bevestigde/geplande rit laten lezen. */
const CONFIRMATION_CLAIM = /bevestigd|confirmed|staat klaar|staat gepland|is gepland|scheduled|all set|ready/i;
const PAID = serverPaidProof({ status: "paid", amountPaid: 8900 }, null) as ServerPaidProof;
const FORGED = { amountCents: 8900, currency: "eur" } as unknown as ServerPaidProof;
const nl = JSON.parse(readFileSync("messages/nl.json", "utf8"));
const en = JSON.parse(readFileSync("messages/en.json", "utf8"));

test("elke bookingstatus heeft precies één klanttekst per locale", () => {
  assert.deepEqual(Object.keys(BOOKING_STATUS_COPY).sort(), [...BOOKING_STATUSES].sort());
  for (const status of BOOKING_STATUSES) {
    const copy = BOOKING_STATUS_COPY[status];
    for (const locale of CUSTOMER_LOCALES) {
      assert.equal(typeof copy[locale], "string", `${status}/${locale}`);
      assert.ok(copy[locale].trim().length > 0, `${status}/${locale} is leeg`);
    }
    assert.deepEqual(Object.keys(copy).sort(), ["approval", "en", "nl"]);
  }
});

test("pending/paid (vóór vervoersbevestiging) bevatten nooit een bevestigingsclaim", () => {
  for (const payment of ["pending", "paid"] as const) {
    for (const locale of CUSTOMER_LOCALES) {
      assert.doesNotMatch(PRE_CONFIRMATION_PAYMENT_COPY[payment][locale], CONFIRMATION_CLAIM, `${payment}/${locale}`);
    }
  }
  for (const status of PRE_CONFIRMATION_STATUSES) {
    for (const payment of [null, PAID]) {
      for (const locale of CUSTOMER_LOCALES) {
        assert.doesNotMatch(screenHeadline(status, payment, locale), CONFIRMATION_CLAIM, `${status}/${locale}`);
      }
    }
  }
});

test("pending-copy (mapping én betaalstap) zegt nooit confirm/bevestig", () => {
  for (const locale of CUSTOMER_LOCALES) {
    assert.doesNotMatch(PRE_CONFIRMATION_PAYMENT_COPY.pending[locale], /confirm|bevestig/i, locale);
  }
  assert.equal(en.betaling.pending, "Your payment is being processed.");
  assert.doesNotMatch(en.betaling.pending, /confirm/i);
  // NL ongewijzigd op verzoek van de eigenaar ("We controleren de bevestiging."):
  // geen claim dat iets bevestigd ís; het woorddeel "bevestig" staat er wel in.
  assert.doesNotMatch(nl.betaling.pending, /bevestigd|staat klaar|staat gepland/i);
});

test("de legacy-respons 'pending' van /api/bookings is een aanvraag; voorstel-statussen bereiken het scherm niet", () => {
  assert.equal(screenBookingStatus("pending"), "inquiry");
  assert.equal(screenBookingStatus(undefined), "inquiry");
  assert.equal(screenBookingStatus("CONFIRMED"), "inquiry");
  assert.equal(screenBookingStatus(42), "inquiry");
  assert.equal(screenBookingStatus("quoted"), "quoted");
  assert.equal(screenBookingStatus("confirmed"), "confirmed");
  for (const proposal of ["assigned", "in_progress", "completed", "cancelled"]) {
    assert.equal(screenBookingStatus(proposal), "inquiry", proposal);
  }
});

test("het scherm rendert nooit een voorsteltekst", () => {
  const proposals = BOOKING_STATUSES.filter((s) => BOOKING_STATUS_COPY[s].approval === "proposal");
  assert.deepEqual(proposals, ["assigned", "in_progress", "completed", "cancelled"]);
  for (const status of SCREEN_BOOKING_STATUSES) {
    for (const payment of [null, PAID, FORGED]) {
      for (const locale of CUSTOMER_LOCALES) {
        const headline = screenHeadline(status, payment, locale);
        for (const p of proposals) {
          assert.notEqual(headline, BOOKING_STATUS_COPY[p][locale], `${status}/${locale} toont voorstel ${p}`);
        }
      }
    }
  }
});

test("'Betaling ontvangen'/'Payment received' alleen met een echt server-bewijs", () => {
  assert.equal(screenHeadline("inquiry", PAID, "nl"), "Betaling ontvangen. Uw aanvraag is in behandeling.");
  assert.equal(screenHeadline("inquiry", PAID, "en"), "Payment received. Your request is being processed.");
  for (const payment of [null, FORGED]) {
    for (const status of PRE_CONFIRMATION_STATUSES) {
      assert.equal(screenHeadline(status, payment, "nl"), "Betaling wordt verwerkt. Uw aanvraag is in behandeling.");
      assert.equal(screenHeadline(status, payment, "en"), "Processing payment. Your request is being processed.");
      assert.doesNotMatch(screenHeadline(status, payment, "nl"), /ontvangen|betaald/);
      assert.doesNotMatch(screenHeadline(status, payment, "en"), /received|paid/i);
    }
  }
});

test("'Uw rit is bevestigd' uitsluitend bij bookingstatus confirmed", () => {
  for (const status of SCREEN_BOOKING_STATUSES) {
    for (const payment of [null, PAID]) {
      for (const locale of CUSTOMER_LOCALES) {
        const confirmedClaim = /Uw rit is bevestigd|Your ride is confirmed/.test(screenHeadline(status, payment, locale));
        assert.equal(confirmedClaim, status === "confirmed", `${status}/${locale}`);
      }
    }
  }
});
