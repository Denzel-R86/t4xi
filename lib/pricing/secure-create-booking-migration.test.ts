import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// Bron-/rechten-guards voor de create_booking-security-hotfix (20260807220341) en de
// forward-only correctie (20260808103643). Runtime-gedrag wordt bij toepassing op een
// schone/non-prod DB geverifieerd; hier bewaken we de invarianten in de migratiebronnen.
const MIG = "supabase/migrations";
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const hist = read(`${MIG}/20260807220341_secure_create_booking_rpc.sql`);
const fix = read(`${MIG}/20260808103643_harden_search_path_booking_fns.sql`);
const route = read("app/api/bookings/route.ts");

// ── Historische immutabiliteit: 140000 == wat op prod is toegepast ───────────

test("historische migratie 140000 is ONGEWIJZIGD (matcht prod-historie: search_path='' + returning booking_ref, id)", () => {
  // Deze migratie is al toegepast; de inhoud mag NIET achteraf gecorrigeerd worden.
  assert.match(hist, /set\s+search_path\s*=\s*''/i);
  assert.match(hist, /returning\s+booking_ref,\s*id\s+into\s+v_ref,\s*v_id/i);
  assert.doesNotMatch(hist, /returning\s+public\.bookings\.booking_ref/i);
  assert.doesNotMatch(hist, /search_path\s+to\s+'public'/i);
  // Geen toegevoegde commentaarheader — exact de geregistreerde SQL.
  assert.match(hist.trimStart(), /^create or replace function public\.create_booking\(/i);
});

// ── Correctie 150000: trigger + create_booking herdefinitie ──────────────────

test("trigger generate_booking_ref: lege search_path + gekwalificeerde public.booking_ref_seq", () => {
  const block = fix.slice(fix.indexOf("function public.generate_booking_ref"), fix.indexOf("function public.create_booking"));
  assert.match(block, /set\s+search_path\s*=\s*''/i);
  assert.match(block, /nextval\('public\.booking_ref_seq'\)/i);
  // Niet onnodig SECURITY DEFINER (alleen indien nodig — hier niet).
  assert.doesNotMatch(block, /security\s+definer/i);
});

test("create_booking (correctie): lege search_path + ONDUBBELZINNIGE gekwalificeerde RETURNING", () => {
  assert.match(fix, /function public\.create_booking\([\s\S]*?set\s+search_path\s*=\s*''/i);
  assert.match(fix, /returning\s+public\.bookings\.booking_ref,\s*public\.bookings\.id\s+into\s+v_ref,\s*v_id/i);
  assert.match(fix, /insert\s+into\s+public\.bookings/i);
});

test("execute-lockdown blijft: revoke public/anon/authenticated, grant alleen service_role", () => {
  assert.match(fix, /revoke\s+all\s+on\s+function\s+public\.create_booking\([\s\S]*?from\s+public,\s*anon,\s*authenticated/i);
  assert.match(fix, /grant\s+execute\s+on\s+function\s+public\.create_booking\([\s\S]*?to\s+service_role/i);
  assert.doesNotMatch(fix, /grant\s+execute\s+on\s+function\s+public\.create_booking\([\s\S]*?to\s+(anon|authenticated|public)\b/i);
  // Trigger-functie: minimale rechten.
  assert.match(fix, /revoke\s+all\s+on\s+function\s+public\.generate_booking_ref\(\)\s+from\s+public,\s*anon,\s*authenticated/i);
});

// ── Volgorde / schone-DB-run ─────────────────────────────────────────────────

test("migraties draaien in correcte volgorde: correctie 150000 komt NA hotfix 140000", () => {
  const files = readdirSync(resolve(process.cwd(), MIG)).filter((f) => f.endsWith(".sql")).sort();
  const iHist = files.indexOf("20260807220341_secure_create_booking_rpc.sql");
  const iFix = files.indexOf("20260808103643_harden_search_path_booking_fns.sql");
  assert.ok(iHist >= 0 && iFix >= 0, "beide migraties aanwezig");
  assert.ok(iFix > iHist, "correctie moet lexicografisch/temporeel na de hotfix komen");
});

// ── Serverroute: service_role + client kan geen prijs bepalen ────────────────

test("server-side booking-route roept create_booking via service_role aan", () => {
  assert.match(route, /function\s+serviceRoleClient\(\)/);
  assert.match(route, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(route, /supabase\.rpc\(\s*["']create_booking["']/);
});

test("client kan de prijs niet rechtstreeks bepalen (route leest geen client-bedrag)", () => {
  assert.doesNotMatch(route, /body\.(price|amount|priceEuros|prijs|total)\b/i);
  assert.match(route, /p_price_euros:\s*priceEuros/);
});
