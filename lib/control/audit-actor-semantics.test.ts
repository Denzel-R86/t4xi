import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gateC = readFileSync(
  "supabase/migrations/20260912120000_control_audit_actor_semantics.sql",
  "utf8",
);
const audit = readFileSync("lib/control/audit.ts", "utf8");

function statementsOf(sql: string): string {
  return sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");
}

// ── History must survive untouched ───────────────────────────────────────
test("no existing audit row is modified", () => {
  const sql = statementsOf(gateC);
  assert.doesNotMatch(sql, /update public\.control_audit_events/, "the trail may never be rewritten");
  assert.doesNotMatch(sql, /delete from public\.control_audit_events/);
  assert.doesNotMatch(sql, /truncate/i);
  // A rename is a catalog operation; a default on a new column does not rewrite.
  assert.match(sql, /rename column actor_identity_id to actor_control_identity_id/);
});

test("the new invariant is conditional and does not touch the historical rows", () => {
  assert.match(
    gateC,
    /check \(actor_kind <> 'user' or actor_identity_id is not null\) not valid/,
    "an unconditional check would either fail on history or forbid system events",
  );
});

test("a system event may exist without any actor", () => {
  assert.match(gateC, /check \(actor_kind in \('user', 'system'\)\)/);
  // No third kind: anonymous events are not written by any producer today.
  assert.doesNotMatch(gateC, /'anonymous'/);
});

// ── The three distinct facts ─────────────────────────────────────────────
test("the platform actor references identities, the Control actor stays optional", () => {
  assert.match(gateC, /add column actor_identity_id uuid references public\.identities\(id\) on delete restrict/);
  // The renamed column keeps its own foreign key to control_identities.
  assert.doesNotMatch(statementsOf(gateC), /drop constraint control_audit_events_actor_identity_id_fkey/);
});

test("the auth snapshot survives but stops being a reference", () => {
  assert.match(gateC, /drop constraint control_audit_events_actor_auth_user_id_fkey/);
  assert.doesNotMatch(statementsOf(gateC), /drop column actor_auth_user_id/);
});

test("every column that changed meaning is documented", () => {
  for (const column of ["actor_identity_id", "actor_control_identity_id", "actor_auth_user_id", "actor_kind"]) {
    assert.match(
      gateC,
      new RegExp(`comment on column public\\.control_audit_events\\.${column} is`),
      `${column} must carry its meaning in the schema, not only in a migration`,
    );
  }
});

test("both actor columns stay queryable", () => {
  assert.match(gateC, /rename to control_audit_events_control_actor_time_idx/);
  assert.match(gateC, /create index control_audit_events_platform_actor_time_idx/);
});

// ── The producers write the new semantics ────────────────────────────────
test("both producers write all three actor facts", () => {
  const inserts = audit.match(/insert\(\{[\s\S]*?\}\)/g) ?? [];
  assert.equal(inserts.length, 2, "there are exactly two audit producers in the application");
  for (const insert of inserts) {
    assert.match(insert, /actor_kind: "user"/);
    assert.match(insert, /actor_identity_id: actor\.platformIdentityId/);
    assert.match(insert, /actor_control_identity_id: actor\.controlIdentityId/);
    assert.match(insert, /actor_auth_user_id/);
  }
});

test("a denied non-operator still gets a real actor", () => {
  // The access producer accepts a null Control identity but requires a platform one.
  assert.match(audit, /if \(!actor\.platformIdentityId\) \{/);
  assert.match(audit, /platform_identity_unresolved/);
  // The required producer needs both, because a business mutation has an operator.
  assert.match(audit, /if \(!actor\.platformIdentityId \|\| !actor\.controlIdentityId\)/);
});

test("the actor is resolved through identities, never through auth_user_id on the domain", () => {
  const resolver = /async function resolveActor\([\s\S]*?\n\}/.exec(audit);
  assert.ok(resolver, "resolveActor must exist");
  assert.match(resolver[0], /\.from\("identities"\)[\s\S]*?\.eq\("auth_user_id", authUserId\)/);
  assert.match(resolver[0], /\.from\("control_identities"\)[\s\S]*?\.eq\("identity_id", platform\.id\)/);
  assert.match(resolver[0], /erased_at/);
});
