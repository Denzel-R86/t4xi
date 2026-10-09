import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import config from "../../tailwind.config";

// Experience 2.0 PR 1.5 — docs/design-system/README.md is de enige bron (design-specs §13a).
// Reviewregel: token of component gewijzigd → README in dezelfde PR bijwerken. Deze test
// faalt zodra een tokenwaarde of tokenregelverwijzing in het README niet meer klopt.

const README_PATH = "docs/design-system/README.md";
const HORIZON_PATH = "components/horizon/horizon.css";
const TAILWIND_PATH = "tailwind.config.ts";

const readme = readFileSync(README_PATH, "utf8");
const horizonCss = readFileSync(HORIZON_PATH, "utf8");
const tailwindLines = readFileSync(TAILWIND_PATH, "utf8").split("\n");
const horizonLines = horizonCss.split("\n");
const theme = config.theme?.extend as Record<string, Record<string, unknown>>;

/** De tabelrij van het README waarvan de eerste cel exact `token` is. */
function row(token: string): string {
  const line = readme.split("\n").find((l) => l.startsWith(`| \`${token}\` |`));
  assert.ok(line, `README mist een tabelrij voor \`${token}\``);
  return line;
}

const norm = (v: string) => v.replace(/\s+/g, "").toLowerCase();

function assertRowHasValue(token: string, value: string) {
  assert.ok(norm(row(token)).includes(norm(value)), `README \`${token}\`: verwacht ${value}\n  ${row(token)}`);
}

/** Als de rij naar `bestand:regel` verwijst, moet die regel het token echt bevatten. */
function assertLineRef(token: string, file: string, lines: string[], needle: string) {
  const ref = row(token).match(new RegExp(`${file.replace(/\./g, "\\.")}:(\\d+)`));
  if (!ref) return;
  const line = lines[Number(ref[1]) - 1] ?? "";
  assert.ok(norm(line).includes(norm(needle)), `README \`${token}\` → ${file}:${ref[1]} bevat ${needle} niet`);
}

function hzTokens(): [string, string][] {
  const root = horizonCss.match(/:root\s*\{([^}]*)\}/);
  assert.ok(root, ":root ontbreekt in horizon.css");
  return [...root[1].matchAll(/(--hz-[a-z-]+):\s*([^;]+);/g)]
    .map((m) => [m[1], m[2].replace(/\/\*.*\*\//, "").trim()] as [string, string])
    .filter(([name]) => name !== "--hz-y");
}

test("README noemt elk Horizon-token uit :root met de waarde uit horizon.css", () => {
  const tokens = hzTokens();
  assert.ok(tokens.length >= 9, "minder Horizon-tokens dan verwacht");
  for (const [name, value] of tokens) {
    assertRowHasValue(name, value);
    assertLineRef(name, "horizon.css", horizonLines, `${name}:`);
  }
});

test("kern-motiontokens: --hz-ui 280ms en --hz-immediate 240ms", () => {
  assertRowHasValue("--hz-ui", "280ms");
  assertRowHasValue("--hz-immediate", "240ms");
  assertRowHasValue("--hz-ease", "cubic-bezier(0.22, 1, 0.36, 1)");
});

test("README noemt elke kleur uit tailwind.config.ts met dezelfde waarde", () => {
  const colors = theme.colors as Record<string, string | Record<string, string>>;
  for (const [name, value] of Object.entries(colors)) {
    const entries: [string, string][] =
      typeof value === "string" ? [[name, value]] : Object.entries(value).map(([k, v]) => [`${name}.${k}`, v]);
    for (const [token, hex] of entries) {
      assertRowHasValue(token, hex);
      assertLineRef(token, "tailwind.config.ts", tailwindLines, hex);
    }
  }
  // F-11: het toegankelijke teksttoken.
  assertRowHasValue("stone.text", "#5F666D");
});

test("README noemt radius, schaduw en typeschaal met de waarden uit tailwind.config.ts", () => {
  for (const [k, v] of Object.entries(theme.borderRadius as Record<string, string>)) {
    assertRowHasValue(`rounded-${k}`, v);
  }
  for (const [k, v] of Object.entries(theme.boxShadow as Record<string, string>)) {
    assertRowHasValue(`shadow-${k}`, v);
    assertLineRef(`shadow-${k}`, "tailwind.config.ts", tailwindLines, v);
  }
  const sizes = theme.fontSize as Record<string, [string, { lineHeight?: string; letterSpacing?: string }]>;
  for (const [k, [size, opts]] of Object.entries(sizes)) {
    assertRowHasValue(`text-${k}`, size);
    if (opts.lineHeight) assert.ok(row(`text-${k}`).includes(` ${opts.lineHeight} `), `text-${k} line-height`);
    if (opts.letterSpacing) assertRowHasValue(`text-${k}`, opts.letterSpacing);
  }
  assert.match(readme, /`max-w-site` = 75rem/);
  assert.equal((theme.maxWidth as Record<string, string>).site, "75rem");
});

test("README draagt merkprincipe, tagline, claims-check en de vijf werkwoorden", () => {
  assert.match(readme, /"Precisie zonder vertoon\."/);
  assert.match(readme, /"Arrive composed\."/);
  assert.match(readme, /Claims-check/);
  for (const verb of ["Reveal", "Travel", "Guide", "Focus", "Confirm"]) {
    assert.match(readme, new RegExp(`\\| ${verb} \\|`), `werkwoord ${verb}`);
  }
  assert.match(readme, /## 6\. Open afwijkingen/);
});

test("headers van horizon.css en motion.tsx verwijzen naar het README (geen tweede waarheid)", () => {
  const motion = readFileSync("components/horizon/motion.tsx", "utf8");
  for (const [file, source] of [
    [HORIZON_PATH, horizonCss],
    ["components/horizon/motion.tsx", motion],
  ] as const) {
    const header = source.slice(0, source.search(/\*\/|═══ \*\//) + 3);
    assert.match(header, /docs\/design-system\/README\.md/, `${file} verwijst niet naar het README`);
    assert.match(header, /in dezelfde PR bijwerken/, `${file} mist de reviewregel`);
    // Geen tokenwaarden meer in de header: die staan alleen in het README.
    assert.doesNotMatch(header, /\d+ms/, `${file}-header herhaalt tokenwaarden`);
  }
});
