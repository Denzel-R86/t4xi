import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import config from "../../tailwind.config";
import { BOOKING_FORM_FILES } from "@/lib/booking/form-source";

// Experience 2.0 PR 1.2 — besluit B1 (08-10-2026, masterplan §2, design-specs §13f):
// Playfair Display, rechtop, alleen Brand Mode-display ≥ 48px. Nooit serif in
// transactionele UI.

const SERIF = /font-display-serif|text-display-serif|font-playfair|--font-playfair|font-serif\b/;

/** Volledig transactionele bestanden: hier mag geen enkele serif-klasse of -variabele staan. */
const TRANSACTIONAL_FILES = [
  ...BOOKING_FORM_FILES,
  "components/booking/PaymentStep.tsx",
  "components/booking/FlightCard.tsx",
  "components/tarieven/RouteFinder.tsx",
  "components/shared/AddressAutocomplete.tsx",
  "components/sections/StickyCta.tsx",
  "components/sections/StickyCtaBar.tsx",
  "components/ui/Button.tsx",
  "components/contact/ContactLeadForm.tsx",
  "components/producten/ProductForms.tsx",
  "components/partner/PartnerInteractive.tsx",
  "app/[locale]/boeken/page.tsx",
];

/** `patterns.tsx` mengt Brand Mode en transactie; serif mag alleen in deze exports. */
const PATTERNS_FILE = "components/horizon/patterns.tsx";
const BRAND_MODE_EXPORTS = new Set(["NarrativePattern"]);
const TRANSACTIONAL_EXPORTS = ["SentencePattern", "LedgerPattern"];

function exportsOf(source: string): Map<string, string> {
  const parts = source.split(/^export function /m).slice(1);
  return new Map(parts.map((part) => [part.slice(0, part.search(/[^\w]/)), part]));
}

test("B1: geen serif-klasse of -variabele in transactionele componenten", () => {
  for (const file of TRANSACTIONAL_FILES) {
    assert.doesNotMatch(readFileSync(file, "utf8"), SERIF, `${file} gebruikt serif`);
  }
});

test("B1: in patterns.tsx alleen serif in Brand Mode-exports, niet in zin of prijsregels", () => {
  const exported = exportsOf(readFileSync(PATTERNS_FILE, "utf8"));
  for (const name of TRANSACTIONAL_EXPORTS) {
    assert.ok(exported.has(name), `${name} niet gevonden in ${PATTERNS_FILE}`);
  }
  for (const [name, body] of exported) {
    if (BRAND_MODE_EXPORTS.has(name)) continue;
    assert.doesNotMatch(body, SERIF, `${name} gebruikt serif`);
  }
  // De regel wordt ook echt toegepast: de standaardkop is serif-display.
  assert.match(exported.get("NarrativePattern") ?? "", /font-display-serif text-display-serif/);
});

test("B1: serif-display is nergens cursief", () => {
  for (const file of [PATTERNS_FILE, "app/[locale]/page.tsx"]) {
    const source = readFileSync(file, "utf8");
    for (const line of source.split("\n").filter((l) => /display-serif/.test(l))) {
      assert.doesNotMatch(line, /\bitalic\b/, `${file}: ${line.trim()}`);
    }
  }
});

test("B1: de hero-h1 (Brand Mode) is serif rechtop, de booking sentence niet", () => {
  const page = readFileSync("app/[locale]/page.tsx", "utf8");
  const title = page.match(/titleClassName="([^"]*font-display-serif[^"]*)"/);
  assert.ok(title, "hero-h1 hoort font-display-serif te gebruiken");
  assert.doesNotMatch(title[1], /\bitalic\b/);
  const min = [...title[1].matchAll(/clamp\((\d+)px/g)].map((m) => Number(m[1]));
  assert.ok(min.length > 0 && min.every((px) => px >= 48), `ondergrens ≥ 48px, kreeg ${min.join(", ")}`);
});

test("B1: Playfair laadt alleen rechtop + latin, zonder extra varianten", () => {
  const layout = readFileSync("app/[locale]/layout.tsx", "utf8");
  const block = layout.match(/Playfair_Display\(\{([\s\S]*?)\}\);/);
  assert.ok(block, "Playfair_Display-aanroep niet gevonden in layout.tsx");
  const options = block[1];
  assert.match(options, /subsets: \["latin"\],/);
  assert.match(options, /style: "normal",/);
  assert.doesNotMatch(options, /italic/);
  // Variabel lettertype: geen `weight` = één bestand voor alle gewichten.
  assert.doesNotMatch(options, /weight/);
  assert.equal(layout.match(/Playfair_Display\(/g)?.length, 1, "Playfair maar één keer laden");
});

test("B1: token display-serif heeft een ondergrens van 48px en de Playfair-stack", () => {
  const theme = config.theme?.extend as Record<string, Record<string, unknown>>;
  const sizes = theme.fontSize as Record<string, [string, { letterSpacing?: string }]>;
  assert.match(sizes["display-serif"][0], /^clamp\(3rem, /);
  const families = theme.fontFamily as Record<string, string[]>;
  assert.deepEqual(families["display-serif"], ["var(--font-playfair)", "Georgia", "serif"]);
  // Max. drie families (§2 B1): Outfit, Inter, Playfair.
  const vars = new Set(Object.values(families).map((stack) => stack[0]));
  assert.ok(vars.size <= 3, `meer dan drie fontfamilies: ${[...vars].join(", ")}`);
});
