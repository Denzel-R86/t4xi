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

test("quiet proof: regel 1 is de goedgekeurde §0c-claim, plek 2 en 3 wachten op de eigenaar", () => {
  assert.equal(QUIET_PROOF_SLOTS.length, 3);
  assert.deepEqual(approvedQuietProofKeys(), ["quietProof1"]);
  assert.equal(home.nl.quietProof1, "Uw prijs staat vast.");
  assert.ok(home.en.quietProof1, "EN-vertaling ontbreekt");
  assert.deepEqual(
    QUIET_PROOF_SLOTS.slice(1).map((s) => s.status),
    ["owner", "owner"],
    "regel 2 en 3 pas renderen na keuze eigenaar (masterplan §3)",
  );
});

test("alleen approved wordt gerenderd", () => {
  const withOwner = [...QUIET_PROOF_SLOTS, { status: "owner" as const, key: null, source: "x" }];
  assert.deepEqual(approvedQuietProofKeys(withOwner), ["quietProof1"]);
  const p = [...SERVICE_PRINCIPLES, { status: "owner" as const, titleKey: "x", textKey: "y", source: "z" }];
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
