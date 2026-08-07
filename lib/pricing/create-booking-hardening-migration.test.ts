import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Bron-/rechten-guard voor de create_booking()-security-hardening. Bewaakt de
// search_path-hardening, schema-kwalificatie en de execute-lockdown (anon/
// authenticated ingetrokken, alleen service_role). Runtime-rechten worden bij
// toepassing op een non-prod DB geverifieerd (apart verificatiepunt).
const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260807130000_harden_create_booking.sql"),
  "utf8"
);

test("create_booking gebruikt een LEGE search_path (geen brede/muteerbare)", () => {
  assert.match(sql, /set\s+search_path\s*=\s*''/i);
  assert.doesNotMatch(sql, /search_path\s+to\s+'?public'?/i);
  assert.doesNotMatch(sql, /search_path\s*=\s*'?public'?/i);
});

test("create_booking kwalificeert het user-object public.bookings", () => {
  assert.match(sql, /insert\s+into\s+public\.bookings/i);
});

test("execute-lockdown: revoke van public/anon/authenticated, grant alleen service_role", () => {
  assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.create_booking\([\s\S]*?from\s+public,\s*anon,\s*authenticated/i);
  assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.create_booking\([\s\S]*?to\s+service_role/i);
  // Nooit (opnieuw) execute aan anon/authenticated/public.
  assert.doesNotMatch(sql, /grant\s+execute\s+on\s+function\s+public\.create_booking\([\s\S]*?to\s+(anon|authenticated|public)\b/i);
});
