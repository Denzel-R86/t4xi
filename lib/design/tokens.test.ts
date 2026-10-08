import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import config from "../../tailwind.config";

// Experience 2.0 PR 1.1 — merkregel B4 + foundations-tokens (masterplan §2 B4, §3, §5).

const horizonCss = readFileSync("components/horizon/horizon.css", "utf8");
const globalsCss = readFileSync("app/globals.css", "utf8");
const theme = config.theme?.extend as Record<string, Record<string, unknown>>;

function hzToken(name: string): string {
  const match = horizonCss.match(new RegExp(`--hz-${name}:\\s*([^;]+);`));
  assert.ok(match, `--hz-${name} ontbreekt in horizon.css`);
  return match[1].trim();
}

test("B4: 'Arrive with confidence' komt nergens meer voor buiten de docs", () => {
  let hits = "";
  try {
    hits = execFileSync("git", ["grep", "-il", "arrive with confidence", "--", ".", ":!docs", ":!lib/design/tokens.test.ts"], {
      encoding: "utf8",
    }).trim();
  } catch (error) {
    // git grep geeft exitcode 1 bij nul treffers; alles anders is een echte fout.
    if ((error as { status?: number }).status !== 1) throw error;
  }
  assert.equal(hits, "");
});

test("B4: JSON-LD-slogan is de consumententagline", () => {
  const layout = readFileSync("app/[locale]/layout.tsx", "utf8");
  assert.match(layout, /slogan: "Arrive composed\.",/);
});

test("B4: over-ons draagt het merkprincipe", () => {
  const nl = JSON.parse(readFileSync("messages/nl.json", "utf8"));
  assert.match(nl.overOns.alinea2, /^Precisie zonder vertoon/);
});

test("ease-premium is een alias van --hz-ease, met dezelfde fallback-curve", () => {
  const ease = hzToken("ease");
  const premium = (theme.transitionTimingFunction as Record<string, string>).premium;
  assert.equal(premium, `var(--hz-ease, ${ease})`);
});

test("motion-tokens volgen §5 en Tailwind spiegelt ze met gelijke fallback", () => {
  const expected = { micro: "160ms", ui: "280ms", composed: "700ms", cinematic: "1100ms", ambient: "6000ms" };
  const durations = theme.transitionDuration as Record<string, string>;
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(hzToken(name), value, `--hz-${name}`);
    assert.equal(durations[name], `var(--hz-${name}, ${value})`, `duration-${name}`);
  }
  assert.equal(hzToken("immediate"), "var(--hz-ui)", "--hz-immediate blijft alias");
});

test("typeschaal §3 bestaat met de afgesproken grenzen", () => {
  const sizes = theme.fontSize as Record<string, [string, { letterSpacing?: string }]>;
  assert.match(sizes["display-hero"][0], /^clamp\(3rem, .+, 6\.875rem\)$/);
  assert.match(sizes["display-statement"][0], /^clamp\(2\.5rem, .+, 5\.5rem\)$/);
  assert.match(sizes["body-lg"][0], /^clamp\(1\.0625rem, .+, 1\.1875rem\)$/);
  assert.equal(sizes.meta[0], "0.6875rem");
  assert.equal(sizes.meta[1].letterSpacing, "0.16em");
});

test("canvas heeft geen gradient-achtergrond (§5b)", () => {
  assert.doesNotMatch(globalsCss, /radial-gradient|linear-gradient/);
  assert.doesNotMatch(globalsCss, /body::before/);
});

test("F-11: toegankelijk teksttoken naast stone blijft beschikbaar", () => {
  const stone = (theme.colors as Record<string, Record<string, string>>).stone;
  assert.equal(stone.text, "#5F666D");
  assert.equal(stone.DEFAULT, "#999694");
});
