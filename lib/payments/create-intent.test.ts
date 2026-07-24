import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import type { PricingQuoteResult } from "@/lib/pricing/service";
import { isStripeConfigured } from "@/lib/payments/stripe";
import {
  parsePaymentRequest,
  quoteToCents,
  eurosToCents,
  buildIdempotencyKey,
  buildMetadata,
  createRidePaymentIntent,
  sanitizeError,
  type RideInput,
  type CreateIntentFn,
} from "@/lib/payments/create-intent";

// ── fixtures ──────────────────────────────────────────────────────────────────

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

function availableQuote(
  price: number,
  opts: { pickupSlug?: string; dropoffSlug?: string; label?: string | null; returnApplied?: boolean } = {}
): Extract<PricingQuoteResult, { available: true }> {
  return {
    available: true,
    source: "fixed_route_prices",
    price,
    singlePrice: price,
    returnPrice: opts.returnApplied ? price : null,
    returnApplied: Boolean(opts.returnApplied),
    currency: "EUR",
    vatRate: 21,
    distanceKm: 40,
    estimatedDurationMin: 45,
    vehicleClass: "executive-ev",
    route: {
      pickupSlug: opts.pickupSlug ?? "almere-centrum",
      dropoffSlug: opts.dropoffSlug ?? "schiphol",
      label: opts.label ?? null,
    },
    isAirportTransfer: true,
    airport: {
      pickupIsAirport: false,
      dropoffIsAirport: true,
      isAirportPickup: false,
      isAirportDropoff: true,
      isAirportTransfer: true,
      flightDirection: "departure",
    },
    dataSource: "supabase",
  };
}

const unavailableQuote: PricingQuoteResult = {
  available: false,
  reason: "unknown_location",
  message: "Offerte op aanvraag",
  airport: {
    pickupIsAirport: false,
    dropoffIsAirport: false,
    isAirportPickup: false,
    isAirportDropoff: false,
    isAirportTransfer: false,
    flightDirection: null,
  },
};

function rideInput(over: Partial<RideInput> = {}): RideInput {
  return {
    pickup: "Almere Centrum",
    dropoff: "Schiphol Airport",
    returnTrip: false,
    passengers: 2,
    locale: "nl",
    attempt: UUID_A,
    bookingReference: null,
    ...over,
  };
}

/** Mock die de doorgegeven params vastlegt en een fake PaymentIntent teruggeeft. */
function mockCreate(capture: { params?: Stripe.PaymentIntentCreateParams; options?: Stripe.RequestOptions }): CreateIntentFn {
  return async (params, options) => {
    capture.params = params;
    capture.options = options;
    return { id: "pi_test_123", client_secret: "pi_test_123_secret_abc", amount: params.amount ?? 0, currency: params.currency ?? "eur" };
  };
}

// ── 1 & 2. geldige enkele rit en retourrit ─────────────────────────────────────

test("1 · geldige enkele rit → ok, bedrag in centen, currency eur", async () => {
  const cap: Parameters<typeof mockCreate>[0] = {};
  const res = await createRidePaymentIntent({ input: rideInput(), quote: availableQuote(79), createIntent: mockCreate(cap) });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.amount, 7900);
  assert.equal(res.currency, "eur");
  assert.equal(res.clientSecret, "pi_test_123_secret_abc");
  assert.equal(res.paymentIntentId, "pi_test_123");
  assert.equal(cap.params?.amount, 7900);
  assert.equal(cap.params?.currency, "eur");
  assert.deepEqual(cap.params?.automatic_payment_methods, { enabled: true });
  assert.equal(cap.params?.metadata?.return_trip, "false");
});

test("2 · geldige retourrit → return_trip true in metadata", async () => {
  const cap: Parameters<typeof mockCreate>[0] = {};
  const res = await createRidePaymentIntent({
    input: rideInput({ returnTrip: true }),
    quote: availableQuote(150, { returnApplied: true }),
    createIntent: mockCreate(cap),
  });
  assert.equal(res.ok, true);
  assert.equal(cap.params?.metadata?.return_trip, "true");
  if (res.ok) assert.equal(res.amount, 15000);
});

// ── 3 & 4. locale ──────────────────────────────────────────────────────────────

test("3 · NL en EN locale worden geaccepteerd", () => {
  const nl = parsePaymentRequest({ pickup: "Almere", dropoff: "Schiphol", locale: "nl", attempt: UUID_A });
  const en = parsePaymentRequest({ pickup: "Almere", dropoff: "Schiphol", locale: "en", attempt: UUID_A });
  assert.equal(nl.ok && nl.value.locale, "nl");
  assert.equal(en.ok && en.value.locale, "en");
});

test("4 · ongeldige of ontbrekende locale → nl", () => {
  for (const loc of ["fr", "de", "", 123, undefined, null]) {
    const r = parsePaymentRequest({ pickup: "Almere", dropoff: "Schiphol", locale: loc, attempt: UUID_A });
    assert.equal(r.ok && r.value.locale, "nl", `locale=${String(loc)}`);
  }
});

// ── 5 & 6. ontbrekende/ongeldige velden ────────────────────────────────────────

test("5 · ontbrekende pickup/dropoff → 400-fout", () => {
  assert.equal(parsePaymentRequest({ dropoff: "Schiphol" }).ok, false);
  assert.equal(parsePaymentRequest({ pickup: "Almere" }).ok, false);
  assert.equal(parsePaymentRequest({ pickup: "ab", dropoff: "Schiphol" }).ok, false); // < 3 tekens
});

test("6 · ongeldige passengers → fout", () => {
  for (const p of [0, -1, 2.5, 9, "3"]) {
    assert.equal(parsePaymentRequest({ pickup: "Almere", dropoff: "Schiphol", passengers: p }).ok, false, `passengers=${String(p)}`);
  }
  assert.equal(parsePaymentRequest({ pickup: "Almere", dropoff: "Schiphol", passengers: 4, attempt: UUID_A }).ok, true);
});

// ── 7. onbekende route / geen quote ────────────────────────────────────────────

test("7 · geen beschikbare quote → invalid_quote (geen PaymentIntent)", async () => {
  let called = false;
  const res = await createRidePaymentIntent({
    input: rideInput(),
    quote: unavailableQuote,
    createIntent: async () => {
      called = true;
      return { id: "x", client_secret: "y", amount: 1, currency: "eur" };
    },
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, "invalid_quote");
  assert.equal(called, false, "Stripe mag niet zijn aangeroepen zonder geldige prijs");
});

// ── 8. client probeert eigen amount mee te sturen ──────────────────────────────

test("8 · client-amount/currency wordt expliciet geweigerd", () => {
  assert.equal(parsePaymentRequest({ pickup: "Almere", dropoff: "Schiphol", amount: 1 }).ok, false);
  assert.equal(parsePaymentRequest({ pickup: "Almere", dropoff: "Schiphol", currency: "usd" }).ok, false);
  assert.equal(parsePaymentRequest({ pickup: "Almere", dropoff: "Schiphol", price: 5 }).ok, false);
  assert.equal(parsePaymentRequest({ pickup: "Almere", dropoff: "Schiphol", payment_status: "paid" }).ok, false);
});

// ── 9. bedrag → centen ─────────────────────────────────────────────────────────

test("9 · euro's worden correct en float-veilig naar centen omgezet", () => {
  assert.equal(eurosToCents(79), 7900);
  assert.equal(eurosToCents(79.5), 7950);
  assert.equal(eurosToCents(79.99), 7999);
  assert.equal(eurosToCents(0.1), 10);
  assert.equal(eurosToCents(12.34), 1234);
  const q = quoteToCents(availableQuote(349));
  assert.equal(q.ok && q.amountCents, 34900);
  assert.equal(quoteToCents(availableQuote(0)).ok, false); // niet-positief
  assert.equal(quoteToCents(unavailableQuote).ok, false);
});

// ── 10 & 11. idempotency ───────────────────────────────────────────────────────

test("10 · idempotency-key is deterministisch voor dezelfde poging", () => {
  const a = buildIdempotencyKey(rideInput(), 7900, "eur");
  const b = buildIdempotencyKey(rideInput(), 7900, "eur");
  assert.equal(a, b);
  assert.match(a, /^t4xi_pi_[a-f0-9]{64}$/);
  assert.ok(a.length <= 255);
  // ongevoelig voor witruimte/casing in het adres (zelfde effectieve poging)
  assert.equal(buildIdempotencyKey(rideInput({ pickup: "  almere   centrum " }), 7900, "eur"),
    buildIdempotencyKey(rideInput({ pickup: "Almere Centrum" }), 7900, "eur"));
});

test("11 · verschillende ritdata → verschillende idempotency-key", () => {
  const base = buildIdempotencyKey(rideInput(), 7900, "eur");
  assert.notEqual(base, buildIdempotencyKey(rideInput({ dropoff: "Rotterdam" }), 7900, "eur"));
  assert.notEqual(base, buildIdempotencyKey(rideInput({ passengers: 3 }), 7900, "eur"));
  assert.notEqual(base, buildIdempotencyKey(rideInput({ returnTrip: true }), 7900, "eur"));
  assert.notEqual(base, buildIdempotencyKey(rideInput(), 8900, "eur")); // ander bedrag
  assert.notEqual(base, buildIdempotencyKey(rideInput({ attempt: UUID_B }), 7900, "eur")); // andere sessie
  // geen ruwe adrestekst in de key zelf (alleen de hash)
  assert.ok(!base.toLowerCase().includes("almere"));
});

// ── 12. Stripe-fout lekt geen secret of stacktrace ─────────────────────────────

test("12 · Stripe-fout wordt gesanitized (geen secret, geen stacktrace)", async () => {
  const err = new Error("Invalid API Key provided: sk_test_51ABCDEFsecretVALUE");
  const res = await createRidePaymentIntent({
    input: rideInput(),
    quote: availableQuote(79),
    createIntent: async () => {
      throw err;
    },
  });
  assert.equal(res.ok, false);
  if (res.ok || res.code !== "stripe_error") return assert.fail("verwacht stripe_error");
  assert.ok(!res.detail.includes("sk_test_51ABCDEFsecretVALUE"), "secret mag niet lekken");
  assert.ok(res.detail.includes("sk_[redacted]"));
  assert.ok(!/\n\s*at\s/.test(res.detail), "geen stacktrace-regels");
  // directe sanitizer-check
  assert.equal(sanitizeError(new Error("whsec_ABC123 leaked")), "whsec_[redacted] leaked");
});

// ── 13. Stripe niet geconfigureerd ─────────────────────────────────────────────

test("13 · isStripeConfigured is false zonder STRIPE_SECRET_KEY", () => {
  const prev = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  assert.equal(isStripeConfigured(), false);
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  assert.equal(isStripeConfigured(), true);
  if (prev === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = prev;
});

// ── 14. metadata bevat geen persoonsgegevens ───────────────────────────────────

test("14 · metadata bevat geen e-mail/telefoon en gebruikt slugs, niet ruwe adressen", () => {
  const md = buildMetadata(rideInput({ pickup: "Gustav Mahlerlaan 10, Amsterdam" }), availableQuote(79, { label: "Almere → Schiphol" }));
  const values = Object.values(md).join(" | ");
  assert.ok(!values.includes("@"), "geen e-mail");
  assert.ok(!/\+?\d[\d\s-]{7,}\d/.test(values), "geen telefoonnummer");
  assert.equal(md.pickup, "almere-centrum"); // slug, niet het ruwe adres
  assert.ok(!values.includes("Mahlerlaan"), "geen ruw adres in metadata");
  // alleen de verwachte, veilige keys
  const allowed = new Set(["pickup", "dropoff", "return_trip", "passengers", "locale", "amount_source", "route_label", "booking_reference"]);
  for (const k of Object.keys(md)) assert.ok(allowed.has(k), `onverwachte metadata-key: ${k}`);
  assert.equal("booking_reference" in md, false); // niet meegegeven → afwezig

  const md2 = buildMetadata(rideInput({ bookingReference: "T4-AB12CD" }), availableQuote(79));
  assert.equal(md2.booking_reference, "T4-AB12CD");
});

// ── extra: bookingReference-formaatvalidatie ───────────────────────────────────

test("bookingReference: alleen geldig formaat wordt bewaard, rest genegeerd", () => {
  const good = parsePaymentRequest({ pickup: "Almere", dropoff: "Schiphol", bookingReference: "T4-AB12CD", attempt: UUID_A });
  assert.equal(good.ok && good.value.bookingReference, "T4-AB12CD");
  const bad = parsePaymentRequest({ pickup: "Almere", dropoff: "Schiphol", bookingReference: "'; DROP TABLE bookings;--", attempt: UUID_A });
  assert.equal(bad.ok && bad.value.bookingReference, null);
});

// ── attempt (verplichte per-sessie UUID) ───────────────────────────────────────

test("attempt · ontbrekend → 400 (generieke fout)", () => {
  const r = parsePaymentRequest({ pickup: "Almere", dropoff: "Schiphol" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, "Ongeldige aanvraag.");
});

test("attempt · ongeldig formaat → 400", () => {
  for (const att of ["not-a-uuid", "123", "sess-2", "11111111-1111-1111-1111-111111111111", "", 42, null]) {
    const r = parsePaymentRequest({ pickup: "Almere", dropoff: "Schiphol", attempt: att });
    assert.equal(r.ok, false, `attempt=${String(att)}`);
  }
});

test("attempt · geldige UUID wordt genormaliseerd (lowercase) en bewaard", () => {
  const r = parsePaymentRequest({ pickup: "Almere", dropoff: "Schiphol", attempt: UUID_A.toUpperCase() });
  assert.equal(r.ok && r.value.attempt, UUID_A);
});

test("attempt · zelfde poging → zelfde key; verschillende geldige pogingen → verschillende keys", () => {
  const a1 = parsePaymentRequest({ pickup: "Almere Centrum", dropoff: "Schiphol", passengers: 2, attempt: UUID_A });
  const a2 = parsePaymentRequest({ pickup: "Almere Centrum", dropoff: "Schiphol", passengers: 2, attempt: UUID_A });
  const b = parsePaymentRequest({ pickup: "Almere Centrum", dropoff: "Schiphol", passengers: 2, attempt: UUID_B });
  assert.ok(a1.ok && a2.ok && b.ok);
  if (!a1.ok || !a2.ok || !b.ok) return;
  const k1 = buildIdempotencyKey(a1.value, 7900, "eur");
  const k2 = buildIdempotencyKey(a2.value, 7900, "eur");
  const k3 = buildIdempotencyKey(b.value, 7900, "eur");
  assert.equal(k1, k2, "zelfde attempt + data → zelfde key (retry-dedup)");
  assert.notEqual(k1, k3, "andere sessie-UUID → andere key (geen samenvoeging tussen klanten)");
});
