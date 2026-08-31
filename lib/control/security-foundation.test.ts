import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260831075015_control_security_foundation.sql";
const migration = readFileSync(migrationPath, "utf8");
const auth = readFileSync("lib/control/auth.ts", "utf8");
const audit = readFileSync("lib/control/audit.ts", "utf8");
const legacy = readFileSync("lib/admin/session.ts", "utf8");
const proxy = readFileSync("proxy.ts", "utf8");

test("Control is append-only and leaves existing operational domains untouched", () => {
  assert.doesNotMatch(migration, /create\s+or\s+replace\s+function\s+public\.create_booking/i);
  assert.doesNotMatch(migration, /alter\s+table\s+public\.(bookings|fixed_route_prices)/i);
  assert.doesNotMatch(migration, /pricing_event|communication_/i);
  assert.match(legacy, /t4xi_ops_session/);
});

test("individual identity, status and normalized unique email are constrained", () => {
  assert.match(migration, /auth_user_id uuid not null unique references auth\.users/);
  assert.match(migration, /control_identities_email_normalized/);
  assert.match(migration, /unique index control_identities_email_key/);
  assert.match(migration, /status = 'active'/);
});

test("authorization is server-verified, permission-based and MFA-gated", () => {
  assert.match(auth, /auth\.getUser\(\)/);
  assert.match(auth, /getAuthenticatorAssuranceLevel\(\)/);
  assert.match(auth, /currentLevel === "aal2"/);
  assert.match(auth, /control_authorize/);
  assert.match(migration, /security invoker/i);
  assert.doesNotMatch(migration, /security definer/i);
});

test("every new table has explicit RLS and browser mutations stay denied", () => {
  const tables = ["control_identities", "control_roles", "control_permissions",
    "control_role_permissions", "control_identity_roles", "control_audit_events",
    "control_data_catalog", "control_retention_rules"];
  for (const table of tables) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.doesNotMatch(migration, /create policy[^;]+for (insert|update|delete)/i);
  assert.match(migration, /revoke insert, update, delete, truncate[\s\S]+from anon, authenticated/);
});

test("audit events are append-only, purpose-bound and metadata-minimized", () => {
  assert.match(migration, /Append-only Control audit trail/);
  assert.match(migration, /processing_purpose text not null/);
  assert.match(migration, /retention_until timestamptz not null/);
  assert.match(migration, /revoke update, delete, truncate on public\.control_audit_events from service_role/);
  assert.match(audit, /FORBIDDEN_METADATA_KEY/);
  assert.match(audit, /processing_purpose/);
});

test("the /admin shell bypasses locale rewriting but remains no-store/noindex", () => {
  assert.match(proxy, /rawPathname === "\/admin"/);
  assert.match(proxy, /cache-control", "no-store"/);
  assert.match(proxy, /x-robots-tag", "noindex, nofollow"/);
});
