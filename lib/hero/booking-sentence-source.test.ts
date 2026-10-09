import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Broncode-lock PR 2.1 (masterplan §6): gedrag dat zonder browser niet te testen is.
const src = readFileSync("components/booking-sentence/SentencePattern.tsx", "utf8");
const css = readFileSync("components/booking-sentence/booking-sentence.css", "utf8");
const patterns = readFileSync("components/horizon/patterns.tsx", "utf8");

test("patterns.tsx blijft SentencePattern exporteren", () => {
  assert.match(patterns, /export \{ SentencePattern \} from "@\/components\/booking-sentence\/SentencePattern";/);
});

test("§6.2: passagiers gaan mee in de quote en in de rit-sleutel van de reveal-scroll", () => {
  assert.match(src, /useRouteQuote\(pickup, dropoff, \{[^}]*\bpassengers\b[^}]*ready: quoteReady \}\)/);
  assert.match(src, /requestedRide\.current = \{[^}]*\bpassengers \}/);
});

test("§6.3/6.4: JourneyLine via journeyStateFor/journeyTransition; prijs pas na de reis", () => {
  assert.match(src, /journeyStateFor\(quote, pickup, dropoff\)/);
  assert.match(src, /journeyTransition\(drawn, restState, \{ reducedMotion: !animateJourney \}\)/);
  assert.match(src, /quote\.status === "ready" && showPrice/);
});

test("§6.6: prijsregel blijft aria-live polite", () => {
  assert.match(src, /aria-live="polite"/);
});

test("§6.1: dimmen via :has() naar ink 65% (4,63:1 op fog), alleen ≥ 768px", () => {
  assert.match(css, /@media \(min-width: 768px\) \{[\s\S]*\.hz-sentence:has\(\.hz-focus:focus-within\) \.hz-sentence-text \{ color: rgb\(31 39 48 \/ 0\.65\); \}/);
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ""), /0\.55/);
});

test("geen handoff-wijziging in 2.1: href-vorm ongewijzigd (PR 2.3 vervangt die)", () => {
  assert.match(src, /`\/boeken\?pickup=\$\{encodeURIComponent\(pickup\.label\)\}&dropoff=\$\{encodeURIComponent\(dropoff\.label\)\}&date=\$\{date\}&time=\$\{time\}&luggage=\$\{encodeURIComponent\(luggage\)\}&persons=\$\{passengers\}`/);
});

test("de zin geeft het gekozen aantal passagiers mee naar /boeken", () => {
  const src = readFileSync("components/booking-sentence/SentencePattern.tsx", "utf8");
  assert.match(src, /&persons=\$\{passengers\}`/);
  const page = readFileSync("app/[locale]/boeken/page.tsx", "utf8");
  assert.match(page, /query\?\.persons/);
});
