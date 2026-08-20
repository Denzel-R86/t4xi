import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260820130000_harden_address_usage_rpc.sql",
);
const migration = readFileSync(migrationPath, "utf8");
const normalized = migration
  .replace(/^\s*--.*$/gm, "")
  .replace(/\s+/g, " ")
  .toLowerCase();

test("de legacy usage-RPC gebruikt geen elevated privileges meer", () => {
  assert.match(
    normalized,
    /create or replace function public\.increment_address_usage\(p_address_id uuid\)/,
  );
  assert.match(normalized, /security invoker/);
  assert.match(normalized, /set search_path = pg_catalog, public/);
  assert.doesNotMatch(normalized, /security definer/);
});

test("de functie kwalificeert objecten en houdt triggerdependencies resolveerbaar", () => {
  assert.match(normalized, /update public\.addresses as address/);
  assert.match(normalized, /last_used_at = pg_catalog\.now\(\)/);
  assert.match(normalized, /set search_path = pg_catalog, public/);
});

test("adresstatistieken zijn niet schrijfbaar via publieke browserrollen", () => {
  assert.match(
    normalized,
    /revoke all on function public\.increment_address_usage\(uuid\) from public, anon, authenticated/,
  );
  assert.match(
    normalized,
    /grant execute on function public\.increment_address_usage\(uuid\) to service_role/,
  );
  assert.doesNotMatch(
    normalized,
    /grant execute on function public\.increment_address_usage\(uuid\) to (?:public|anon|authenticated)/,
  );
});

test("de applicatie gebruikt de publieke usage-RPC nergens", () => {
  const applicationFiles = [
    "app/api/bookings/route.ts",
    "components/shared/AddressAutocomplete.tsx",
    "lib/pricing/service.ts",
  ];

  for (const file of applicationFiles) {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");
    assert.doesNotMatch(source, /increment_address_usage/);
  }
});
