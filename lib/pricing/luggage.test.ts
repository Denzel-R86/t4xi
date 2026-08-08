import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyLuggage, LUGGAGE_PIECES } from "@/lib/pricing/luggage";

test("bekende bindende categorieën → binding + gedocumenteerde capaciteit", () => {
  assert.deepEqual(classifyLuggage("handbagage"), { kind: "binding", category: "handbagage", pieces: 0 });
  assert.deepEqual(classifyLuggage("1-2-koffers"), { kind: "binding", category: "1-2-koffers", pieces: 2 });
  assert.deepEqual(classifyLuggage("3-koffers"), { kind: "binding", category: "3-koffers", pieces: 3 });
  // Capaciteitskaart is exact en compleet.
  assert.deepEqual(LUGGAGE_PIECES, { handbagage: 0, "1-2-koffers": 2, "3-koffers": 3 });
});

test("'overleg' → on_request (geen bindende boeking)", () => {
  assert.deepEqual(classifyLuggage("overleg"), { kind: "on_request", category: "overleg" });
});

test("lege of null waarde → invalid (fail-closed)", () => {
  assert.deepEqual(classifyLuggage(""), { kind: "invalid" });
  assert.deepEqual(classifyLuggage("   "), { kind: "invalid" });
  assert.deepEqual(classifyLuggage(null), { kind: "invalid" });
  assert.deepEqual(classifyLuggage(undefined), { kind: "invalid" });
});

test("willekeurige/onbekende tekst → invalid (kan de controle niet omzeilen)", () => {
  assert.deepEqual(classifyLuggage("999-koffers"), { kind: "invalid" });
  assert.deepEqual(classifyLuggage("gratis"), { kind: "invalid" });
  assert.deepEqual(classifyLuggage("handbagage; drop table"), { kind: "invalid" });
});

test("normaliseert schrijfwijze (trim + hoofdletters) zodat alternatieve tekst niet omzeilt", () => {
  assert.deepEqual(classifyLuggage("  HANDBAGAGE "), { kind: "binding", category: "handbagage", pieces: 0 });
  assert.deepEqual(classifyLuggage("Overleg"), { kind: "on_request", category: "overleg" });
});
