import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { controlEdgeDecision } from "@/lib/control/routes";
import { isKnownStatus, mayChangeRole, reasonForCondition } from "@/lib/control/identity-commands";

const migration = readFileSync(
  "supabase/migrations/20260910120000_control_identity_management.sql",
  "utf8",
);
const service = readFileSync("lib/control/identity-service.ts", "utf8");
const repository = readFileSync("lib/control/identity-repository.ts", "utf8");
const page = readFileSync("app/admin/identities/page.tsx", "utf8");
const actions = readFileSync("app/admin/identities/actions.ts", "utf8");

/** Every command body, so a guard cannot be present in one and missing in another. */
function command(name: string): string {
  const match = new RegExp(
    `create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
  ).exec(migration);
  assert.ok(match, `${name} not found in the migration`);
  return match[0];
}
const COMMANDS = ["control_set_identity_status", "control_grant_role", "control_revoke_role"];

// ── Behavioural: the edge registry ────────────────────────────────────────
test("/admin/identities needs a session at the edge and its subpaths stay closed", () => {
  assert.equal(controlEdgeDecision("/admin/identities", []), "not_found");
  assert.equal(controlEdgeDecision("/admin/identities", ["sb-abc123-auth-token"]), "allow");
  assert.equal(controlEdgeDecision("/admin/identities/anything", ["sb-abc123-auth-token"]), "not_found");
});

// ── Behavioural: refusal mapping ──────────────────────────────────────────
test("every raised condition maps to a distinct reason, unknown ones fail closed", () => {
  assert.equal(reasonForCondition("control_permission_denied"), "forbidden");
  assert.equal(reasonForCondition("control_self_mutation_denied"), "self_mutation_denied");
  assert.equal(reasonForCondition("control_admin_grant_denied"), "admin_change_denied");
  assert.equal(reasonForCondition("control_admin_revoke_denied"), "admin_change_denied");
  assert.equal(reasonForCondition("control_last_admin_protected"), "last_admin_protected");
  assert.equal(reasonForCondition("control_grant_not_active"), "grant_not_active");
  assert.equal(reasonForCondition("control_actor_not_active"), "actor_not_active");
  // An unrecognised or absent condition must never read as success
  assert.equal(reasonForCondition("something_unexpected"), "failed");
  assert.equal(reasonForCondition(""), "failed");
});

// ── Anti-regression on the command boundary ───────────────────────────────
// These assert that the agreed guarantees are still written in the migration.
// They are not proof that the database enforces them; that comes from the
// staging probes in scripts/control-identity-probes.sql.
test("every command resolves the actor from auth.uid() and never from an argument", () => {
  for (const name of COMMANDS) {
    const body = command(name);
    assert.match(body, /control_actor_identity\(\)/, `${name} must resolve its own actor`);
    assert.match(body, /security definer/, `${name} must be definer`);
    assert.match(body, /set search_path = pg_catalog, public/, `${name} needs a pinned search_path`);
    assert.doesNotMatch(body, /actor_identity_id uuid,/, `${name} must not take an actor argument`);
  }
});

test("every command re-checks the permission and refuses a self-mutation", () => {
  for (const name of COMMANDS) {
    const body = command(name);
    assert.match(body, /control_permission_check\('identity\.manage'\)/);
    assert.match(body, /target_identity_id = actor_id/);
    assert.match(body, /control_self_mutation_denied/);
  }
});

test("control_admin needs the second permission on both grant and revoke", () => {
  assert.match(command("control_grant_role"), /'control_admin'[\s\S]*?identity\.grant_admin/);
  assert.match(command("control_revoke_role"), /'control_admin'[\s\S]*?identity\.grant_admin/);
  assert.match(migration, /\('identity\.grant_admin', 'Grant or revoke the Control administrator role', 'critical'\)/);
  // seeded on control_admin only
  assert.match(migration, /where role\.role_key = 'control_admin'/);
});

test("the last-admin invariant is checked after the mutation, inside the transaction", () => {
  for (const name of ["control_set_identity_status", "control_revoke_role"]) {
    const body = command(name);
    const mutation = Math.max(body.indexOf("update public.control_identities"), body.indexOf("update public.control_identity_roles"));
    const invariant = body.indexOf("control_effective_admin_count()");
    assert.ok(mutation > -1, `${name} must mutate`);
    assert.ok(invariant > mutation, `${name} must verify the invariant after mutating, not before`);
    assert.match(body, /control_last_admin_protected/);
  }
});

test("each command writes its audit row inside its own transaction", () => {
  for (const name of COMMANDS) {
    const body = command(name);
    assert.match(body, /insert into public\.control_audit_events/, `${name} must audit`);
    // the audit insert sits in the same function body as the mutation, so a
    // failing insert aborts the whole statement
    assert.doesNotMatch(body, /commit;/, `${name} must not commit early`);
  }
});

test("revoking is soft and only active grants authorize", () => {
  assert.match(migration, /add column if not exists revoked_at timestamptz/);
  assert.match(migration, /add column if not exists revoked_by uuid/);
  assert.match(command("control_revoke_role"), /set revoked_at = now\(\), revoked_by = actor_id/);
  assert.doesNotMatch(command("control_revoke_role"), /delete from public\.control_identity_roles/);
  assert.match(migration, /identity_role\.revoked_at is null/);
});

test("identity mutations keep updated_at honest", () => {
  assert.match(command("control_set_identity_status"), /updated_at = now\(\)/);
});

test("reads become possible without opening the tables for writes", () => {
  assert.match(migration, /create policy control_identities_manager_read[\s\S]*?for select to authenticated/);
  assert.match(migration, /create policy control_identity_roles_manager_read[\s\S]*?for select to authenticated/);
  // the Sprint-1 self-read policies are not dropped
  assert.doesNotMatch(migration, /drop policy/);
  // no browser write path is introduced
  assert.doesNotMatch(migration, /for (insert|update|delete) to authenticated/);
});

test("internal helpers are not callable by a client", () => {
  assert.match(migration, /revoke all on function public\.control_actor_identity\(\) from public, anon, authenticated/);
  assert.match(migration, /revoke all on function public\.control_effective_admin_count\(\) from public, anon, authenticated/);
});

// ── The application layer must not be the security boundary ───────────────
test("role-change eligibility needs both permissions for control_admin", () => {
  assert.equal(mayChangeRole("control_auditor", true, false), true);
  assert.equal(mayChangeRole("control_admin", true, false), false);
  assert.equal(mayChangeRole("control_admin", true, true), true);
  assert.equal(mayChangeRole("control_auditor", false, true), false);
});

test("only the four modelled statuses are accepted before the call is made", () => {
  assert.equal(isKnownStatus("active"), true);
  assert.equal(isKnownStatus("suspended"), true);
  assert.equal(isKnownStatus("owner"), false);
  assert.equal(isKnownStatus(""), false);
});

test("the service treats its own authorization as UX only", () => {
  assert.match(service, /UX gate only/);
  // refusals are audited advisory, successes are audited by the command itself
  assert.match(service, /policy: "advisory"/);
  assert.doesNotMatch(service, /policy: "required"/);
});

test("capability probes do not write audit events", () => {
  // rendering a button is not an access decision
  assert.match(repository, /export async function hasPermission/);
  assert.match(service, /hasPermission\("identity\.manage"\)/);
  assert.match(service, /hasPermission\("identity\.grant_admin"\)/);
});

test("the UI and server boundary stay thin and hold no authorization logic", () => {
  assert.doesNotMatch(page, /supabase|service_role|from\(/i);
  assert.doesNotMatch(actions, /supabase|service_role/i);
  assert.match(actions, /^"use server";/);
  assert.match(page, /loadIdentityOverview/);
});
