import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gateB = readFileSync(
  "supabase/migrations/20260912110000_control_authorization_via_identities.sql",
  "utf8",
);
const sprint1 = readFileSync(
  "supabase/migrations/20260908120000_control_security_foundation.sql",
  "utf8",
);

/** Executable SQL only. Prose explaining a choice is not the choice. */
function statementsOf(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

const SPRINT1_POLICIES = [
  "control_identity_self_read",
  "control_identity_roles_self_read",
  "control_roles_active_identity_read",
  "control_permissions_active_identity_read",
  "control_role_permissions_active_identity_read",
];

// ── No dual authority ────────────────────────────────────────────────────
test("every Sprint-1 policy is replaced, not supplemented", () => {
  for (const policy of SPRINT1_POLICIES) {
    assert.match(sprint1, new RegExp(`create policy ${policy}`), `${policy} should exist in Sprint 1`);
    assert.match(gateB, new RegExp(`drop policy ${policy} on`), `${policy} must be dropped`);
    assert.match(gateB, new RegExp(`create policy ${policy} on`), `${policy} must be recreated`);
  }
});

test("no policy still decides on auth_user_id after the cutover", () => {
  const policies = gateB.slice(gateB.indexOf("drop policy control_identity_self_read"));
  assert.doesNotMatch(policies, /auth_user_id/, "a policy resolving on auth_user_id would be a second path");
});

test("drop and recreate happen in one transaction", () => {
  assert.match(gateB, /^begin;/m);
  assert.match(gateB, /^commit;/m);
  const firstDrop = gateB.indexOf("drop policy");
  const commit = gateB.lastIndexOf("commit;");
  assert.ok(firstDrop > -1 && firstDrop < commit, "no policy may be dropped outside the transaction");
});

// ── The resolver ─────────────────────────────────────────────────────────
test("resolution runs auth.uid() to identities to control_identities", () => {
  const resolver = /create or replace function public\.control_identity_for_current_user\(\)([\s\S]*?)\$\$;/.exec(gateB);
  assert.ok(resolver, "the resolver must exist");
  const body = resolver[1];
  assert.match(body, /join public\.identities identity on identity\.id = control_identity\.identity_id/);
  assert.match(body, /identity\.auth_user_id = \(select auth\.uid\(\)\)/);
  assert.match(body, /identity\.erased_at is null/);
  assert.match(body, /control_identity\.status = 'active'/);
  assert.match(body, /control_identity\.disabled_at is null/);
});

test("neither resolver accepts an identity argument", () => {
  assert.match(gateB, /control_identity_for_current_user\(\)/);
  assert.doesNotMatch(gateB, /control_identity_for_current_user\(\s*[a-z_]+ uuid/);
  assert.doesNotMatch(gateB, /control_authorize\(\s*[a-z_]+ uuid/);
});

test("both resolvers are definer with a pinned search_path and no anon access", () => {
  for (const fn of ["control_identity_for_current_user", "control_authorize"]) {
    const match = new RegExp(`create or replace function public\\.${fn}\\(([^)]*)\\)([\\s\\S]*?)\\$\\$;`).exec(gateB);
    assert.ok(match, `${fn} must be defined in Gate B`);
    assert.match(match[2], /security definer/, `${fn} must be definer`);
    assert.match(match[2], /set search_path = pg_catalog, public/, `${fn} needs a pinned search_path`);
    assert.match(gateB, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon`));
  }
});

// ── Gate B must not reach forward ────────────────────────────────────────
test("Gate B does not reference soft revoke, which only exists from Gate D", () => {
  // The comment may explain the constraint; the SQL may not depend on it.
  assert.doesNotMatch(
    statementsOf(gateB),
    /revoked_at/,
    "referencing a column that does not exist yet would fail on apply",
  );
  assert.match(gateB, /revoked_at/, "the reason is worth recording in a comment");
});

test("the cutover opens no write path and changes no grant", () => {
  assert.doesNotMatch(statementsOf(gateB), /for (insert|update|delete)/i);
  assert.doesNotMatch(statementsOf(gateB), /grant (insert|update|delete)/i);
});
