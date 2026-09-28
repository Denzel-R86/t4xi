import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const GATE_A = "supabase/migrations/20260912100000_platform_identity_foundation.sql";
const gateA = readFileSync(GATE_A, "utf8");

/** Every migration file, so an invariant can be checked over the whole history. */
function allMigrations(): { file: string; sql: string }[] {
  return readdirSync("supabase/migrations")
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, sql: readFileSync(`supabase/migrations/${file}`, "utf8") }));
}

// ── ADR-015 I1, checked over the source rather than agreed ───────────────
test("only identities and the retiring Control legacy hold a foreign key into auth", () => {
  const offenders: string[] = [];
  for (const { file, sql } of allMigrations()) {
    for (const line of sql.split("\n")) {
      if (!/references\s+auth\./i.test(line)) continue;
      const isPlatformIdentity = /auth_user_id uuid unique references auth\.users/.test(line);
      const isKnownLegacy =
        file === "20260908120000_control_security_foundation.sql" &&
        /control_identities|actor_auth_user_id/.test(sql.slice(0, sql.indexOf(line)).slice(-400) + line);
      if (!isPlatformIdentity && !isKnownLegacy) offenders.push(`${file}: ${line.trim()}`);
    }
  }
  assert.deepEqual(offenders, [], "a new migration introduced an auth foreign key outside identities");
});

test("the two Sprint-1 auth links are known, and one of them is dropped in Gate C", () => {
  const sprint1 = readFileSync(
    "supabase/migrations/20260908120000_control_security_foundation.sql",
    "utf8",
  );
  const links = sprint1.split("\n").filter((line) => /references auth\.users/.test(line));
  assert.equal(links.length, 2, "Sprint 1 has exactly two auth links; a third would be new drift");
  const gateC = readFileSync(
    "supabase/migrations/20260912120000_control_audit_actor_semantics.sql",
    "utf8",
  );
  assert.match(gateC, /drop constraint control_audit_events_actor_auth_user_id_fkey/);
  // The remaining one is documented as retiring, not forgotten.
  assert.match(gateA, /auth_user_id is legacy and retires in Gate E/);
});

// ── The shape the owner decided on ───────────────────────────────────────
test("identities carries the auth link and nothing operational", () => {
  assert.match(gateA, /auth_user_id uuid unique references auth\.users\(id\) on delete set null/);
  // Erasure and unlinking must never be blocked by a domain row.
  assert.doesNotMatch(gateA, /auth_user_id[^\n]*not null/);
  assert.doesNotMatch(gateA, /on delete restrict[^\n]*auth\.users/);
  // No second access switch: the operational lifecycle stays in the domain, so
  // the table definition carries no status column and no status vocabulary.
  const definition = /create table public\.identities \(([\s\S]*?)\n\);/.exec(gateA);
  assert.ok(definition, "the identities definition must be findable");
  assert.doesNotMatch(definition[1], /status/);
  assert.doesNotMatch(gateA, /'suspended'|'active'/);
});

test("an erased identity can hold no way back in", () => {
  assert.match(gateA, /constraint identities_erased_has_no_auth[\s\S]*?check \(erased_at is null or auth_user_id is null\)/);
});

test("identity_roles is deliberately absent", () => {
  for (const { sql } of allMigrations()) {
    assert.doesNotMatch(sql, /create table public\.identity_roles/);
  }
});

// ── Coverage and the bridge ──────────────────────────────────────────────
test("the backfill is driven by auth.users, not by control_identities", () => {
  assert.match(gateA, /insert into public\.identities \(auth_user_id\)[\s\S]*?from auth\.users u/);
  assert.match(gateA, /Driven by auth\.users and not by control_identities/i);
});

test("coverage is proven inside the transaction before the constraint lands", () => {
  const guard = gateA.indexOf("gate_a_incomplete_bridge");
  const notNull = gateA.indexOf("alter column identity_id set not null");
  assert.ok(guard > -1, "the migration must refuse an incomplete bridge");
  assert.ok(guard < notNull, "coverage must be proven before identity_id becomes mandatory");
  assert.match(gateA, /unique \(identity_id\)/, "one platform identity maps to at most one operator");
});

test("the auth trigger guarantees an identity for every future account", () => {
  assert.match(gateA, /create trigger on_auth_user_created[\s\S]*?after insert on auth\.users/);
  assert.match(gateA, /on conflict \(auth_user_id\) do nothing/);
  assert.match(gateA, /security definer/);
});

test("no client role can reach identities", () => {
  assert.match(gateA, /alter table public\.identities enable row level security/);
  assert.match(gateA, /revoke all on table public\.identities from public, anon, authenticated/);
  assert.doesNotMatch(gateA, /create policy[^\n]*on public\.identities/);
});
