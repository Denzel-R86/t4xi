import assert from "node:assert/strict";
import test from "node:test";
import {
  latestResultRatio,
  anyHidesStickyCta,
  blockUnderStickyBar,
  isTextEntry,
  quoteOutcomeKey,
  shouldHideStickyCta,
  shouldRevealResult,
  type QuoteOutcome,
  type RevealInput,
} from "./hero-visibility";

// ── StickyCta ────────────────────────────────────────────────────────────────

test("StickyCta blijft staan zolang de hero-actie niet in beeld is", () => {
  assert.equal(shouldHideStickyCta({ resultRatio: 0 }), false);
});

test("StickyCta blijft staan als de resultaatregel maar half in beeld is", () => {
  assert.equal(shouldHideStickyCta({ resultRatio: 0.5 }), false);
});

test("StickyCta wijkt als de resultaatregel grotendeels (>= 75%) in beeld is", () => {
  assert.equal(shouldHideStickyCta({ resultRatio: 0.75 }), true);
  assert.equal(shouldHideStickyCta({ resultRatio: 1 }), true);
});

test("zonder aangemelde zin wijkt de StickyCta nooit (startwaarde = zichtbaar)", () => {
  assert.equal(anyHidesStickyCta([]), false);
  assert.equal(anyHidesStickyCta([{ resultRatio: 0 }]), false);
  assert.equal(anyHidesStickyCta([{ resultRatio: 0 }, { resultRatio: 0.9 }]), true);
});

// ── Automatisch tonen van de uitkomst ────────────────────────────────────────

const RIDE: QuoteOutcome = {
  status: "ready",
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

test("sleutel = rit + status: verandert met route, datum, tijd, bagage en status", () => {
  const k = quoteOutcomeKey(RIDE);
  assert.equal(quoteOutcomeKey({ ...RIDE }), k);
  assert.notEqual(quoteOutcomeKey({ ...RIDE, dropoff: "Rotterdam The Hague Airport" }), k);
  assert.notEqual(quoteOutcomeKey({ ...RIDE, date: "2026-11-13" }), k);
  assert.notEqual(quoteOutcomeKey({ ...RIDE, luggage: "3-koffers" }), k);
  assert.notEqual(quoteOutcomeKey({ ...RIDE, time: "15:00" }), k);
  assert.notEqual(quoteOutcomeKey({ ...RIDE, status: "onrequest" }), k);
});

test("PR 2.1: ander aantal passagiers = nieuwe rit; ontbrekend telt als 1", () => {
  const k = quoteOutcomeKey(RIDE);
  assert.equal(quoteOutcomeKey({ ...RIDE, passengers: 1 }), k);
  assert.notEqual(quoteOutcomeKey({ ...RIDE, passengers: 3 }), k);
  assert.notEqual(quoteOutcomeKey({ ...RIDE, passengers: 3 }), quoteOutcomeKey({ ...RIDE, passengers: 4 }));
});

test("dubbele response voor dezelfde rit → geen scroll", () => {
  const key = quoteOutcomeKey(RIDE);
  assert.equal(reveal({ key, lastHandledKey: key }), false);
});

test("andere route, zelfde prijs → wel scroll (nieuwe rit)", () => {
  const prev = quoteOutcomeKey(RIDE);
  const next = quoteOutcomeKey({ ...RIDE, pickup: "Utrecht Centraal" });
  assert.equal(reveal({ key: next, lastHandledKey: prev }), true);
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

test("StickyCta volgt de nieuwste meting als een callback meerdere entries bevat", () => {
  // Bij laden in beeld, daarna snel naar de onderkant gescrold; beide entries komen
  // in één (vertraagde) callback binnen. De oudste lezen liet de balk verborgen.
  const batch = [
    { isIntersecting: true, intersectionRatio: 1 },
    { isIntersecting: false, intersectionRatio: 0 },
  ];
  assert.equal(latestResultRatio(batch, 0), 0);
  assert.equal(shouldHideStickyCta({ resultRatio: latestResultRatio(batch, 0) }), false);
  assert.equal(latestResultRatio([...batch].reverse(), 0), 1);
  assert.equal(latestResultRatio([], 0.8), 0.8);
});

// ── PR 2.6: zinsblok achter de balk (F-14-rest, mobiel) ─────────────────────

test("StickyCta wijkt zolang een deel van de zin achter de balk ligt", () => {
  assert.equal(shouldHideStickyCta({ resultRatio: 0, blockUnderBar: true }), true);
  assert.equal(shouldHideStickyCta({ resultRatio: 0, blockUnderBar: false }), false);
  assert.equal(shouldHideStickyCta({ resultRatio: 0.8, blockUnderBar: false }), true);
});

test("blockUnderStickyBar: gemeten posities 375×812 en iPhone 13 (390×664), balk 69px", () => {
  // Bij laden: zin begint in de balkstrook → overlap.
  assert.equal(blockUnderStickyBar({ top: 655, bottom: 1017 }, 812, 69), true);
  assert.equal(blockUnderStickyBar({ top: 615, bottom: 977 }, 664, 69), true);
  // Zin volledig boven de balk (voorbij de hero gescrold) → geen overlap.
  assert.equal(blockUnderStickyBar({ top: 100, bottom: 743 }, 812, 69), false);
  assert.equal(blockUnderStickyBar({ top: -300, bottom: 200 }, 664, 69), false);
  // Zin volledig onder het venster (bv. hoge hero) → balk mag blijven.
  assert.equal(blockUnderStickyBar({ top: 812, bottom: 1170 }, 812, 69), false);
  // Rand: onderkant precies op de bovenkant van de balk = geen overlap.
  assert.equal(blockUnderStickyBar({ top: 400, bottom: 595 }, 664, 69), false);
  assert.equal(blockUnderStickyBar({ top: 400, bottom: 596 }, 664, 69), true);
});

test("blockUnderStickyBar: geen balk of leeg blok → nooit verbergen", () => {
  assert.equal(blockUnderStickyBar({ top: 700, bottom: 900 }, 812, 0), false);
  assert.equal(blockUnderStickyBar({ top: 0, bottom: 0 }, 812, 69), false);
});
