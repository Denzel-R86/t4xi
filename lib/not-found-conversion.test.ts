import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const notFoundPage = readFileSync("app/[locale]/not-found.tsx", "utf8");
const seo = readFileSync("lib/seo-locale.ts", "utf8");
const nl = JSON.parse(readFileSync("messages/nl.json", "utf8"));
const en = JSON.parse(readFileSync("messages/en.json", "utf8"));

test("locale-404 biedt directe vervolgstappen naar prijsberekening en boeken", () => {
  assert.match(notFoundPage, /href="\/tarieven"/);
  assert.match(notFoundPage, /href="\/boeken"/);
  assert.match(notFoundPage, /min-h-\[52px\]/);
});

test("locale-404 vult drie populaire Schipholritten vooraf in", () => {
  assert.match(notFoundPage, /pickup: "Amsterdam Centrum"/);
  assert.match(notFoundPage, /pickup: "Rotterdam"/);
  assert.match(notFoundPage, /pickup: "Almere Poort"/);
  assert.match(notFoundPage, /dropoff=.*Schiphol Airport/);
  assert.match(notFoundPage, /href=\{bookingHref\(route\.pickup\)\}/);
});

test("404-vervolgstappen zijn volledig vertaald in NL en EN", () => {
  for (const messages of [nl, en]) {
    assert.ok(messages.nietGevonden.prijsBerekenen);
    assert.ok(messages.nietGevonden.ritBoeken);
    assert.ok(messages.nietGevonden.populaireKop);
    assert.ok(messages.nietGevonden.populaireTekst);
    assert.ok(messages.nietGevonden.routeBekijken);
    assert.deepEqual(Object.keys(messages.nietGevonden.routes), ["amsterdam", "rotterdam", "almere"]);
  }
});

test("de gerepareerde absolute 404-metadata blijft behouden", () => {
  assert.match(notFoundPage, /metadata: Metadata = notFoundMetadata\(\)/);
  assert.match(seo, /notFoundMetadata\(title = "404 — T4XI"\)[\s\S]*?title: \{ absolute: title \}/);
});
