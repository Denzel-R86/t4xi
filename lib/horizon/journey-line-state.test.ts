import assert from "node:assert/strict";
import test from "node:test";
import type { Quote } from "@/components/shared/useRouteQuote";
import {
  JOURNEY_STATES,
  journeyStateFor,
  journeyTransition,
  type JourneyQuote,
  type JourneyRestState,
  type JourneyState,
} from "./journey-line-state";

// Compile-time: elke echte `Quote` past op het minimale contract. Breekt de
// Quote-union (§1 invariant), dan faalt `tsc` hier.
const _quoteContract: (q: Quote) => JourneyQuote = (q) => q;
void _quoteContract;

const A = { id: "a" };
const B = { id: "b" };
const airport = { isTransfer: true, direction: "departure" as const };
const ready = (quoteId = "q_123"): JourneyQuote => ({ status: "ready", quoteId });
const NOT_READY: JourneyQuote[] = [
  { status: "idle" },
  { status: "loading" },
  { status: "error" },
  { status: "onrequest" },
];

test("journeyStateFor: geen adressen → empty, ongeacht de quote", () => {
  assert.equal(journeyStateFor(null, null, null), "empty");
  assert.equal(journeyStateFor(undefined, undefined, undefined), "empty");
  assert.equal(journeyStateFor(ready(), null, null), "empty");
});

test("journeyStateFor: één adres → origin (ook als alleen de bestemming bekend is)", () => {
  assert.equal(journeyStateFor(null, A, null), "origin");
  assert.equal(journeyStateFor(null, null, B), "origin");
  // Een verouderde ready-quote mag een half ingevulde route niet laten 'aankomen'.
  assert.equal(journeyStateFor(ready(), A, null), "origin");
});

test("journeyStateFor: beide adressen zonder bevestigde quote → route", () => {
  assert.equal(journeyStateFor(null, A, B), "route");
  for (const q of NOT_READY) {
    assert.equal(journeyStateFor(q, A, B), "route", `status ${q.status}`);
  }
});

test("journeyStateFor: arrived alleen bij ready mét quote-lock", () => {
  assert.equal(journeyStateFor(ready(), A, B), "arrived");
  assert.equal(journeyStateFor(ready(""), A, B), "route");
  assert.equal(journeyStateFor(ready("   "), A, B), "route");
});

test("journeyStateFor: accepteert een echte Quote uit useRouteQuote", () => {
  const q: Quote = {
    status: "ready",
    amount: "€ 89,00",
    price: 89,
    returnApplied: false,
    airport,
    distanceKm: 42,
    estimatedDurationMin: 35,
    quoteId: "snap_1",
  };
  assert.equal(journeyStateFor(q, A, B), "arrived");
  const onrequest: Quote = { status: "onrequest", airport };
  assert.equal(journeyStateFor(onrequest, A, B), "route");
  const error: Quote = { status: "error", reason: "rate_limited", retryAfterSec: 30 };
  assert.equal(journeyStateFor(error, A, B), "route");
});

test("journeyStateFor levert nooit travelling (dat is alleen een overgang)", () => {
  const quotes: (JourneyQuote | null)[] = [null, ...NOT_READY, ready()];
  const ends = [null, A];
  for (const q of quotes) for (const p of ends) for (const d of [null, B]) {
    assert.notEqual(journeyStateFor(q, p, d), "travelling");
  }
});

test("journeyTransition: alleen de stap naar arrived speelt de reis af", () => {
  const rest: JourneyRestState[] = ["empty", "origin", "route", "arrived"];
  const all: JourneyState[] = [...JOURNEY_STATES];
  for (const prev of all) {
    for (const next of rest) {
      const out = journeyTransition(prev, next, { reducedMotion: false });
      if (next !== "arrived") {
        assert.equal(out, next, `${prev} → ${next}`);
      } else if (prev === "arrived") {
        assert.equal(out, "arrived", "geen herhaling");
      } else {
        assert.equal(out, "travelling", `${prev} → arrived`);
      }
    }
  }
});

test("journeyTransition: een lopende reis wordt niet afgekapt bij een re-render", () => {
  assert.equal(journeyTransition("travelling", "arrived", { reducedMotion: false }), "travelling");
});

test("journeyTransition: terug van arrived/travelling is direct (bv. adres gewist)", () => {
  assert.equal(journeyTransition("arrived", "route", { reducedMotion: false }), "route");
  assert.equal(journeyTransition("travelling", "origin", { reducedMotion: false }), "origin");
  assert.equal(journeyTransition("arrived", "empty", { reducedMotion: false }), "empty");
});

test("journeyTransition: eerste render die al arrived is → geen theater", () => {
  assert.equal(journeyTransition(null, "arrived", { reducedMotion: false }), "arrived");
  assert.equal(journeyTransition(undefined, "arrived", { reducedMotion: false }), "arrived");
});

test("journeyTransition: reduced motion → altijd direct de eindstaat, nooit travelling", () => {
  for (const prev of [null, ...JOURNEY_STATES]) {
    for (const next of ["empty", "origin", "route", "arrived"] as const) {
      const out = journeyTransition(prev, next, { reducedMotion: true });
      assert.equal(out, next, `${prev} → ${next}`);
      assert.notEqual(out, "travelling");
    }
  }
});

test("volledige reeks: leeg → vertrek → route → quote ready → reis → aangekomen", () => {
  const steps: [JourneyQuote | null, object | null, object | null][] = [
    [null, null, null],
    [null, A, null],
    [{ status: "loading" }, A, B],
    [ready(), A, B],
    [ready(), A, B],
  ];
  let drawn: JourneyState | null = null;
  const seen: JourneyState[] = [];
  for (const [q, p, d] of steps) {
    drawn = journeyTransition(drawn, journeyStateFor(q, p, d), { reducedMotion: false });
    seen.push(drawn);
  }
  assert.deepEqual(seen, ["empty", "origin", "route", "travelling", "travelling"]);
});
