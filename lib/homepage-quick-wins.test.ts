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

test("ledger toont per stad een stadsdeel, nooit de terugvalprijs op stadsniveau", () => {
  const blok = home.match(/const LEDGER_SELECTIE[\s\S]*?\n\];/)?.[0] ?? "";
  assert.ok(blok, "LEDGER_SELECTIE niet gevonden");

  const selectie = [...blok.matchAll(/citySlug: "([^"]+)", from: "([^"]+)"/g)]
    .map(([, citySlug, from]) => ({ citySlug, from }));
  assert.ok(selectie.length >= 6);

  // De rij op stadsniveau heet exact zoals de stad ("Den Haag", "Rotterdam") en
  // is de terugval voor adressen zonder stadsdeel — per definitie het duurste
  // tarief van die stad. Wie die hier selecteert, adverteert het hoogste bedrag.
  const stadsnamen: Record<string, string> = {
    amsterdam: "Amsterdam",
    almere: "Almere",
    "den-haag": "Den Haag",
    rotterdam: "Rotterdam",
    utrecht: "Utrecht",
    spijkenisse: "Spijkenisse",
  };
  for (const { citySlug, from } of selectie) {
    assert.notEqual(
      from,
      stadsnamen[citySlug],
      `ledger wijst voor ${citySlug} naar de catch-all "${from}" in plaats van een stadsdeel`,
    );
  }
});
