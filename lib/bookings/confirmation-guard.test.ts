import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * Bronlocks voor de §8-guard (besluit eigenaar #72): elke weg naar
 * BookingConfirmation en naar "betaald"/"Betaling ontvangen" loopt via het
 * server-bewijs. Gedrag zelf: server-paid.test.ts, customer-status-copy.test.ts,
 * confirmation-details.test.ts, booking-calendar.test.ts en de gedragstest.
 */
const step = readFileSync("components/booking/PaymentStep.tsx", "utf8");
const view = readFileSync("components/booking/BookingConfirmation.tsx", "utf8");
const section = readFileSync("components/booking/BookingSection.tsx", "utf8");
const nl = JSON.parse(readFileSync("messages/nl.json", "utf8"));
const en = JSON.parse(readFileSync("messages/en.json", "utf8"));

test("PaymentStep: het bewijs wordt alleen gezet na mapped === 'confirmed' (status 'paid')", () => {
  assert.equal((step.match(/setPaidProof\(/g) ?? []).length, 1);
  assert.match(step, /if \(mapped === "confirmed"\) \{\s*setPaidProof\(serverPaidProof\(data, state\.intent\)\);/);
});

test("PaymentStep: alleen de confirmed-tak geeft het bewijs door; pending krijgt null", () => {
  assert.equal((step.match(/<BookingConfirmation/g) ?? []).length, 1);
  assert.match(step, /payment=\{state\.status === "confirmed" \? paidProof : null\}/);
  // geen oude claimkop meer in de pending-tak
  assert.doesNotMatch(step, /pendingKop|confirmedKop/);
  assert.equal(nl.betaling.pendingKop, undefined);
  assert.equal(en.betaling.pendingKop, undefined);
});

test("BookingConfirmation: kop alleen via screenHeadline, bedrag/agenda alleen via isServerPaid", () => {
  assert.match(view, /screenHeadline\(details\.bookingStatus, payment, locale\)/);
  assert.doesNotMatch(view, /customerStatusCopy|BOOKING_STATUS_COPY|PRE_CONFIRMATION_PAYMENT_COPY/);
  assert.match(view, /const paid = isServerPaid\(payment\);/);
  assert.match(view, /paidLabel = paid && payment\.amountCents !== null \?/);
  assert.match(view, /buildBookingIcs\(details, \{ locale, payment, now: createdAt \}\)/);
  assert.match(view, /confirmationFields\(details, payment\)/);
  // "betaald"-sleutel staat alleen achter paidLabel
  assert.match(view, /paidLabel \? t\("betaald", \{ amount: paidLabel \}\) : ""/);
});

test("BookingSection: bookingstatus alleen via screenBookingStatus; geen bedrag of betaalstatus in de details", () => {
  assert.match(section, /bookingStatus: screenBookingStatus\(data\.status\)/);
  assert.doesNotMatch(section, /<BookingConfirmation/);
  const details = section.slice(section.indexOf("details: {"), section.indexOf("details: {") + 800);
  assert.doesNotMatch(details, /price|amount|paid/i);
});

test("geen sessie-/opslagpad: na een reload bestaat de weergave niet", () => {
  for (const src of [step, view]) assert.doesNotMatch(src, /sessionStorage|localStorage|searchParams/);
});
