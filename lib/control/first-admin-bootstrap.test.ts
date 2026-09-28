import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Bewaakt het eenmalige bootstrapmechanisme voor de eerste Control-administrator.
 *
 * Het script draait onder operator-privileges buiten de applicatie om en wordt
 * dus niet door de gewone suite geraakt. Deze tests bewaken de eigenschappen die
 * het veilig maken: geen permanent databaseobject, UUID als enige zoeksleutel,
 * alle guards aanwezig, één transactie, en een auditrij die de Gate C-invariant
 * respecteert in plaats van omzeilt.
 */
const script = readFileSync("scripts/control/bootstrap-first-admin.sql", "utf8");
/** Alleen de uitvoerbare SQL: het commentaar legt juist uit wat er NIET langskomt. */
const executable = script
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");
const auth = readFileSync("lib/control/auth.ts", "utf8");

// ── Nul permanente attack surface ────────────────────────────────────────
test("het script laat geen enkel databaseobject achter", () => {
  // Een bootstrapfunctie of -RPC zou na gebruik blijven bestaan als permanent
  // doelwit dat een administrator kan aanmaken. Daarom: niets creëren.
  assert.doesNotMatch(script, /create\s+(or\s+replace\s+)?function/i);
  assert.doesNotMatch(script, /create\s+(or\s+replace\s+)?procedure/i);
  assert.doesNotMatch(script, /create\s+trigger/i);
  assert.doesNotMatch(script, /create\s+(unlogged\s+)?table/i, "ook geen tijdelijke tabel");
  assert.doesNotMatch(script, /grant\s+execute/i);
  // De inputgrens gebruikt transaction-local instellingen, die bij commit of
  // rollback vanzelf verdwijnen.
  assert.match(script, /set_config\('bootstrap\.auth_user_id', :'auth_user_id', true\)/);
});

test("het script is niet vanuit een browser of PostgREST bereikbaar", () => {
  // Er is geen aanroepbaar object; het is een .sql dat psql uitvoert.
  assert.doesNotMatch(script, /security\s+definer/i);
  assert.match(script, /psql/i, "het gebruik gaat expliciet via psql onder operator-privileges");
});

// ── Identiteit van de target ─────────────────────────────────────────────
test("de UUID is de enige zoeksleutel; e-mail bevestigt alleen", () => {
  assert.match(script, /from auth\.users u\s+where u\.id = v_auth_user_id/);
  assert.match(script, /from public\.identities i\s+where i\.auth_user_id = v_auth_user_id/);
  // Nergens een lookup op e-mail.
  assert.doesNotMatch(script, /from auth\.users[\s\S]{0,120}where[\s\S]{0,60}email\s*=/i);
  assert.match(script, /bootstrap_email_mismatch/);
});

test("het script maakt zelf geen auth-account aan", () => {
  assert.doesNotMatch(script, /insert into auth\.users/i);
});

// ── Guards ───────────────────────────────────────────────────────────────
test("alle tien guards zijn aanwezig en falen gesloten", () => {
  for (const guard of [
    "bootstrap_missing_auth_user_id",
    "bootstrap_invalid_auth_user_id",
    "bootstrap_missing_expect_email",
    "bootstrap_invalid_display_name",
    "bootstrap_schema_too_old",
    "bootstrap_auth_user_not_found",
    "bootstrap_email_mismatch",
    "bootstrap_platform_identity_missing",
    "bootstrap_admin_already_exists",
    "bootstrap_control_identity_exists",
    "bootstrap_legacy_control_identity_exists",
    "bootstrap_role_missing",
    "bootstrap_permissions_incomplete",
  ]) {
    assert.match(script, new RegExp(`raise exception '${guard}`), `${guard} ontbreekt`);
  }
});

test("bootstrap is na de eerste administrator niet meer geldig", () => {
  assert.match(script, /control_effective_admin_count\(\) into v_admins/);
  assert.match(script, /if v_admins <> 0 then[\s\S]{0,200}bootstrap_admin_already_exists/);
});

// ── Transactie en postconditie ───────────────────────────────────────────
test("alles gebeurt in één transactie met een exacte postconditie", () => {
  assert.match(script, /^begin;$/m);
  assert.match(script, /^commit;$/m);
  // Exact één, niet "minstens één": alles anders is een half resultaat.
  assert.match(script, /if v_admins <> 1 then[\s\S]{0,200}bootstrap_postcondition_failed/);
});

test("granted_by blijft leeg, en alleen hier", () => {
  assert.match(script, /insert into public\.control_identity_roles \(identity_id, role_id, granted_by\)[\s\S]{0,120}null\)/);
});

// ── Audit ────────────────────────────────────────────────────────────────
test("de bootstrap wordt geaudit als systeemgebeurtenis, zonder invariant te omzeilen", () => {
  // Er is per definitie geen geauthenticeerde Control-actor. 'user' zou een
  // platformactor eisen en hier dus een onwaarheid zijn.
  assert.match(script, /\('system', null, null, null,/);
  assert.match(script, /'control\.first_admin\.bootstrapped'/);
  assert.doesNotMatch(script, /alter table public\.control_audit_events/i, "geen constraint wijzigen");
  assert.doesNotMatch(script, /disable trigger/i);
});

test("er passeert geen credential door de uitvoerbare SQL", () => {
  assert.doesNotMatch(executable, /password|secret|token|api[_-]?key|invite/i);
  // Het script leest geen enkel auth-geheim uit, ook niet ter controle.
  assert.doesNotMatch(executable, /encrypted_password|confirmation_token|recovery_token/i);
});

// ── Productie-invariant uit de applicatielaag ────────────────────────────
test("MFA blijft afgedwongen tenzij CONTROL_REQUIRE_AAL2 op 'false' staat", () => {
  // De database kent geen AAL: `control_authorize` geeft een AAL1-sessie gewoon
  // toegang. De hele MFA-gate zit hier. Deze regel is daarmee de enige barriere
  // tussen een wachtwoord-only sessie en Control.
  assert.match(auth, /process\.env\.CONTROL_REQUIRE_AAL2 !== "false" && aal !== "aal2"/);
  assert.match(auth, /reason: "mfa_required"/);
  assert.match(auth, /assurance\.currentLevel === "aal2"/);
});
