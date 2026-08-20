import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const home = readFileSync("app/[locale]/page.tsx", "utf8");
const patterns = readFileSync("components/horizon/patterns.tsx", "utf8");
const nl = JSON.parse(readFileSync("messages/nl.json", "utf8"));
const en = JSON.parse(readFileSync("messages/en.json", "utf8"));

test("homepagehero gebruikt een prijsgerichte CTA in beide talen", () => {
  assert.equal(nl.zin.bevestig, "Bekijk mijn vaste prijs");
  assert.equal(en.zin.bevestig, "See my fixed fare");
});

test("homepagehero is direct zichtbaar en toont een mobiele campagne-uitsnede", () => {
  assert.match(home, /<NarrativePattern[\s\S]*?immediate[\s\S]*?echoClassName="font-light text-secondary"/);
  assert.match(home, /<Reveal immediate>/);
  assert.match(home, /order-first h-\[32svh\][\s\S]*?md:order-none/);
  assert.match(home, /object-\[62%_center\][\s\S]*?md:object-\[57%_center\]/);
});

test("kleine vaste-prijslabels gebruiken de contrastrijkere secundaire tekstkleur", () => {
  assert.match(patterns, /e\.factNote[\s\S]*?text-secondary/);
});
