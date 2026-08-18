// Pure unit tests voor de gemeente→standplaats-koppeling (2026-08-18). Bewijst
// specifiek dat "Laren" (gemeente Laren, Noord-Holland) en het gelijknamige
// "Laren" in gemeente Lochem (Gelderland) nooit met elkaar verward worden,
// omdat de koppeling uitsluitend op de OFFICIËLE gemeentenaam werkt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeGemeenteNaam, resolveBaseIdForGemeente } from "@/lib/pricing/service-area";

const MAP = new Map([
  [normalizeGemeenteNaam("Almere"), "base-almere"],
  [normalizeGemeenteNaam("Laren"), "base-almere"],
  [normalizeGemeenteNaam("Hilversum"), "base-almere"],
  [normalizeGemeenteNaam("Nissewaard"), "base-spijkenisse"],
  [normalizeGemeenteNaam("Rotterdam"), "base-spijkenisse"],
]);

test("normalizeGemeenteNaam: trimt witruimte en normaliseert hoofdletters", () => {
  assert.equal(normalizeGemeenteNaam("  Almere  "), "almere");
  assert.equal(normalizeGemeenteNaam("ALMERE"), "almere");
  assert.equal(normalizeGemeenteNaam("almere"), "almere");
});

test("resolveBaseIdForGemeente: exacte match (case/witruimte-ongevoelig) → toegewezen standplaats", () => {
  assert.equal(resolveBaseIdForGemeente("Almere", MAP), "base-almere");
  assert.equal(resolveBaseIdForGemeente("  ALMERE  ", MAP), "base-almere");
});

test("resolveBaseIdForGemeente: gemeente Laren (Noord-Holland) → basis Almere", () => {
  assert.equal(resolveBaseIdForGemeente("Laren", MAP), "base-almere");
});

test("resolveBaseIdForGemeente: gemeente Lochem (de ECHTE gemeente van het gelijknamige 'Laren' in Gelderland) → NIET toegewezen — nooit verward met gemeente Laren (NH)", () => {
  assert.equal(resolveBaseIdForGemeente("Lochem", MAP), null);
});

test("resolveBaseIdForGemeente: gemeente Nissewaard (Spijkenisse) → basis Spijkenisse", () => {
  assert.equal(resolveBaseIdForGemeente("Nissewaard", MAP), "base-spijkenisse");
});

test("resolveBaseIdForGemeente: onbekende/niet-geconfigureerde gemeente → null (nooit een gok naar de dichtstbijzijnde standplaats)", () => {
  assert.equal(resolveBaseIdForGemeente("Utrecht", MAP), null);
  assert.equal(resolveBaseIdForGemeente("Amsterdam", MAP), null);
});

test("resolveBaseIdForGemeente: lege string → null", () => {
  assert.equal(resolveBaseIdForGemeente("", MAP), null);
});
