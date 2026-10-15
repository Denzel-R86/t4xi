/**
 * S1 — de secret-patronen van scripts/scan-build-secrets.ts zelf (bekende
 * positieven/negatieven). De scan op de echte build draait na `npm run build`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { publicEnvNamesInSource, scanPublicEnv, scanText } from "@/lib/security/secret-scan";

const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (role: string) => `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ iss: "supabase", role })}.abcdefghijklmnopqrstuvwx`;
// Opgebouwd uit delen zodat dit testbestand zelf geen scanner-treffer is.
const fake = (...parts: string[]) => parts.join("");

test("bekende geheimen worden gevonden", () => {
  const cases: [string, string][] = [
    [fake("sk_", "live_", "a".repeat(24)), "stripe-secret-key"],
    [fake("sk_", "test_", "b".repeat(24)), "stripe-secret-key"],
    [fake("rk_", "live_", "c".repeat(24)), "stripe-secret-key"],
    [fake("whsec_", "d".repeat(32)), "stripe-webhook-secret"],
    [fake("SUPABASE_", "SERVICE_ROLE_KEY"), "supabase-service-name"],
    [fake("service", "_role"), "service_role"],
    [fake("-----BEGIN ", "PRIVATE KEY-----"), "private-key-block"],
    [fake("-----BEGIN RSA ", "PRIVATE KEY-----"), "private-key-block"],
    [fake("AKIA", "ABCDEFGHIJKLMNOP"), "aws-access-key-id"],
    [fake("AIza", "S".repeat(35)), "google-api-key"],
    [fake("ghp_", "e".repeat(36)), "github-token"],
    [fake("re_", "abcdefgh_", "f".repeat(20)), "resend-api-key"],
    [fake("sk", "g".repeat(80)), "sanity-token"],
    [jwt(fake("service", "_role")), "jwt-role-service_role"],
  ];
  for (const [secret, pattern] of cases) {
    const hits = scanText(`var a="${secret}";`, "x.js");
    assert.ok(hits.some((h) => h.pattern === pattern), `${pattern} niet gevonden`);
    if (secret.length > 20) for (const h of hits) assert.ok(!h.excerpt.includes(secret.slice(12)), "rapport toont het volledige geheim");
  }
});

test("publieke waarden zijn geen treffer", () => {
  for (const value of [
    "pk_live_51Habcdefghijklmnopqrstuvwxyz",
    "pk_test_offline_fixture_not_a_real_key",
    jwt("anon"),
    "https://abcdefgh.supabase.co",
    "95pzjxjq",
    "risk_level", "task_test_case",
  ]) {
    assert.deepEqual(scanText(`x("${value}")`, "x.js"), [], value);
  }
});

test("NEXT_PUBLIC_: geheim-achtige naam of waarde faalt, publieke niet", () => {
  assert.deepEqual(scanPublicEnv({
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_x",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anon"),
    NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
    NEXT_PUBLIC_SANITY_PROJECT_ID: "95pzjxjq",
    STRIPE_SECRET_KEY: fake("sk_", "live_", "a".repeat(24)),
  }), []);
  const bad = scanPublicEnv({
    [fake("NEXT_PUBLIC_", "SUPABASE_SERVICE_ROLE_KEY")]: "",
    NEXT_PUBLIC_STRIPE_KEY: fake("sk_", "live_", "a".repeat(24)),
    NEXT_PUBLIC_RESEND_API_KEY: "x",
  });
  assert.deepEqual(bad.map((f) => f.pattern).sort(), ["secret-like-public-name", "secret-like-public-name", "stripe-secret-key"]);
});

test("NEXT_PUBLIC_-namen uit broncode", () => {
  assert.deepEqual(publicEnvNamesInSource("process.env.NEXT_PUBLIC_A; process.env.SECRET; process.env.NEXT_PUBLIC_A_B"), ["NEXT_PUBLIC_A", "NEXT_PUBLIC_A_B"]);
});
