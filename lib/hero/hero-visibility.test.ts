import assert from "node:assert/strict";
import test from "node:test";
import {
  anyHidesStickyCta,
  isTextEntry,
  quoteOutcomeKey,
  shouldHideStickyCta,
  shouldRevealResult,
  type QuoteOutcome,
  type RevealInput,
} from "./hero-visibility";

// ── StickyCta ────────────────────────────────────────────────────────────────

test("StickyCta blijft staan zolang de hero-actie niet in beeld is en er geen focus is", () => {
  assert.equal(shouldHideStickyCta({ resultRatio: 0, focusWithin: false }), false);
});

test("StickyCta blijft staan als de resultaatregel maar half in beeld is", () => {
  assert.equal(shouldHideStickyCta({ resultRatio: 0.5, focusWithin: false }), false);
});

test("StickyCta wijkt als de resultaatregel grotendeels (>= 75%) in beeld is", () => {
  assert.equal(shouldHideStickyCta({ resultRatio: 0.75, focusWithin: false }), true);
  assert.equal(shouldHideStickyCta({ resultRatio: 1, focusWithin: false }), true);
});

test("StickyCta wijkt zolang de klant de zin invult (focus binnen de zin)", () => {
  assert.equal(shouldHideStickyCta({ resultRatio: 0, focusWithin: true }), true);
});

test("zonder aangemelde zin wijkt de StickyCta nooit (startwaarde = zichtbaar)", () => {
  assert.equal(anyHidesStickyCta([]), false);
  assert.equal(anyHidesStickyCta([{ resultRatio: 0, focusWithin: false }]), false);
  assert.equal(anyHidesStickyCta([{ resultRatio: 0, focusWithin: false }, { resultRatio: 0.9, focusWithin: false }]), true);
});

// ── Automatisch tonen van de uitkomst ────────────────────────────────────────

const RIDE: QuoteOutcome = {
  status: "ready",
  price: 89,
  pickup: "Amsterdam Zuidas",
  dropoff: "Schiphol",
  date: "2026-11-12",
  time: "14:30",
  luggage: "1-2-koffers",
};

const VIEWPORT = 812;
const belowFold = { resultTop: 866, resultBottom: 990, sentenceTop: 640, viewportHeight: VIEWPORT };
const inView = { resultTop: 700, resultBottom: 790, sentenceTop: 500, viewportHeight: VIEWPORT };

function reveal(over: Partial<RevealInput>): boolean {
  return shouldRevealResult({ key: quoteOutcomeKey(RIDE), lastHandledKey: null, textEntryFocused: false, ...belowFold, ...over });
}

test("geen uitkomst (idle/loading) geeft geen sleutel", () => {
  assert.equal(quoteOutcomeKey({ ...RIDE, status: "idle" }), null);
  assert.equal(quoteOutcomeKey({ ...RIDE, status: "loading" }), null);
});

test("sleutel verandert met prijs, status en rit, niet bij dezelfde uitkomst", () => {
  const k = quoteOutcomeKey(RIDE);
  assert.equal(quoteOutcomeKey({ ...RIDE }), k);
  assert.notEqual(quoteOutcomeKey({ ...RIDE, price: 95 }), k);
  assert.notEqual(quoteOutcomeKey({ ...RIDE, luggage: "3-koffers" }), k);
  assert.notEqual(quoteOutcomeKey({ ...RIDE, time: "15:00" }), k);
  assert.notEqual(quoteOutcomeKey({ ...RIDE, status: "onrequest", price: null }), k);
});

test("zelfde prijs opnieuw → geen scroll", () => {
  const key = quoteOutcomeKey(RIDE);
  assert.equal(reveal({ key, lastHandledKey: key }), false);
});

test("nieuwe prijs al in beeld → geen scroll", () => {
  assert.equal(reveal({ ...inView }), false);
});

test("nieuwe prijs onder de vouw → één scroll (daarna is de sleutel afgehandeld)", () => {
  const key = quoteOutcomeKey(RIDE);
  assert.equal(reveal({ key, lastHandledKey: null }), true);
  assert.equal(reveal({ key, lastHandledKey: key }), false);
});

test("typen in een combobox/tekstveld → geen scroll", () => {
  assert.equal(reveal({ textEntryFocused: true }), false);
});

test("bovenkant van de zin uit beeld (klant is elders op de pagina) → geen scroll", () => {
  assert.equal(reveal({ sentenceTop: -40 }), false);
  assert.equal(reveal({ sentenceTop: 900 }), false);
});

test("geen uitkomst → geen scroll", () => {
  assert.equal(reveal({ key: null }), false);
});

test("isTextEntry: combobox en tekstvelden wel; select, datum, tijd en knoppen niet", () => {
  assert.equal(isTextEntry({ tagName: "INPUT", type: "text", role: "combobox" }), true);
  assert.equal(isTextEntry({ tagName: "INPUT", type: "" }), true);
  assert.equal(isTextEntry({ tagName: "INPUT", type: "tel" }), true);
  assert.equal(isTextEntry({ tagName: "TEXTAREA" }), true);
  assert.equal(isTextEntry({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isTextEntry({ tagName: "SELECT" }), false);
  assert.equal(isTextEntry({ tagName: "INPUT", type: "time" }), false);
  assert.equal(isTextEntry({ tagName: "INPUT", type: "date" }), false);
  assert.equal(isTextEntry({ tagName: "A" }), false);
  assert.equal(isTextEntry(null), false);
});
