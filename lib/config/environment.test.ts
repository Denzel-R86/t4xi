import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getAppEnv,
  isProductionEnv,
  stripeKeyMode,
  assertStripeEnvironment,
  extractSupabaseRef,
  assertSupabaseNotProductionInNonProd,
  assertSafeEnvironment,
  PRODUCTION_SUPABASE_REF,
  type AppEnv,
} from "@/lib/config/environment";

// Uitsluitend SYNTHETISCHE sleutels — nooit echte Stripe- of service-role-keys.
const SK_TEST = "sk_test_SYNTHETIC000";
const SK_LIVE = "sk_live_SYNTHETIC000";
const PK_TEST = "pk_test_SYNTHETIC000";
const PK_LIVE = "pk_live_SYNTHETIC000";
const SERVICE_ROLE = "service_role_SYNTHETIC_should_never_appear";

const PROD_URL = `https://${PRODUCTION_SUPABASE_REF}.supabase.co`;
const STAGING_URL = "https://stagingref123.supabase.co";

// ── omgevingsdetectie ──────────────────────────────────────────────────────────

test("APP_ENV is leidend boven NODE_ENV (staging draait NODE_ENV=production)", () => {
  assert.equal(getAppEnv({ APP_ENV: "staging", NODE_ENV: "production" }), "staging");
  assert.equal(getAppEnv({ APP_ENV: "prod" }), "production");
  assert.equal(getAppEnv({ NEXT_PUBLIC_APP_ENV: "staging" }), "staging");
  assert.equal(getAppEnv({ NODE_ENV: "production" }), "production"); // fallback
  assert.equal(getAppEnv({ NODE_ENV: "test" }), "development"); // test => niet-productie
  assert.equal(getAppEnv({}), "development");
  assert.equal(isProductionEnv({ APP_ENV: "staging", NODE_ENV: "production" }), false);
  assert.equal(isProductionEnv({ NODE_ENV: "production" }), true);
});

test("stripeKeyMode herkent test/live/onbekend voor sk/pk/rk", () => {
  assert.equal(stripeKeyMode(SK_TEST), "test");
  assert.equal(stripeKeyMode(PK_TEST), "test");
  assert.equal(stripeKeyMode("rk_test_x"), "test");
  assert.equal(stripeKeyMode(SK_LIVE), "live");
  assert.equal(stripeKeyMode(PK_LIVE), "live");
  assert.equal(stripeKeyMode(""), "unknown");
  assert.equal(stripeKeyMode(undefined), "unknown");
  assert.equal(stripeKeyMode("whsec_x"), "unknown");
});

// ── Guard-matrix (14 afgesproken gevallen) ──────────────────────────────────────

test("1 · staging + productie Supabase-ref → reject", () => {
  assert.throws(
    () => assertSupabaseNotProductionInNonProd("staging", PROD_URL),
    new RegExp(PRODUCTION_SUPABASE_REF)
  );
});

test("2 · development + productie Supabase-ref → reject (payment environment)", () => {
  assert.throws(
    () => assertSupabaseNotProductionInNonProd("development", PROD_URL),
    new RegExp(PRODUCTION_SUPABASE_REF)
  );
});

test("3 · staging + sk_live → reject", () => {
  assert.throws(() => assertStripeEnvironment("staging", SK_LIVE, PK_TEST), /Unsafe Stripe environment configuration\./);
});

test("4 · staging + pk_live → reject", () => {
  assert.throws(() => assertStripeEnvironment("staging", SK_TEST, PK_LIVE), /Unsafe Stripe environment configuration\./);
});

test("5 · production + sk_test → reject", () => {
  assert.throws(() => assertStripeEnvironment("production", SK_TEST, PK_LIVE), /Unsafe Stripe environment configuration\./);
});

test("6 · production + pk_test → reject", () => {
  assert.throws(() => assertStripeEnvironment("production", SK_LIVE, PK_TEST), /Unsafe Stripe environment configuration\./);
});

test("7 · sk_test + pk_live → reject (mode-mismatch)", () => {
  for (const env of ["development", "staging", "production"] as AppEnv[]) {
    assert.throws(() => assertStripeEnvironment(env, SK_TEST, PK_LIVE), /Unsafe Stripe environment configuration\./, `env=${env}`);
  }
});

test("8 · sk_live + pk_test → reject (mode-mismatch)", () => {
  for (const env of ["development", "staging", "production"] as AppEnv[]) {
    assert.throws(() => assertStripeEnvironment(env, SK_LIVE, PK_TEST), /Unsafe Stripe environment configuration\./, `env=${env}`);
  }
});

test("9 · staging + test/test + staging Supabase → pass", () => {
  assert.doesNotThrow(() =>
    assertSafeEnvironment({ APP_ENV: "staging", STRIPE_SECRET_KEY: SK_TEST, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: PK_TEST, NEXT_PUBLIC_SUPABASE_URL: STAGING_URL })
  );
});

test("10 · development + test/test + non-prod Supabase → pass", () => {
  assert.doesNotThrow(() =>
    assertSafeEnvironment({ APP_ENV: "development", STRIPE_SECRET_KEY: SK_TEST, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: PK_TEST, NEXT_PUBLIC_SUPABASE_URL: STAGING_URL })
  );
});

test("11 · production + live/live + productie Supabase → pass", () => {
  assert.doesNotThrow(() =>
    assertSafeEnvironment({ APP_ENV: "production", STRIPE_SECRET_KEY: SK_LIVE, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: PK_LIVE, NEXT_PUBLIC_SUPABASE_URL: PROD_URL })
  );
});

test("12 · errors bevatten geen volledige Stripe-sleutels", () => {
  for (const [sk, pk, env] of [
    [SK_LIVE, PK_TEST, "staging"],
    [SK_TEST, PK_LIVE, "production"],
  ] as [string, string, AppEnv][]) {
    try {
      assertStripeEnvironment(env, sk, pk);
      assert.fail("verwacht een fout");
    } catch (e) {
      const msg = (e as Error).message;
      assert.ok(!msg.includes(sk), "secret key mag niet in de melding staan");
      assert.ok(!msg.includes(pk), "publishable key mag niet in de melding staan");
      assert.ok(!msg.includes("sk_"), "geen sk_-materiaal in de melding");
      assert.ok(!msg.includes("pk_"), "geen pk_-materiaal in de melding");
      assert.equal(msg, "Unsafe Stripe environment configuration.");
    }
  }
});

test("13 · errors bevatten geen service-role key", () => {
  try {
    assertSafeEnvironment({
      APP_ENV: "staging",
      STRIPE_SECRET_KEY: SK_LIVE,
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: PK_LIVE,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE,
      NEXT_PUBLIC_SUPABASE_URL: STAGING_URL,
    });
    assert.fail("verwacht een fout");
  } catch (e) {
    const msg = (e as Error).message;
    assert.ok(!msg.includes(SERVICE_ROLE), "service-role key mag nooit in een melding staan");
    assert.ok(!msg.includes("service_role"), "geen service_role-materiaal in de melding");
  }
});

test("14 · ontbrekende env veroorzaakt geen (build-time) crash", () => {
  // Volledig lege env: geen sleutels, geen URL → guard mag niet gooien.
  assert.doesNotThrow(() => assertSafeEnvironment({}));
  assert.doesNotThrow(() => assertStripeEnvironment("production", undefined, undefined));
  assert.doesNotThrow(() => assertStripeEnvironment("staging", "", ""));
  // Eén sleutel aanwezig maar passend, andere afwezig → geen crash.
  assert.doesNotThrow(() => assertStripeEnvironment("staging", SK_TEST, undefined));
  assert.doesNotThrow(() => assertStripeEnvironment("production", undefined, PK_LIVE));
});

// ── aanvullende happy-path en Supabase-randen ───────────────────────────────────

test("Supabase: staging-ref toegestaan; productie-ref in productie toegestaan", () => {
  assert.doesNotThrow(() => assertSupabaseNotProductionInNonProd("staging", STAGING_URL));
  assert.doesNotThrow(() => assertSupabaseNotProductionInNonProd("production", PROD_URL));
  assert.equal(extractSupabaseRef(PROD_URL), PRODUCTION_SUPABASE_REF);
  assert.equal(extractSupabaseRef("not-a-url"), null);
});
