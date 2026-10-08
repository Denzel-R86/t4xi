import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JOURNEY_STATES } from "./journey-line-state";
import { journeyLineLabel, journeyLineView } from "./journey-line-view";

// Commentaar mag de verboden termen noemen; alleen declaraties tellen.
const css = readFileSync("components/horizon/journey-line.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const component = readFileSync("components/horizon/JourneyLine.tsx", "utf8");

function reducedMotionBlock(source: string): string {
  const start = source.indexOf("@media (prefers-reduced-motion: reduce)");
  assert.ok(start >= 0, "reduced-motion-blok ontbreekt");
  return source.slice(start);
}

test("view: elke toestand heeft een weergave", () => {
  for (const s of JOURNEY_STATES) assert.ok(journeyLineView(s), s);
});

test("view: empty → geen lijn, beide punten open", () => {
  assert.deepEqual(journeyLineView("empty"), {
    progress: 0, origin: "open", destination: "open", traveller: false,
  });
});

test("view: origin → lijn tot 50% met open einde", () => {
  assert.deepEqual(journeyLineView("origin"), {
    progress: 0.5, origin: "filled", destination: "open", traveller: false,
  });
});

test("view: route → volledige lijn, bestemming nog open", () => {
  assert.deepEqual(journeyLineView("route"), {
    progress: 1, origin: "filled", destination: "open", traveller: false,
  });
});

test("view: travelling → reizend punt, bestemming vult aan het eind", () => {
  assert.deepEqual(journeyLineView("travelling"), {
    progress: 1, origin: "filled", destination: "arriving", traveller: true,
  });
});

test("view: arrived → beide punten gevuld, geen reizend punt", () => {
  assert.deepEqual(journeyLineView("arrived"), {
    progress: 1, origin: "filled", destination: "filled", traveller: false,
  });
});

test("label: 'Route van X naar Y' en terugvallen bij ontbrekende plaatsen", () => {
  assert.equal(journeyLineLabel({ from: "Almere Poort", to: "Schiphol" }), "Route van Almere Poort naar Schiphol");
  assert.equal(journeyLineLabel({ from: "Almere Poort" }), "Route vanaf Almere Poort");
  assert.equal(journeyLineLabel({ to: "Schiphol" }), "Route naar Schiphol");
  assert.equal(journeyLineLabel({}), "Route nog niet gekozen");
  assert.equal(journeyLineLabel({ from: "  ", to: "\n" }), "Route nog niet gekozen");
  assert.equal(journeyLineLabel({ from: " Almere \n Poort ", to: "Schiphol" }), "Route van Almere Poort naar Schiphol");
});

test("label: vertaald label van de aanroeper gaat voor", () => {
  assert.equal(
    journeyLineLabel({ from: "Almere", to: "Schiphol", label: "Route from Almere to Schiphol" }),
    "Route from Almere to Schiphol",
  );
  assert.equal(journeyLineLabel({ from: "Almere", label: "  " }), "Route vanaf Almere");
});

test("component: role=img + aria-label, of aria-hidden als decoratief", () => {
  assert.match(component, /role: "img", "aria-label": journeyLineLabel\(/);
  assert.match(component, /decorative\s*\?\s*\(\{ "aria-hidden": true \}/);
  // Het spoor zelf is altijd verborgen voor hulptechnologie.
  assert.match(component, /className="hz-jl-track" aria-hidden="true"/);
});

test("component: server-renderbaar (geen client-directive, geen hooks)", () => {
  assert.doesNotMatch(component, /^"use client"/m);
  assert.doesNotMatch(component, /\buse(State|Effect|LayoutEffect|Ref)\b/);
});

test("css: lijn via scaleX/scaleY, nooit via width/height-animatie", () => {
  assert.match(css, /\.hz-jl-rule \{[\s\S]*?transform: scaleX\(var\(--jl-progress, 0\)\)/);
  assert.match(css, /transform: scaleY\(var\(--jl-progress, 0\)\)/);
  assert.doesNotMatch(css, /transition:[^;]*\b(width|height)\b/);
  assert.doesNotMatch(css, /@keyframes[^{]*\{[^}]*\b(width|height)\s*:/);
});

test("css: travelling = één 6px-punt, 600ms op --hz-ease, eindigt als arrived", () => {
  assert.match(css, /--jl-traveller: 6px/);
  assert.match(css, /--jl-run: 600ms/);
  assert.match(css, /--jl-ease: var\(--hz-ease,/);
  assert.match(css, /hz-jl-travel var\(--jl-run\) var\(--jl-ease\) both/);
  assert.match(css, /\.hz-jl-dot\[data-dot="arriving"\] \{ animation: hz-jl-fill 1ms linear var\(--jl-run\) forwards; \}/);
});

test("css: geen bounce/spring, geen schaal > 1, geen gradients (§5b)", () => {
  assert.doesNotMatch(css, /cubic-bezier\([^)]*-\d/); // negatieve controlepunten = overshoot
  assert.doesNotMatch(css, /scale\((?!X|Y)/);
  assert.doesNotMatch(css, /gradient/);
});

test("reduced motion: direct eindstaat, geen reizend punt, geen transities", () => {
  const block = reducedMotionBlock(css);
  assert.match(block, /\.hz-jl-run \{ display: none; animation: none; \}/);
  assert.match(block, /\.hz-jl-rule, \.hz-jl-dot \{ transition: none; \}/);
  assert.match(block, /\.hz-jl-dot\[data-dot="arriving"\] \{ animation: none; background: var\(--jl-ink\); \}/);
});

test("contrast: tekstkleuren ink en stone.text, nooit #999694 (F-11)", () => {
  assert.match(css, /--jl-ink: #1f2730;/);
  assert.match(css, /--jl-meta: #5f666d;/);
  assert.doesNotMatch(css.toLowerCase(), /#999694/);
  assert.doesNotMatch(component, /text-stone(?!-text)/);
});
