import assert from "node:assert/strict";
import { test } from "node:test";
import { BOOKING_STATUSES } from "@/lib/bookings/lifecycle";
import {
  BOOKING_STATUS_COPY,
  CUSTOMER_LOCALES,
  PRE_CONFIRMATION_PAYMENT_COPY,
  PRE_CONFIRMATION_STATUSES,
  bookingStatusFromResponse,
  customerStatusCopy,
  customerStatusHeadline,
} from "@/lib/bookings/customer-status-copy";

/** ES 08: woorden die een aanvraag als bevestigde/geplande rit laten lezen. */
const CONFIRMATION_CLAIM = /bevestigd|confirmed|staat klaar|staat gepland|is gepland|scheduled|all set|ready/i;

test("elke bookingstatus heeft precies één klanttekst per locale", () => {
  assert.deepEqual(Object.keys(BOOKING_STATUS_COPY).sort(), [...BOOKING_STATUSES].sort());
  for (const status of BOOKING_STATUSES) {
    const copy = BOOKING_STATUS_COPY[status];
    for (const locale of CUSTOMER_LOCALES) {
      assert.equal(typeof copy[locale], "string", `${status}/${locale}`);
      assert.ok(copy[locale].trim().length > 0, `${status}/${locale} is leeg`);
    }
    // geen extra talen of losse varianten naast nl/en/approval
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
    for (const payment of ["unpaid", "pending", "paid"] as const) {
      for (const locale of CUSTOMER_LOCALES) {
        assert.doesNotMatch(customerStatusHeadline(status, payment, locale), CONFIRMATION_CLAIM, `${status}+${payment}/${locale}`);
      }
    }
  }
});

test("de legacy-respons 'pending' van /api/bookings is een aanvraag, nooit een bevestiging", () => {
  assert.equal(bookingStatusFromResponse("pending"), "inquiry");
  assert.equal(bookingStatusFromResponse(undefined), "inquiry");
  assert.equal(bookingStatusFromResponse("CONFIRMED"), "inquiry");
  assert.equal(bookingStatusFromResponse(42), "inquiry");
  assert.equal(bookingStatusFromResponse("quoted"), "quoted");
});

test("§8: een betaalde aanvraag krijgt letterlijk de goedgekeurde kop", () => {
  assert.equal(customerStatusHeadline("inquiry", "paid", "nl"), "Betaling ontvangen. Uw aanvraag is in behandeling.");
  assert.equal(customerStatusHeadline("inquiry", "paid", "en"), "Payment received. Your request is being processed.");
});

test("de kop volgt de bookingstatus: betaling maakt een rit niet bevestigd, bevestiging wel", () => {
  assert.doesNotMatch(customerStatusHeadline("inquiry", "paid", "nl"), /bevestigd/);
  assert.equal(customerStatusHeadline("confirmed", "paid", "nl"), "Uw rit is bevestigd.");
  assert.equal(customerStatusHeadline("confirmed", "unpaid", "en"), "Your ride is confirmed.");
});

test("wat de website nu kan tonen, is goedgekeurde copy (claims-check §0c)", () => {
  for (const status of PRE_CONFIRMATION_STATUSES) {
    for (const payment of ["unpaid", "pending", "paid"] as const) {
      assert.equal(customerStatusCopy(status, payment).approval, "approved", `${status}+${payment}`);
    }
  }
});
