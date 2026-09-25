import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { controlEdgeDecision } from "@/lib/control/routes";
import {
  isKnownStatus,
  isUsableDisplayName,
  looksLikeEmail,
  mayChangeRole,
  normaliseEmail,
  reasonForCondition,
} from "@/lib/control/identity-commands";

const migration = readFileSync(
  "supabase/migrations/20260912130000_control_identity_management.sql",
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
    assert.match(body, /control_identity_for_current_user\(\)/, `${name} must resolve its own actor`);
    assert.match(body, /security definer/, `${name} must be definer`);
    assert.match(body, /set search_path = pg_catalog, public/, `${name} needs a pinned search_path`);
    assert.doesNotMatch(body, /actor_identity_id uuid,/, `${name} must not take an actor argument`);
  }
});

test("every command re-checks the permission and refuses a self-mutation", () => {
  for (const name of COMMANDS) {
    const body = command(name);
    assert.match(body, /control_authorize\('identity\.manage'\)/);
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
    // the three distinct actor facts Gate C introduced
    assert.match(body, /'user', actor_platform_id, actor_id, actor_auth/, `${name} must record all three actor facts`);
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
  assert.match(migration, /using \(public\.control_authorize\('identity\.read'\)\)/);
  assert.match(migration, /create policy control_identity_roles_manager_read[\s\S]*?for select to authenticated/);
  // the Sprint-1 self-read policies are not dropped
  assert.doesNotMatch(migration, /drop policy/);
  // no browser write path is introduced
  assert.doesNotMatch(migration, /for (insert|update|delete) to authenticated/);
});

test("internal helpers are not callable by a client", () => {
  // The lock and the counter are implementation detail of the commands.
  assert.match(migration, /revoke all on function public\.control_admin_invariant_lock\(\) from public, anon, authenticated/);
  assert.match(migration, /revoke all on function public\.control_effective_admin_count\(\) from public, anon, authenticated/);
  // The resolver is different: RLS policies call it, so authenticated must be
  // able to execute it. It is safe because it takes no argument.
  assert.doesNotMatch(migration, /revoke all on function public\.control_identity_for_current_user\(\) from[^\n]*authenticated/);
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
  // No direct data access from the view or the transport: no client import,
  // no query builder, no service role. Mentioning Supabase in explanatory copy
  // is not a boundary violation, so the assertion targets code, not prose.
  for (const [name, source] of [["page", page], ["actions", actions]] as const) {
    assert.doesNotMatch(source, /from "@\/lib\/supabase/, `${name} must not import a client`);
    assert.doesNotMatch(source, /createClient|controlServerClient/, `${name} must not build a client`);
    assert.doesNotMatch(source, /\.from\(|\.rpc\(/, `${name} must not query directly`);
    assert.doesNotMatch(source, /SERVICE_ROLE/i, `${name} must never touch the service role`);
  }
  assert.match(actions, /^"use server";/);
  assert.match(page, /loadIdentityOverview/);
});

// ── Blocker 1: the invariant must be serialised, not merely checked ───────
// Structural only. Concurrency is claimed proven by scripts/control-admin-
// invariant-race.sh against staging, never by these assertions.
test("only count-decreasing commands take the invariant lock, and take it before mutating", () => {
  const status = command("control_set_identity_status");
  const revoke = command("control_revoke_role");
  const grant = command("control_grant_role");

  for (const [name, body] of [["status", status], ["revoke", revoke]] as const) {
    const lock = body.indexOf("control_admin_invariant_lock()");
    const mutation = Math.max(
      body.indexOf("update public.control_identities"),
      body.indexOf("update public.control_identity_roles"),
    );
    assert.ok(lock > -1, `${name} must take the invariant lock`);
    assert.ok(lock < mutation, `${name} must lock before it mutates, not after`);
  }
  // granting only ever raises the count, so it is deliberately not serialised
  assert.doesNotMatch(grant, /control_admin_invariant_lock/);
});

test("the lock is transaction scoped and unreachable from a client", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  // a session-scoped lock would leak on an error path
  assert.doesNotMatch(migration, /pg_advisory_lock\(/);
  assert.match(migration, /revoke all on function public\.control_admin_invariant_lock\(\) from public, anon, authenticated/);
});

test("the status command locks only for an identity that carries the invariant", () => {
  const status = command("control_set_identity_status");
  // the lock sits behind a check for an active control_admin grant
  assert.match(status, /if exists \([\s\S]*?'control_admin'[\s\S]*?revoked_at is null[\s\S]*?\) then\s*\n\s*perform public\.control_admin_invariant_lock\(\)/);
});

// ── Blocker 2: onboarding an existing Auth account ───────────────────────
test("onboarding attaches the operator to an existing platform identity", () => {
  const create = command("control_create_identity");
  assert.match(create, /select id into target_platform_id from public\.identities/);
  assert.match(create, /control_platform_identity_missing/,
    "a missing platform identity is a data problem, not something to repair silently");
  assert.match(create, /values \(target_platform_id, target_auth, trimmed_name, normalised_email, 'invited'\)/);
});

test("onboarding resolves auth.users inside the function, never through a grant", () => {
  const create = command("control_create_identity");
  assert.match(create, /security definer/);
  assert.match(create, /set search_path = pg_catalog, public/);
  assert.match(create, /from auth\.users where lower\(email\) = normalised_email/);
  // no client role may read auth.users
  assert.doesNotMatch(migration, /grant select on (table )?auth\.users/i);
});

test("onboarding cannot be used to onboard or escalate yourself", () => {
  const create = command("control_create_identity");
  assert.match(create, /target_auth = actor_auth/);
  assert.match(create, /control_self_onboarding_denied/);
  assert.match(create, /control_authorize\('identity\.manage'\)/);
  // an admin starting role still needs the second permission
  assert.match(create, /initial_role_key = 'control_admin'[\s\S]*?identity\.grant_admin/);
  // an erased identity may never be onboarded
  assert.match(create, /where auth_user_id = target_auth and erased_at is null/);
});

test("a new identity starts without access and cannot silently duplicate", () => {
  const create = command("control_create_identity");
  assert.match(create, /values \(target_platform_id, target_auth, trimmed_name, normalised_email, 'invited'\)/);
  assert.match(create, /where identity_id = target_platform_id or lower\(email\) = normalised_email/);
  assert.match(create, /control_identity_exists/);
  assert.match(create, /control_auth_user_not_found/);
  assert.match(create, /control_auth_user_ambiguous/);
});

test("creation is audited in its own transaction and never logs the address", () => {
  const create = command("control_create_identity");
  assert.match(create, /insert into public\.control_audit_events/);
  assert.match(create, /'identity\.created'/);
  const audit = create.slice(create.indexOf("insert into public.control_audit_events"));
  assert.doesNotMatch(audit, /normalised_email|target_email/);
});

// ── Pure guards for the onboarding form ──────────────────────────────────
test("onboarding input is normalised and validated before the round trip", () => {
  assert.equal(normaliseEmail("  Operator@T4XI.NL "), "operator@t4xi.nl");
  assert.equal(looksLikeEmail("operator@t4xi.nl"), true);
  assert.equal(looksLikeEmail("operator"), false);
  assert.equal(looksLikeEmail(""), false);
  assert.equal(isUsableDisplayName("Jo"), true);
  assert.equal(isUsableDisplayName(" a "), false);
  assert.equal(isUsableDisplayName("x".repeat(121)), false);
});

test("the new refusal conditions map to distinct reasons", () => {
  assert.equal(reasonForCondition("control_auth_user_not_found"), "auth_user_not_found");
  assert.equal(reasonForCondition("control_auth_user_ambiguous"), "auth_user_ambiguous");
  assert.equal(reasonForCondition("control_identity_exists"), "identity_exists");
  assert.equal(reasonForCondition("control_self_onboarding_denied"), "self_onboarding_denied");
  assert.equal(reasonForCondition("control_invalid_display_name"), "invalid_display_name");
});

test("the admin count respects erasure and soft revoke", () => {
  const counter = /create or replace function public\.control_effective_admin_count\(\)([\s\S]*?)\$\$;/.exec(migration);
  assert.ok(counter, "the counter must exist");
  assert.match(counter[1], /identity\.erased_at is null/);
  assert.match(counter[1], /identity_role\.revoked_at is null/);
  assert.match(counter[1], /control_identity\.status = 'active'/);
});

test("Gate D no longer needs a second authorization function", () => {
  // Gate B made control_authorize itself DEFINER, so the separate
  // control_permission_check the earlier draft required is redundant.
  const statements = migration
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(statements, /control_permission_check/);
  assert.doesNotMatch(statements, /control_actor_identity/);
  // every authorization check in the commands goes through the one function
  assert.match(statements, /public\.control_authorize\('identity\.manage'\)/);
});
