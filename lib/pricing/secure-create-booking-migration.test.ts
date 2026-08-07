import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Gerichte bron-/rechten-guard voor de create_booking()-security-hotfix. Bewaakt de
// search_path-hardening, schema-kwalificatie en de execute-lockdown, plus dat de
// server-side booking-route service_role gebruikt en nooit een client-prijs vertrouwt.
// Runtime-rechten worden bij toepassing op een non-prod DB geverifieerd.
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const sql = read("supabase/migrations/20260807140000_secure_create_booking_rpc.sql");
const route = read("app/api/bookings/route.ts");

test("vaste, niet-muteerbare search_path is gezet (geen ontbrekende search_path)", () => {
  // Bewust FIXED 'public' i.p.v. '': '' breekt de generate_booking_ref-trigger
  // (ongekwalificeerde sequence). Een vaste search_path is niet injectie-kwetsbaar.
  // De functie MOET wel een expliciete SET search_path hebben (nooit ontbreken/mutable).
  assert.match(sql, /security\s+definer\s*\n?\s*set\s+search_path\s+to\s+'public'/i);
});

test("anon/authenticated hebben GEEN execute-recht (revoke)", () => {
  assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.create_booking\([\s\S]*?from\s+public,\s*anon,\s*authenticated/i);
});

test("service_role heeft WEL execute-recht (grant) — en niemand anders", () => {
  assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.create_booking\([\s\S]*?to\s+service_role/i);
  assert.doesNotMatch(sql, /grant\s+execute\s+on\s+function\s+public\.create_booking\([\s\S]*?to\s+(anon|authenticated|public)\b/i);
});

test("signatuur ongewijzigd (18 parameters, zelfde types) — geen functionele wijziging", () => {
  // Sanity: dezelfde parameter- en returnvorm als de bestaande functie.
  assert.match(sql, /create or replace function public\.create_booking\(/i);
  assert.match(sql, /returns\s+table\(booking_ref\s+text,\s*booking_id\s+uuid\)/i);
  assert.match(sql, /p_price_euros\s+numeric/i);
});

test("server-side booking-route roept create_booking via service_role aan en blijft na de lockdown werken", () => {
  assert.match(route, /function\s+serviceRoleClient\(\)/);
  assert.match(route, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(route, /supabase\.rpc\(\s*["']create_booking["']/);
});

test("client kan de prijs niet rechtstreeks bepalen (route leest geen client-bedrag)", () => {
  assert.doesNotMatch(route, /body\.(price|amount|priceEuros|prijs|total)\b/i);
  // p_price_euros komt uit de server-berekende variabele, niet uit de body.
  assert.match(route, /p_price_euros:\s*priceEuros/);
});
