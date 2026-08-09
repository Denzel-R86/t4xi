import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Regressie — Content-Security-Policy moet Stripe toestaan (Sprint 7.5 E2E-bevinding).
 * Zonder deze hosts kan js.stripe.com niet laden → Payment Element mount niet →
 * "Nu betalen" blijft disabled in ÉLKE browser. Statische borging op next.config.
 */
const cfg = readFileSync("next.config.mjs", "utf8");

test("CSP script-src staat js.stripe.com toe", () => {
  assert.match(cfg, /script-src[^\n]*https:\/\/js\.stripe\.com/);
});

test("CSP connect-src staat api.stripe.com toe", () => {
  assert.match(cfg, /connect-src[^\n]*https:\/\/api\.stripe\.com/);
});

test("CSP frame-src staat de Payment Element + 3DS iframes toe", () => {
  assert.match(cfg, /frame-src[^\n]*https:\/\/js\.stripe\.com/);
  assert.match(cfg, /frame-src[^\n]*https:\/\/hooks\.stripe\.com/);
});

test("CSP behoudt de bestaande bronnen en beperkt Supabase tot de geconfigureerde origin", () => {
  assert.match(cfg, /new URL\(configuredSupabaseUrl\)/);
  assert.match(cfg, /supabaseConnectOrigin/);
  assert.doesNotMatch(cfg, /https:\/\/\*\.supabase\.co/);
  assert.match(cfg, /connect-src[^\n]*https:\/\/api\.pdok\.nl/);
  assert.match(cfg, /connect-src[^\n]*https:\/\/places\.googleapis\.com/);
});

test("CSP sluit plugins, base-tag- en formulierinjecties af en beperkt framing tot same-origin", () => {
  assert.match(cfg, /object-src 'none'/);
  assert.match(cfg, /base-uri 'self'/);
  assert.match(cfg, /form-action 'self'/);
  assert.match(cfg, /frame-ancestors 'self'/);
  assert.doesNotMatch(cfg, /frame-ancestors https:/);
});
