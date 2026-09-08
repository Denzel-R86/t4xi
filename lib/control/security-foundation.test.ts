import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CONTROL_ROUTES, controlEdgeDecision, hasSessionCookie, isControlPath } from "@/lib/control/routes";

const migrationPath = "supabase/migrations/20260908120000_control_security_foundation.sql";
const migration = readFileSync(migrationPath, "utf8");
const auth = readFileSync("lib/control/auth.ts", "utf8");
const audit = readFileSync("lib/control/audit.ts", "utf8");
const legacy = readFileSync("lib/admin/session.ts", "utf8");
const proxy = readFileSync("proxy.ts", "utf8");
const login = readFileSync("components/control/ControlLogin.tsx", "utf8");

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
  assert.match(proxy, /if \(isControlPath\(rawPathname\)\)/);
  assert.match(proxy, /cache-control", "no-store"/);
  assert.match(proxy, /x-robots-tag", "noindex, nofollow"/);
});

// ── B · edge default-deny — behavioural, not textual ──────────────────────
test("an unregistered /admin subroute is denied at the edge", () => {
  assert.equal(controlEdgeDecision("/admin/dispatch", []), "not_found");
  assert.equal(controlEdgeDecision("/admin/identities", ["sb-abc123-auth-token"]), "not_found");
  assert.equal(controlEdgeDecision("/admin/", []), "not_found");
});

test("only the registered sign-in shell is reachable without a session", () => {
  assert.equal(controlEdgeDecision("/admin", []), "allow");
  assert.deepEqual(
    CONTROL_ROUTES.filter((route) => route.allowsAnonymous).map((route) => route.path),
    ["/admin"],
  );
});

test("a registered non-anonymous route requires a session cookie at the edge", () => {
  assert.equal(hasSessionCookie([]), false);
  assert.equal(hasSessionCookie(["theme", "NEXT_LOCALE"]), false);
  assert.equal(hasSessionCookie(["sb-abc123-auth-token"]), true);
  assert.equal(hasSessionCookie(["sb-abc123-auth-token.1"]), true);
  assert.equal(hasSessionCookie(["sb-abc123-auth-token-decoy"]), false);
});

test("Control paths are recognised, locale-prefixed ones are closed in the proxy", () => {
  assert.equal(isControlPath("/admin"), true);
  assert.equal(isControlPath("/admin/anything"), true);
  assert.equal(isControlPath("/administratie"), false);
  assert.match(proxy, /if \(isControlPath\(pathname\)\) return notFound\(\);/);
  assert.match(proxy, /controlEdgeDecision\(rawPathname/);
});

// ── A · the audit trail has producers ─────────────────────────────────────
test("every identified access decision produces an audit event", () => {
  const calls = auth.match(/recordControlAccessDecision\(/g) ?? [];
  assert.equal(calls.length, 3, "granted, mfa_required and forbidden must each audit");
  assert.match(auth, /reason: "mfa_required"/);
  assert.match(auth, /reason: "forbidden"/);
  assert.match(auth, /outcome: "success"/);
  assert.match(audit, /export async function recordControlAccessDecision/);
});

test("the audit failure policy is explicit and advisory on access decisions", () => {
  assert.match(audit, /export type ControlAuditPolicy = "advisory" \| "required"/);
  assert.match(audit, /reportAuditFailure/);
  // A denied login stays denied when the audit write fails: the decision is
  // returned regardless of the recorder's boolean.
  assert.match(auth, /await recordControlAccessDecision\(\{[\s\S]*?\}\);\s*return \{ ok: false, reason: "mfa_required" \}/);
  // Mutations default to fail-closed.
  assert.match(audit, /const policy = input\.policy \?\? "required"/);
});

// ── D · classification and retention are table-complete ───────────────────
test("every Control table has a classification entry and a retention rule", () => {
  const tables = [...migration.matchAll(/create table public\.(control_\w+)/g)].map((m) => m[1]);
  assert.equal(tables.length, 8);
  for (const table of tables) {
    assert.match(migration, new RegExp(`\\('${table}', '(public|internal|confidential|restricted)'`),
      `${table} missing from control_data_catalog`);
    assert.match(migration, new RegExp(`\\('${table}', '[a-z_]+', \\d+, '`),
      `${table} missing from control_retention_rules`);
  }
});

test("retention decisions are explicit, including the keep decision", () => {
  assert.match(migration, /'retain_while_active', 'manual_review'/);
  assert.doesNotMatch(migration, /'control_authorization'/);
  assert.match(migration, /\('control_identities', 'disabled', 365, 'anonymize'/);
});

// ── MFA flow — anti-regression assertions, not runtime proof ──────────────
// The AAL2 gate is only reachable if the shell can enrol and verify a factor.
// Runtime proof comes from the staging operator flow, not from these.
test("the Control shell can enrol, challenge and verify a TOTP factor", () => {
  assert.match(login, /auth\.mfa\.enroll\(/);
  assert.match(login, /auth\.mfa\.challenge\(/);
  assert.match(login, /auth\.mfa\.verify\(/);
  assert.match(login, /factorType: "totp"/);
  assert.match(login, /auth\.mfa\.listFactors\(/);
});

test("MFA edge states are handled: existing factor, stale enrolment, expiry, failure", () => {
  // an already verified factor goes to a challenge instead of a second enrolment
  assert.match(login, /factor\.status === "verified"/);
  // an abandoned enrolment is cleared so it cannot block a new one
  assert.match(login, /auth\.mfa\.unenroll\(/);
  // an expired challenge is recognised and can be re-requested
  assert.match(login, /\/expire\/i\.test\(error\.message\)/);
  assert.match(login, /Nieuwe verificatie aanvragen/);
  // a failed verification clears the code and keeps the user on the step
  assert.match(login, /Verificatie mislukt/);
});

test("the client never decides access itself", () => {
  // no client-side AAL bypass: the shell reloads and lets the server re-check
  assert.match(login, /window\.location\.reload\(\)/);
  // the shell reads no environment at all, so no flag can loosen it client-side
  assert.doesNotMatch(login, /process\.env/);
  // a signed-in user without a Control permission gets a dead end, not a retry loop
  assert.match(login, /reason === "forbidden"/);
  assert.match(login, /auth\.signOut\(\)/);
});
