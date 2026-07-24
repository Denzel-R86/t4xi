import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import {
  parsePaymentRequest,
  bookingToAmount,
  eurosToCents,
  buildIdempotencyKey,
  buildMetadata,
  createBookingPaymentIntent,
  sanitizeError,
  type BookingForPayment,
  type CreateIntentFn,
  type LinkBookingFn,
} from "@/lib/payments/create-intent";

const BID = "11111111-1111-4111-8111-111111111111"; // interne booking UUID (capability)
const BID_B = "22222222-2222-4222-8222-222222222222";
const REF = "T4XI-2026-1000"; // publieke, sequentiële referentie (GEEN capability)
const okBooking: BookingForPayment = { bookingId: BID, bookingRef: REF, priceEuros: 79, paymentStatus: "pending", stripePaymentIntentId: null };

function mockCreate(cap: { params?: Stripe.PaymentIntentCreateParams; options?: Stripe.RequestOptions }): CreateIntentFn {
  return async (params, options) => {
    cap.params = params;
    cap.options = options;
    return { id: "pi_test_1", client_secret: "pi_test_1_secret", amount: params.amount ?? 0, currency: params.currency ?? "eur" };
  };
}
const noopLink: LinkBookingFn = async () => {};

// ── parsing: booking_id (UUID) is de capability, booking_ref niet ──────────────

test("parse · geldige booking_id (UUID) + locale", () => {
  const r = parsePaymentRequest({ bookingId: BID.toUpperCase(), locale: "en" });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.bookingId, BID); // genormaliseerd naar lowercase
    assert.equal(r.value.locale, "en");
  }
});

test("parse · sequentiële booking_ref of niet-UUID → geweigerd", () => {
  for (const id of [REF, "T4XI-2026-1000", "not-a-uuid", "123", "", undefined, 123, BID.replace(/-/g, "")]) {
    assert.equal(parsePaymentRequest({ bookingId: id }).ok, false, `id=${String(id)}`);
  }
});

test("parse · client-amount/currency/status wordt geweigerd", () => {
  assert.equal(parsePaymentRequest({ bookingId: BID, amount: 1 }).ok, false);
  assert.equal(parsePaymentRequest({ bookingId: BID, currency: "usd" }).ok, false);
  assert.equal(parsePaymentRequest({ bookingId: BID, payment_status: "paid" }).ok, false);
});

test("parse · ongeldige/ontbrekende locale → nl", () => {
  for (const loc of ["fr", "", undefined]) {
    const r = parsePaymentRequest({ bookingId: BID, locale: loc });
    assert.equal(r.ok && r.value.locale, "nl");
  }
});

// ── bedrag uit opgeslagen boekingsprijs (authority) ─────────────────────────

test("bookingToAmount · prijs → centen; paid/canceled/geen prijs → geweigerd", () => {
  assert.deepEqual(bookingToAmount(okBooking), { ok: true, amountCents: 7900, currency: "eur" });
  assert.deepEqual(bookingToAmount({ ...okBooking, priceEuros: 349 }), { ok: true, amountCents: 34900, currency: "eur" });
  assert.equal(bookingToAmount({ ...okBooking, paymentStatus: "paid" }).ok, false);
  assert.equal(bookingToAmount({ ...okBooking, paymentStatus: "canceled" }).ok, false);
  assert.equal(bookingToAmount({ ...okBooking, priceEuros: null }).ok, false);
  assert.equal(bookingToAmount({ ...okBooking, priceEuros: 0 }).ok, false);
});

test("eurosToCents · float-veilig", () => {
  assert.equal(eurosToCents(79), 7900);
  assert.equal(eurosToCents(79.99), 7999);
  assert.equal(eurosToCents(12.34), 1234);
});

// ── idempotency (per booking_id + bedrag) ───────────────────────────────────

test("idempotency · deterministisch per booking_id+bedrag, geen PII in de key", () => {
  const a = buildIdempotencyKey(BID, 7900);
  assert.equal(a, buildIdempotencyKey(BID, 7900));
  assert.match(a, /^t4xi_pi_[a-f0-9]{64}$/);
  assert.ok(a.length <= 255);
  assert.notEqual(a, buildIdempotencyKey(BID_B, 7900));
  assert.notEqual(a, buildIdempotencyKey(BID, 8900));
});

// ── metadata ────────────────────────────────────────────────────────────────

test("metadata · booking_ref (operationeel) + locale + bron; geen PII", () => {
  const md = buildMetadata(REF, "nl");
  assert.equal(md.booking_ref, REF);
  assert.equal(md.locale, "nl");
  assert.equal(md.amount_source, "server_stored_booking_price");
  assert.deepEqual(Object.keys(md).sort(), ["amount_source", "booking_ref", "locale"]);
  assert.ok(!Object.values(md).join(" ").includes("@"));
});

// ── orkestratie ─────────────────────────────────────────────────────────────

test("createBookingPaymentIntent · succes → koppelt via booking_id, gebruikt serverbedrag", async () => {
  const cap: Parameters<typeof mockCreate>[0] = {};
  let linked: unknown = null;
  const res = await createBookingPaymentIntent({
    input: { bookingId: BID, locale: "nl" },
    booking: okBooking,
    createIntent: mockCreate(cap),
    linkBooking: async (args) => { linked = args; },
  });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.amount, 7900);
  assert.equal(res.currency, "eur");
  assert.equal(cap.params?.amount, 7900);
  // de link gebruikt het SERVER-opgezochte booking_id, nooit een clientwaarde
  assert.deepEqual(linked, { bookingId: BID, paymentIntentId: "pi_test_1", amountCents: 7900, currency: "eur" });
});

test("createBookingPaymentIntent · al betaald → invalid_booking, Stripe niet aangeroepen", async () => {
  let called = false;
  const res = await createBookingPaymentIntent({
    input: { bookingId: BID, locale: "nl" },
    booking: { ...okBooking, paymentStatus: "paid" },
    createIntent: async () => { called = true; return { id: "x", client_secret: "y", amount: 1, currency: "eur" }; },
    linkBooking: noopLink,
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, "invalid_booking");
  assert.equal(called, false);
});

test("createBookingPaymentIntent · Stripe-fout gesanitized (geen secret/stacktrace)", async () => {
  const res = await createBookingPaymentIntent({
    input: { bookingId: BID, locale: "nl" },
    booking: okBooking,
    createIntent: async () => { throw new Error("Invalid API Key: sk_test_51ABCDEFsecret"); },
    linkBooking: noopLink,
  });
  assert.equal(res.ok, false);
  if (res.ok || res.code !== "stripe_error") return assert.fail("verwacht stripe_error");
  assert.ok(!res.detail.includes("sk_test_51ABCDEFsecret"));
  assert.ok(res.detail.includes("sk_[redacted]"));
  assert.ok(!/\n\s*at\s/.test(res.detail));
});

test("createBookingPaymentIntent · link-fout → link_error (geen paid-claim, geen betaling starten)", async () => {
  const res = await createBookingPaymentIntent({
    input: { bookingId: BID, locale: "nl" },
    booking: okBooking,
    createIntent: mockCreate({}),
    linkBooking: async () => { throw new Error("link_booking_payment: boom"); },
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, "link_error");
});

test("idempotency · retry met dezelfde booking+bedrag → dezelfde Stripe idempotency-key (geen orphan-storm)", () => {
  // Zelfde poging → zelfde key → Stripe replay geeft dezelfde PaymentIntent terug.
  assert.equal(buildIdempotencyKey(BID, 7900), buildIdempotencyKey(BID, 7900));
});

test("sanitizeError · redigeert key-patronen", () => {
  assert.equal(sanitizeError(new Error("whsec_ABC123 leaked")), "whsec_[redacted] leaked");
});
