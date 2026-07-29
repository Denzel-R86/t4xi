import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Stripe } from "@stripe/stripe-js";
import { createStripeLoader } from "@/lib/payments/stripe-client";
import {
  buildCreateIntentBody,
  mapCreateIntentError,
  mapStripeError,
  paymentReducer,
  initialPaymentState,
  canSubmitPayment,
  isBusy,
  elementsLocale,
  formatAmount,
  mapServerStatus,
  POLL_INTERVAL_MS,
  POLL_MAX_MS,
  type PaymentIntentInfo,
  type PaymentState,
} from "@/lib/payments/payment-flow";

const intent: PaymentIntentInfo = { clientSecret: "pi_1_secret_x", paymentIntentId: "pi_1", amount: 7900, currency: "eur" };
const RIDE = { pickup: "Almere", dropoff: "Schiphol", returnTrip: true, passengers: 2, locale: "nl" as const, bookingId: "11111111-1111-4111-8111-111111111111" };
const ready: PaymentState = { status: "ready", intent, error: null };
const processing: PaymentState = { status: "processing", intent, error: null };

const paymentStepSrc = readFileSync("components/booking/PaymentStep.tsx", "utf8");
const bookingSrc = readFileSync("components/booking/BookingSection.tsx", "utf8");
const flowSrc = readFileSync("lib/payments/payment-flow.ts", "utf8");
const nl = JSON.parse(readFileSync("messages/nl.json", "utf8")).betaling;
const en = JSON.parse(readFileSync("messages/en.json", "utf8")).betaling;
const nlBooking = JSON.parse(readFileSync("messages/nl.json", "utf8")).booking;
const enBooking = JSON.parse(readFileSync("messages/en.json", "utf8")).booking;

// ── 1. Stripe client initialiseert één keer ────────────────────────────────────

test("1 · getStripe/loader initialiseert loadStripe maximaal één keer", async () => {
  let calls = 0;
  const loader = createStripeLoader(async () => { calls++; return null as unknown as Stripe; }, () => "pk_test_x", false);
  await loader();
  await loader();
  await loader();
  assert.equal(calls, 1);
});

// ── 2. ontbrekende publishable key ─────────────────────────────────────────────

test("2 · ontbrekende publishable key: dev rejecteert, prod resolvet null zonder init", async () => {
  const dev = createStripeLoader(async () => null, () => undefined, false);
  await assert.rejects(dev(), /NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY/);
  let calls = 0;
  const prod = createStripeLoader(async () => { calls++; return null; }, () => undefined, true);
  assert.equal(await prod(), null);
  assert.equal(calls, 0);
});

// ── 4. create-intent request: geen amount/ritdata, wel booking_ref + locale ─────

test("4 · create-intent body bevat geen amount/ritdata/booking_ref, wel booking_id + locale", () => {
  const body = buildCreateIntentBody(RIDE);
  for (const k of ["amount", "currency", "price", "pickup", "dropoff", "returnTrip", "passengers", "bookingReference"]) {
    assert.equal(k in body, false, `${k} mag niet in de body`);
  }
  assert.equal(body.bookingId, "11111111-1111-4111-8111-111111111111");
  assert.equal(body.locale, "nl");
});

// ── 5. server response amount wordt in UI gebruikt ─────────────────────────────

test("5 · het serverbedrag uit create-intent wordt bewaard en getoond (geen clientbedrag)", () => {
  const s = paymentReducer(initialPaymentState, { type: "createSuccess", intent });
  assert.equal(s.status, "ready");
  assert.equal(s.intent?.amount, 7900);
  assert.equal(s.intent?.currency, "eur");
  // Strip alle spaties (incl. nbsp die nl-NL tussen € en bedrag zet).
  const norm = (v: string) => v.replace(/\s/g, "");
  assert.equal(norm(formatAmount(s.intent!.amount, s.intent!.currency, "nl")), "€79,00");
  assert.equal(norm(formatAmount(s.intent!.amount, s.intent!.currency, "en")), "€79.00");
});

// ── 6 & 7. locale nl/en ────────────────────────────────────────────────────────

test("6/7 · locale nl en en worden doorgegeven en naar Elements gemapt", () => {
  assert.equal(buildCreateIntentBody({ ...RIDE, locale: "nl" }).locale, "nl");
  assert.equal(buildCreateIntentBody({ ...RIDE, locale: "en" }).locale, "en");
  assert.equal(elementsLocale("nl"), "nl");
  assert.equal(elementsLocale("en"), "en");
});

// ── 8 & 9. submit disabled tijdens processing + geen dubbele submit ─────────────

test("8 · tijdens processing is submit uitgeschakeld en is de flow bezig", () => {
  assert.equal(canSubmitPayment(processing), false);
  assert.equal(isBusy(processing), true);
  assert.equal(canSubmitPayment(ready), true);
  assert.equal(isBusy(ready), false);
});

test("9 · dubbele submit wordt voorkomen (confirmStart is idempotent tijdens processing)", () => {
  const first = paymentReducer(ready, { type: "confirmStart" });
  assert.equal(first.status, "processing");
  const second = paymentReducer(first, { type: "confirmStart" });
  assert.equal(second.status, "processing");
  assert.deepEqual(second, first); // geen tweede transitie
  // confirmStart zonder intent doet niets
  assert.equal(paymentReducer(initialPaymentState, { type: "confirmStart" }).status, "idle");
});

// ── 10/11/12. create-intent 400 / 429 / 503 ────────────────────────────────────

test("10/11/12 · HTTP-statussen mappen naar veilige generieke copy-keys", () => {
  assert.equal(mapCreateIntentError(400), "startFailed");
  assert.equal(mapCreateIntentError(429), "rateLimited");
  assert.equal(mapCreateIntentError(503), "unavailable");
  assert.equal(mapCreateIntentError(502), "startFailed");
});

// ── 13. Stripe confirmPayment error ────────────────────────────────────────────

test("13 · Stripe-fout → terug naar ready met stripe-fout; type bepaalt de copy", () => {
  assert.equal(mapStripeError("card_error"), "checkDetails");
  assert.equal(mapStripeError("validation_error"), "checkDetails");
  assert.equal(mapStripeError("api_error"), "couldNotComplete");
  assert.equal(mapStripeError(undefined), "couldNotComplete");
  const s = paymentReducer(processing, { type: "confirmError", messageKey: "checkDetails" });
  assert.equal(s.status, "ready");
  assert.equal(s.error?.kind, "stripe");
  assert.equal(s.error?.messageKey, "checkDetails");
  assert.equal(s.intent?.clientSecret, "pi_1_secret_x"); // intent behouden voor retry
});

// ── 14. successful confirmPayment → pending-confirmation ───────────────────────

test("14 · geslaagde confirm → pending (geen definitieve bevestiging)", () => {
  const s = paymentReducer(processing, { type: "confirmPending" });
  assert.equal(s.status, "pending");
  assert.equal(s.error, null);
});

// ── 15. UI claimt nergens definitieve server-side bevestiging ──────────────────

test("15 · pending-copy is neutraal; definitieve claim alleen in de 'confirmed'-tak", () => {
  assert.doesNotMatch(nl.pending, /bevestigd\b/i);
  assert.doesNotMatch(en.pending, /\bconfirmed\b/i);
  assert.match(nl.pending, /controleren/i);
  assert.match(en.pending, /confirming/i);
  // "confirmed" komt in de component alleen voor als de server-gereconcilieerde
  // status (stap 7.5), niet als losse client-side claim.
  assert.doesNotMatch(paymentStepSrc, /definitief bevestigd/i);
  assert.match(paymentStepSrc, /state\.status === "confirmed"/);
});

// ── 16. clientSecret wordt niet gelogd ─────────────────────────────────────────

test("16 · geen console-logging in de betaalcomponent of flow (clientSecret lekt niet)", () => {
  assert.doesNotMatch(paymentStepSrc, /console\./);
  assert.doesNotMatch(flowSrc, /console\./);
});

// ── 17. payment method fields worden niet door eigen code verwerkt ─────────────

test("17 · uitsluitend Stripe PaymentElement; geen eigen kaartveld-afhandeling", () => {
  assert.match(paymentStepSrc, /<PaymentElement/);
  assert.doesNotMatch(paymentStepSrc, /card[_-]?number|cardnumber|\bcvc\b|\bcvv\b|expiry|autocomplete="cc-/i);
});

// ── 15b. gewijzigde ritdata kan geen stale betaalstatus hergebruiken ───────────

test("15b · BookingSection reset een geslaagde boeking zodra prijsbepalende ritdata wijzigt", () => {
  // Effect dat succes → idle zet bij wijziging van pickup/dropoff/tab/persons.
  assert.match(bookingSrc, /setSubmit\(\(s\) => \(s\.status === "success" \? \{ status: "idle" \}/);
  assert.match(bookingSrc, /\}, \[pickup\?\.label, dropoff\?\.label, tab, persons\]\)/);
});

// ── 16b. success-copy is compatibel met "betaling nog openstaand" ──────────────

test("16b · booking-success intro claimt geen definitieve bevestiging bij openstaande betaling", () => {
  assert.ok(nlBooking.succesBetaalIntro && enBooking.succesBetaalIntro, "succesBetaalIntro moet bestaan");
  // geen definitieve claim
  assert.doesNotMatch(nlBooking.succesBetaalIntro, /\bbevestigd\b/i);
  assert.doesNotMatch(enBooking.succesBetaalIntro, /\bconfirmed\b/i);
  // benoemt de openstaande betaling
  assert.match(nlBooking.succesBetaalIntro, /betaling/i);
  assert.match(enBooking.succesBetaalIntro, /payment/i);
  // de vaste-prijs-tak gebruikt deze intro, niet de oude "wij bevestigen"-copy
  assert.match(bookingSrc, /submit\.quoteOnRequest \? t\("succesOpAanvraag"\) : t\("succesBetaalIntro"\)/);
});

// ── stap 7.5: reconciliation / polling ─────────────────────────────────────────

const pending: PaymentState = { status: "pending", intent, error: null };

test("R1 · server payment_status → reconciliation-uitkomst", () => {
  assert.equal(mapServerStatus("paid"), "confirmed");
  assert.equal(mapServerStatus("failed"), "failed");
  assert.equal(mapServerStatus("canceled"), "canceled");
  for (const s of ["unpaid", "pending", "processing", "", "weird"]) {
    assert.equal(mapServerStatus(s), "keep", `status=${s}`);
  }
});

test("R2 · reducer: server-uitkomsten vanuit pending", () => {
  assert.equal(paymentReducer(pending, { type: "serverConfirmed" }).status, "confirmed");
  assert.equal(paymentReducer(pending, { type: "serverFailed" }).status, "failed");
  assert.equal(paymentReducer(pending, { type: "serverCanceled" }).status, "canceled");
  assert.equal(paymentReducer(pending, { type: "pollTimeout" }).status, "unconfirmed");
  // bedrag blijft bewaard voor de bevestigingsweergave
  assert.equal(paymentReducer(pending, { type: "serverConfirmed" }).intent?.amount, 7900);
});

test("R3 · retryPayment na failed → terug naar ready (zelfde intent)", () => {
  const failed = paymentReducer(pending, { type: "serverFailed" });
  const back = paymentReducer(failed, { type: "retryPayment" });
  assert.equal(back.status, "ready");
  assert.equal(back.intent?.clientSecret, "pi_1_secret_x");
});

test("R4 · polling is begrensd (geen oneindige polling)", () => {
  assert.ok(POLL_INTERVAL_MS >= 1000 && POLL_INTERVAL_MS <= 5000);
  assert.ok(POLL_MAX_MS >= 20000 && POLL_MAX_MS <= 90000);
  assert.ok(POLL_MAX_MS / POLL_INTERVAL_MS <= 40); // eindig aantal polls
});

test("R5 · alleen 'confirmed' toont een definitieve betaalclaim in de UI", () => {
  // de confirmed-copy verschijnt uitsluitend in de status==='confirmed'-tak
  assert.match(paymentStepSrc, /state\.status === "confirmed"[\s\S]{0,400}confirmedKop/);
  // pending blijft neutraal (geen definitieve claim)
  assert.doesNotMatch(nl.pending, /\bbevestigd\b/i);
  assert.doesNotMatch(en.pending, /\bconfirmed\b/i);
  // confirmed-copy bestaat in beide talen
  assert.ok(nl.confirmedKop && en.confirmedKop && nl.confirmedBody.includes("{amount}") && en.confirmedBody.includes("{amount}"));
});

test("R6 · geen Stripe redirect-params als autoriteit; server-status wordt gepolld", () => {
  assert.match(paymentStepSrc, /\/api\/payments\/status\?bookingId=/);
  assert.doesNotMatch(paymentStepSrc, /redirect_status|payment_intent_client_secret|searchParams\.get\(/);
});

test("R7 · getoond bedrag komt uit de server-intent (geen clientbedrag)", () => {
  // confirmedBody interpoleert het serverbedrag uit state.intent
  assert.match(paymentStepSrc, /confirmedBody",\s*\{ amount: formatAmount\(state\.intent/);
  const norm = (v: string) => v.replace(/\s/g, "");
  assert.equal(norm(formatAmount(7900, "eur", "nl")), "€79,00");
  assert.equal(norm(formatAmount(7900, "eur", "en")), "€79.00");
});
