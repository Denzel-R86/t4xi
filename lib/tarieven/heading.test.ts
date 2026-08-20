import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const nl = JSON.parse(readFileSync("messages/nl.json", "utf8"));
const en = JSON.parse(readFileSync("messages/en.json", "utf8"));

test("Nederlandse tarieven-H1 benoemt taxitarieven en de vaste-prijsbelofte", () => {
  assert.equal(nl.routezoeker.heroKop1, "Taxitarieven");
  assert.equal(nl.routezoeker.heroKop2, "zonder verrassingen.");
});

test("Engelse tarieven-H1 blijft natuurlijk Engelstalig", () => {
  assert.equal(en.routezoeker.heroKop1, "Arrive composed.");
  assert.equal(en.routezoeker.heroKop2, "Your journey begins with certainty.");
});
