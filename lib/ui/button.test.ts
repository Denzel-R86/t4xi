import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { buttonClassName, isPlainHref, type ButtonVariant } from "@/components/ui/button-styles";

const VARIANTS: ButtonVariant[] = ["primary", "secondary", "text"];
const button = readFileSync("components/ui/Button.tsx", "utf8");
// Commentaar mag de verboden termen noemen; alleen code telt.
const styles = readFileSync("components/ui/button-styles.ts", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

test("Button v2: precies drie varianten, allemaal ≥ 44px en met zichtbare focus", () => {
  for (const variant of VARIANTS) {
    for (const size of ["md", "lg"] as const) {
      const c = buttonClassName({ variant, size });
      assert.match(c, /\bmin-h-11\b/, `${variant}/${size}: touch target`);
      assert.match(c, /focus-visible:outline-2/, `${variant}/${size}: focus`);
      assert.match(c, /focus-visible:outline-ink/);
    }
  }
  assert.match(buttonClassName({ size: "lg" }), /min-h-\[52px\]/);
});

test("Button v2: geen lift of schaal bij hover/active (§3, §5b)", () => {
  assert.doesNotMatch(styles, /-translate-y/);
  assert.doesNotMatch(styles, /\bscale-(?!x-)/);
  assert.doesNotMatch(styles, /shadow-/);
});

test("Button v2: primary vult horizontaal links → rechts op de Horizon-curve", () => {
  const c = buttonClassName({ variant: "primary" });
  assert.match(c, /before:origin-left/);
  assert.match(c, /before:scale-x-0/);
  assert.match(c, /hover:before:scale-x-100/);
  assert.match(c, /focus-visible:before:scale-x-100/);
  assert.match(c, /before:ease-\[var\(--hz-ease,cubic-bezier\(0\.22,1,0\.36,1\)\)\]/);
  assert.match(c, /hover:text-fog/);
  assert.doesNotMatch(c, /scale-y|origin-bottom/);
});

test("Button v2: reduced motion zet elke transitie uit", () => {
  assert.match(buttonClassName({ variant: "primary" }), /motion-reduce:before:transition-none/);
  assert.match(buttonClassName({ variant: "text" }), /motion-reduce:after:transition-none/);
  for (const variant of VARIANTS) {
    assert.match(buttonClassName({ variant }), /motion-reduce:transition-none/);
  }
  assert.match(styles, /BUTTON_ARROW_CLASS =[\s\S]*?motion-reduce:transition-none/);
});

test("Button v2: kleuren alleen ink/fog/line, tekst nooit text-stone (F-11)", () => {
  assert.doesNotMatch(styles, /text-stone(?!-text)/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(styles, /\b(bg|text|border)-(blue|red|green|gray|slate|white|black)/);
});

test("Button v2: inactief vervangt de interactie (geen vulling/hover) en blijft leesbaar", () => {
  for (const variant of VARIANTS) {
    const c = buttonClassName({ variant, inactive: true });
    assert.match(c, /cursor-not-allowed/);
    assert.match(c, /text-stone-text/);
    assert.doesNotMatch(c, /hover:/, `${variant}: geen hover-effect`);
    assert.doesNotMatch(c, /before:scale-x-100|after:scale-x-100/);
  }
});

test("Button v2: polymorf — interne href via i18n-Link, schema/anker via <a>, anders <button type=button>", () => {
  assert.equal(isPlainHref("/boeken"), false);
  assert.equal(isPlainHref("/tarieven?pickup=Almere"), false);
  for (const href of ["tel:+31634744522", "mailto:info@t4xi.nl", "https://wa.me/31634744522", "#aanvragen", "//cdn.example"]) {
    assert.equal(isPlainHref(href), true, href);
  }
  assert.match(button, /import \{ Link \} from "@\/i18n\/navigation"/);
  assert.match(button, /type = "button"/);
  assert.match(button, /aria-busy=\{loading \|\| undefined\}/);
  assert.match(button, /disabled=\{inactive\}/);
});

// Scope-lock voor PR 1.3; verwijderen in de eerste adoptie-PR (2.1 e.v.).
test("1.3 adopteert niets: geen bestaande pagina/component gebruikt Button of JourneyLine", () => {
  const own = new Set([
    join("components", "ui", "Button.tsx"),
    join("components", "ui", "button-styles.ts"),
    join("components", "horizon", "JourneyLine.tsx"),
  ]);
  const offenders = [...sourceFiles("app"), ...sourceFiles("components")]
    .filter((f) => !own.has(f))
    .filter((f) => /components\/ui\/Button|ui\/button-styles|horizon\/JourneyLine|journey-line\.css|["']\.\/(Button|JourneyLine)["']/.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, []);
});
