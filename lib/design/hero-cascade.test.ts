import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Experience 2.0 PR 1.4 — hero-choreografie (masterplan §5): pure CSS-cascade met
// `animation-delay` op klassen, alleen opacity/transform, uit bij reduced motion,
// LCP-kop nooit op opacity 0, boekingszin nooit geblokkeerd.

const css = readFileSync("components/horizon/horizon.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const page = readFileSync("app/[locale]/page.tsx", "utf8");
const patterns = readFileSync("components/horizon/patterns.tsx", "utf8");

const CLASSES = ["eyebrow", "line1", "line2", "sub", "booking", "trust"] as const;
/** §5: eyebrow 100ms · regel 1 180ms · regel 2 280ms · subcopy 430ms · booking 550ms · trustline 700ms. */
const DELAYS: Record<(typeof CLASSES)[number], number> = {
  eyebrow: 100, line1: 180, line2: 280, sub: 430, booking: 550, trust: 700,
};
const TOKENS: Record<string, number> = { "--hz-ui": 280, "--hz-composed": 700 };

/** Top-level blokken: `{ prelude, body }`, met geneste accolades meegeteld. */
function blocks(source: string): { prelude: string; body: string }[] {
  const out: { prelude: string; body: string }[] = [];
  let depth = 0;
  let start = 0;
  let open = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "{") {
      if (depth === 0) open = i;
      depth++;
    } else if (source[i] === "}") {
      depth--;
      if (depth === 0) {
        out.push({ prelude: source.slice(start, open).trim(), body: source.slice(open + 1, i) });
        start = i + 1;
      }
    }
  }
  return out;
}

/** Declaraties die voor `.hz-hero-<name>` gelden binnen één blokinhoud. */
function rulesFor(body: string, name: string): string {
  return blocks(body)
    .filter((b) => b.prelude.split(",").some((sel) => sel.trim() === `.hz-hero-${name}`))
    .map((b) => b.body)
    .join(";");
}

const top = blocks(css);
const root = top.find((b) => b.prelude === ":root")?.body ?? "";
const motionBlocks = top.filter((b) => b.prelude.startsWith("@media") && b.prelude.includes("prefers-reduced-motion: no-preference"));
const reducedBlock = top.find((b) => b.prelude.startsWith("@media") && b.prelude.includes("prefers-reduced-motion: reduce"));

test("1.4: de cascade bestaat alleen binnen prefers-reduced-motion: no-preference (+ scripting)", () => {
  assert.equal(motionBlocks.length, 1, "precies één motion-blok voor de hero");
  assert.match(motionBlocks[0].prelude, /\(scripting: enabled\)/);
  // Buiten dat blok mag geen enkele hero-klasse een animation of startstaat krijgen.
  const outside = top.filter((b) => b !== motionBlocks[0] && b !== reducedBlock);
  for (const b of outside) {
    assert.doesNotMatch(b.prelude, /\.hz-hero-/, `hero-klasse buiten de motion-query: ${b.prelude}`);
  }
});

test("1.4: reduced motion zet de animatie van alle zes hero-klassen uit", () => {
  assert.ok(reducedBlock, "reduced-motion-blok ontbreekt");
  for (const name of CLASSES) {
    assert.match(rulesFor(reducedBlock.body, name), /animation:\s*none/, `.hz-hero-${name} niet uit onder reduced motion`);
  }
});

test("1.4: delays volgen §5 en alles is binnen 1s klaar, met --hz-*-duurtokens", () => {
  const body = motionBlocks[0].body;
  for (const name of CLASSES) {
    const rules = rulesFor(body, name);
    // Starttijd via token: animation-delay: var(--hz-hero-<name>) met de §5-waarde in :root.
    assert.match(rules, new RegExp(`animation-delay:\\s*var\\(--hz-hero-${name}\\)`), `.hz-hero-${name} zonder delay-token`);
    const token = root.match(new RegExp(`--hz-hero-${name}:\\s*(\\d+)ms;`));
    assert.ok(token, `--hz-hero-${name} ontbreekt in :root`);
    assert.equal(Number(token[1]), DELAYS[name], `--hz-hero-${name}`);
    const durationToken = [...rules.matchAll(/animation-duration:\s*var\((--hz-[a-z]+)\)/g)].at(-1)?.[1] ?? "--hz-ui";
    assert.ok(durationToken in TOKENS, `.hz-hero-${name}: onbekend duurtoken ${durationToken}`);
    assert.ok(DELAYS[name] + TOKENS[durationToken] < 1000, `.hz-hero-${name} eindigt na 1s`);
  }
  assert.match(body, /animation:\s*hz-hero-rise var\(--hz-ui\) var\(--hz-ease\) both/);
});

test("1.4: keyframes animeren alleen opacity en transform", () => {
  const kf = top.find((b) => b.prelude === "@keyframes hz-hero-rise");
  assert.ok(kf, "@keyframes hz-hero-rise ontbreekt");
  const props = [...kf.body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(props)].sort(), ["opacity", "transform"]);
});

test("1.4: stijghoogte hero = §5 (regels 20px, rest 12px); generieke Reveal ongewijzigd", () => {
  assert.match(root, /--hz-rise-editorial:\s*20px;/);
  assert.match(root, /--hz-rise-ui:\s*12px;/);
  for (const name of ["line1", "line2"]) {
    assert.match(rulesFor(motionBlocks[0].body, name), /--hz-hero-y:\s*var\(--hz-rise-editorial\)/);
  }
  const kf = top.find((b) => b.prelude === "@keyframes hz-hero-rise")?.body ?? "";
  assert.match(kf, /translateY\(var\(--hz-hero-y, var\(--hz-rise-ui\)\)\)/);
  // Fase 4 migreert Reveal; tot dan blijft de bestaande startstaat exact staan.
  assert.match(css, /html\.js \.hz-reveal \{\s*opacity: 0;\s*transform: translateY\(26px\);/);
});

test("1.4: LCP-kop start nooit op opacity 0 (regels op .01)", () => {
  for (const name of ["line1", "line2"]) {
    const from = rulesFor(motionBlocks[0].body, name).match(/--hz-hero-from:\s*([\d.]+)/);
    assert.ok(from, `.hz-hero-${name} zonder --hz-hero-from`);
    assert.ok(Number(from[1]) > 0, `.hz-hero-${name} start op opacity 0`);
  }
});

test("1.4: de boekingszin springt bij focus direct op zichtbaar", () => {
  assert.match(motionBlocks[0].body, /\.hz-hero-booking:focus-within\s*\{\s*animation:\s*none;?\s*\}/);
});

test("1.4: hero gebruikt de cascadeklassen; NarrativePattern alleen met cascade", () => {
  assert.match(page, /as="h1"[\s\S]*?\bcascade\b[\s\S]*?\/>/);
  assert.match(page, /className="hz-hero-booking /);
  assert.match(page, /className="hz-hero-trust /);
  for (const name of ["eyebrow", "line2", "sub"]) assert.match(patterns, new RegExp(`hc\\("${name}"\\)`));
  assert.match(patterns, /cascade \? <span className="hz-hero-line1">/);
  assert.match(patterns, /const hc = \(name: string\) => \(cascade \? ` hz-hero-\$\{name\}` : ""\)/);
});
