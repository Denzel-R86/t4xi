import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260820090000_remove_unused_anon_insert_policies.sql",
  "utf8",
);

test("ongebruikte anonieme insert-policies worden verwijderd", () => {
  assert.match(
    migration,
    /drop policy if exists "bookings_insert_anon" on public\.bookings/i,
  );
  assert.match(
    migration,
    /drop policy if exists "addresses_insert_validated_anon" on public\.addresses/i,
  );
});

test("hardening-migratie creëert geen vervangende publieke write-policy", () => {
  assert.doesNotMatch(migration, /create\s+policy/i);
  assert.doesNotMatch(migration, /grant\s+(insert|update|delete|all)/i);
});
