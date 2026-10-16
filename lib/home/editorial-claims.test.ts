import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import nl from "../../messages/nl.json";
import en from "../../messages/en.json";
import {
  approvedPrinciples,
  approvedQuietProofKeys,
  FORBIDDEN_CLAIMS,
  QUIET_PROOF_SLOTS,
  SERVICE_PRINCIPLES,
} from "./editorial-claims";

// Experience 2.0 PR 3.1 — Quiet proof + service principles. Claims-check §0c:
// alleen `approved` wordt gerenderd; verboden claims komen er nooit in.

const home = { nl: nl.home as Record<string, string>, en: en.home as Record<string, string> };
const page = readFileSync("app/[locale]/page.tsx", "utf8");
const editorial = readFileSync("components/horizon/editorial.tsx", "utf8");

test("quiet proof (#98): regel 1 + 2 approved, regel 3 vervalt als niet-gerenderde owner-plek", () => {
  assert.equal(QUIET_PROOF_SLOTS.length, 3);
  assert.deepEqual(approvedQuietProofKeys(), ["quietProof1", "proofOnder1"]);
  assert.equal(home.nl.quietProof1, "Uw prijs staat vast.");
  assert.equal(home.en.quietProof1, "Your fare is fixed.");
  assert.equal(home.nl.proofOnder1, "Geldige Nederlandse taxichauffeurskaart");
  assert.equal(home.en.proofOnder1, "Licensed Dutch taxi drivers");
  assert.equal(QUIET_PROOF_SLOTS[2].status, "owner");
});

test("principles (#98): vow2 verborgen, vow3/vow4 nieuwe NL-tekst met EN-vertaling", () => {
  assert.deepEqual(
    approvedPrinciples().map((p) => p.titleKey),
    ["vow1Titel", "vow3Titel", "vow4Titel"],
  );
  assert.equal(SERVICE_PRINCIPLES.find((p) => p.titleKey === "vow2Titel")?.status, "owner");
  assert.equal(home.nl.vow3Tekst, "Vertrek, bestemming, datum, tijd en bagage geeft u vooraf door.");
  assert.equal(home.nl.vow4Tekst, "Vul uw route in, bekijk de vaste prijs en vraag uw rit aan.");
  for (const key of ["vow3Titel", "vow4Titel"]) {
    assert.equal(SERVICE_PRINCIPLES.find((p) => p.titleKey === key)?.en, "en-translation");
  }
  // Geen operationele belofte meer in vow3 (ophaaltijd afstemmen, reistijd plannen).
  for (const locale of ["nl", "en"] as const) {
    assert.doesNotMatch(home[locale].vow3Tekst, /stemmen|plannen|agreed|plan/i);
  }
});

test("principles-grid: geen lege kolom bij drie principes", () => {
  assert.match(editorial, /3: "md:grid-cols-3"/);
  assert.match(editorial, /PRINCIPLE_COLUMNS\[principles\.length\]/);
});

test("alleen approved wordt gerenderd", () => {
  const withOwner = [...QUIET_PROOF_SLOTS, { status: "owner" as const, key: null, source: "x" }];
  assert.deepEqual(approvedQuietProofKeys(withOwner), ["quietProof1", "proofOnder1"]);
  const p = [...SERVICE_PRINCIPLES, { status: "owner" as const, titleKey: "x", textKey: "y", en: "approved" as const, source: "z" }];
  assert.equal(approvedPrinciples(p).length, SERVICE_PRINCIPLES.filter((e) => e.status === "approved").length);
  assert.match(page, /approvedQuietProofKeys\(\)/);
  assert.match(page, /approvedPrinciples\(\)/);
});

test("§0c: geen vluchtmonitoring, wachttijd of 24/7 in quiet proof of principles (NL + EN)", () => {
  const keys = [
    ...approvedQuietProofKeys(),
    ...approvedPrinciples().flatMap((p) => [p.titleKey, p.textKey]),
  ];
  for (const locale of ["nl", "en"] as const) {
    for (const key of keys) {
      const text = home[locale][key];
      assert.ok(text, `${locale}.home.${key} ontbreekt`);
      for (const re of FORBIDDEN_CLAIMS) assert.doesNotMatch(text, re, `${locale}.home.${key}: ${text}`);
    }
  }
});

test("het donkere vows-blok is weg; principles zijn een <ol> met hairlines, geen kaarten", () => {
  assert.doesNotMatch(page, /bg-ink px-\[5vw\]/, "donkere Recognition-sectie staat er nog");
  assert.match(editorial, /<ol /);
  assert.match(editorial, /border-t border-ink/);
  assert.doesNotMatch(editorial, /shadow-|rounded-|bg-card/, "geen kaarten: geen schaduw, radius of card-vlak");
});

test("quiet proof staat tussen hero en principles, met verticale JourneyLine", () => {
  const hero = page.indexOf('data-viewport="arrival"');
  const proof = page.indexOf("<QuietProofPattern");
  const principles = page.indexOf("<PrinciplesPattern");
  const certainty = page.indexOf('meaning="certainty"');
  assert.ok(hero > -1 && hero < proof && proof < principles && principles < certainty);
  assert.match(editorial, /<JourneyLine orientation="vertical"[^>]*decorative/);
});

test("B1: geen serif in quiet proof of principles; beweging alleen via Reveal", () => {
  assert.doesNotMatch(editorial, /font-display-serif|text-display-serif|font-playfair|font-serif\b|italic/);
  assert.doesNotMatch(editorial, /animate-|transition-|duration-\d|@keyframes|style=\{/);
});
