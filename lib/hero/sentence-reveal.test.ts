import assert from "node:assert/strict";
import test from "node:test";
import { journeyStateFor, journeyTransition } from "@/lib/horizon/journey-line-state";
import { priceRevealed, resultBusy, sentencePassengers, SENTENCE_PASSENGERS } from "./sentence-reveal";

test("passagiers: 1–4 zoals /boeken, alles anders → 1", () => {
  assert.deepEqual([...SENTENCE_PASSENGERS], [1, 2, 3, 4]);
  for (const n of [1, 2, 3, 4]) assert.equal(sentencePassengers(String(n)), n);
  for (const bad of ["0", "5", "2.5", "", "abc", null, undefined, -1]) assert.equal(sentencePassengers(bad), 1);
});

test("prijs pas na de reis; onrequest/error zonder vertraging", () => {
  assert.equal(priceRevealed("ready", "travelling"), false);
  assert.equal(priceRevealed("ready", "arrived"), true);
  assert.equal(priceRevealed("onrequest", "route"), false);
  assert.equal(resultBusy("ready", "travelling"), true);
  assert.equal(resultBusy("ready", "arrived"), false);
  assert.equal(resultBusy("loading", "route"), true);
  assert.equal(resultBusy("onrequest", "route"), false);
  assert.equal(resultBusy("error", "route"), false);
});

test("keten zin: ready met quoteId → travelling → arrived; reduced motion direct arrived", () => {
  const pick = {};
  const ready = { status: "ready" as const, quoteId: "q-1" };
  const rest = journeyStateFor(ready, pick, pick);
  assert.equal(rest, "arrived");
  assert.equal(journeyTransition("route", rest, { reducedMotion: false }), "travelling");
  assert.equal(journeyTransition("route", rest, { reducedMotion: true }), "arrived");
  // onrequest bereikt nooit arrived (geen backend-bevestigde quote)
  assert.equal(journeyStateFor({ status: "onrequest" }, pick, pick), "route");
});
