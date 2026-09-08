import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALLOWLIST_ENV,
  SIMULATOR_RECIPIENTS,
  checkRecipients,
  normalizeRecipient,
  parseAllowlist,
  splitRecipients,
} from "@/lib/communication/policies/recipients";

const allow = (list: string) => ({ [ALLOWLIST_ENV]: list });

test("productie blokkeert nooit — ook niet zonder allowlist", () => {
  for (const appEnv of ["production", "prod"]) {
    assert.deepEqual(
      checkRecipients("wie-dan-ook@example.com", { APP_ENV: appEnv }),
      { allowed: true },
      `${appEnv} hoort ongewijzigd door te laten`
    );
  }
});

test("buiten productie geldt default-deny zonder allowlist", () => {
  for (const appEnv of ["development", "staging"]) {
    const zonder = checkRecipients("sam@example.com", { APP_ENV: appEnv });
    assert.equal(zonder.allowed, false, `${appEnv} moet weigeren`);
    assert.equal(zonder.allowed === false && zonder.reason, "allowlist_empty");
  }
});

test("een lege of enkel-witruimte allowlist telt als niet geconfigureerd", () => {
  for (const waarde of ["", "   ", " , ; "]) {
    const besluit = checkRecipients("sam@example.com", { APP_ENV: "staging", ...allow(waarde) });
    assert.equal(besluit.allowed, false);
    assert.equal(besluit.allowed === false && besluit.reason, "allowlist_empty");
  }
});

test("een adres op de allowlist mag door, een ander niet", () => {
  const env = { APP_ENV: "staging", ...allow("sam@example.com, ops@t4xi.nl") };
  assert.deepEqual(checkRecipients("sam@example.com", env), { allowed: true });

  const geweigerd = checkRecipients("vreemde@example.com", env);
  assert.equal(geweigerd.allowed, false);
  assert.equal(geweigerd.allowed === false && geweigerd.reason, "not_allowlisted");
});

test("hoofdletters en witruimte kunnen de allowlist niet omzeilen", () => {
  const env = { APP_ENV: "staging", ...allow("sam@example.com") };
  for (const variant of ["SAM@EXAMPLE.COM", "  Sam@Example.com  ", "T4XI <SAM@example.com>"]) {
    assert.deepEqual(checkRecipients(variant, env), { allowed: true }, variant);
  }
});

test("alle ontvangers worden beoordeeld; één verkeerde blokkeert het hele bericht", () => {
  const env = { APP_ENV: "staging", ...allow("sam@example.com") };
  const gemengd = checkRecipients(["sam@example.com", "vreemde@example.com"], env);
  assert.equal(gemengd.allowed, false, "een deels toegestane set mag niet half verzonden worden");
  assert.deepEqual(gemengd.allowed === false && gemengd.blocked, ["vreemde@example.com"]);

  // Ook wanneer de ontvangers in één veld staan.
  const inEenVeld = checkRecipients("sam@example.com, vreemde@example.com", env);
  assert.equal(inEenVeld.allowed, false);
});

test("de simulatoradressen mogen altijd, ook zonder allowlist", () => {
  for (const adres of SIMULATOR_RECIPIENTS) {
    assert.deepEqual(checkRecipients(adres, { APP_ENV: "staging" }), { allowed: true }, adres);
  }
  // Maar ze openen de deur niet voor de rest.
  const met = checkRecipients(["bounced@resend.dev", "echt@example.com"], { APP_ENV: "staging" });
  assert.equal(met.allowed, false);
  assert.deepEqual(met.allowed === false && met.blocked, ["echt@example.com"]);
});

test("NODE_ENV kan de vangrail niet openzetten", () => {
  // APP_ENV is de autoriteit. Een deploy die per ongeluk NODE_ENV=production
  // draait maar staging is, blijft beschermd.
  const besluit = checkRecipients("sam@example.com", {
    APP_ENV: "staging",
    NODE_ENV: "production",
  });
  assert.equal(besluit.allowed, false);
});

test("een onbekende omgeving valt terug op weigeren, niet op toestaan", () => {
  assert.equal(checkRecipients("sam@example.com", {}).allowed, false);
  assert.equal(checkRecipients("sam@example.com", { APP_ENV: "onzin" }).allowed, false);
});

test("hulpfuncties normaliseren zoals de policy verwacht", () => {
  assert.equal(normalizeRecipient("T4XI <Booking@T4XI.nl>"), "booking@t4xi.nl");
  assert.equal(normalizeRecipient("  A@B.NL "), "a@b.nl");
  assert.deepEqual(splitRecipients("a@b.nl; C@D.nl"), ["a@b.nl", "c@d.nl"]);
  assert.deepEqual([...parseAllowlist("A@B.nl , c@d.nl\ne@f.nl")], ["a@b.nl", "c@d.nl", "e@f.nl"]);
  assert.equal(parseAllowlist(undefined).size, 0);
});
