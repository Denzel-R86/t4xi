import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { buttonClassName, isPlainHref, type ButtonVariant } from "@/components/ui/button-styles";
import tailwind from "@/tailwind.config";

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

/** Klassen die in rust gelden (zonder state-/pseudo-prefix). */
function restClasses(c: string): string[] {
  return c.split(/\s+/).filter((k) => k && !k.includes(":"));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi! + 0.05) / (lo! + 0.05)) * 100) / 100;
}

const colors = (tailwind.theme?.extend?.colors ?? {}) as Record<string, string | Record<string, string>>;
const tok = (name: string, shade = "DEFAULT"): string => {
  const v = colors[name];
  return (typeof v === "string" ? v : v?.[shade]) as string;
};

test("Button v2: primary is in rust gevuld (ook op touch) — ink met fog-tekst", () => {
  const rest = restClasses(buttonClassName({ variant: "primary" }));
  assert.ok(rest.includes("bg-ink"), "primary heeft vulling zonder hover");
  assert.ok(rest.includes("text-fog"));
  const c = buttonClassName({ variant: "primary" });
  assert.match(c, /before:origin-left/);
  assert.match(c, /before:scale-x-0/);
  assert.match(c, /before:bg-accent-light/);
  assert.match(c, /hover:before:scale-x-100/);
  assert.match(c, /focus-visible:before:scale-x-100/);
  assert.match(c, /before:ease-\[var\(--hz-ease,cubic-bezier\(0\.22,1,0\.36,1\)\)\]/);
  assert.doesNotMatch(c, /scale-y|origin-bottom/);
});

test("Button v2: omlijnd is alleen secondary; secondary heeft geen vulling in rust", () => {
  const primary = restClasses(buttonClassName({ variant: "primary" }));
  const secondary = restClasses(buttonClassName({ variant: "secondary" }));
  assert.ok(secondary.includes("border-ink") && secondary.includes("text-ink"));
  assert.ok(!secondary.some((k) => k.startsWith("bg-")), "secondary in rust zonder vulling");
  assert.notDeepEqual(primary, secondary, "geen dubbele varianten");
  assert.match(buttonClassName({ variant: "secondary" }), /before:bg-overlay/);
});

test("Button v2: contrast ≥ 4,5:1 in elke toestand (gemeten op de Tailwind-tokens)", () => {
  const fog = tok("fog"), ink = tok("ink"), accentLight = tok("accent", "light");
  const overlay = tok("overlay"), stoneText = tok("stone", "text");
  assert.equal(contrast(fog, ink), 13.64); // primary rust
  assert.equal(contrast(fog, accentLight), 8.71); // primary hover/focus-vulling
  assert.equal(contrast(ink, fog), 13.64); // secondary/text rust + focusring op fog
  assert.equal(contrast(ink, overlay), 12.61); // secondary hover-vulling
  assert.equal(contrast(stoneText, overlay), 4.86); // primary disabled
  assert.equal(contrast(stoneText, fog), 5.26); // secondary/text disabled
  for (const r of [contrast(fog, ink), contrast(fog, accentLight), contrast(ink, overlay), contrast(stoneText, overlay), contrast(stoneText, fog)]) {
    assert.ok(r >= 4.5, `contrast ${r} < 4.5`);
  }
});

test("Button v2: focusring zit buiten de vulling (offset), dus zichtbaar op primary", () => {
  const c = buttonClassName({ variant: "primary" });
  assert.match(c, /focus-visible:outline-offset-2/);
  assert.match(c, /focus-visible:outline-ink/);
});

test("Button v2: disabled primary verliest de donkere vulling, zonder text-stone", () => {
  const rest = restClasses(buttonClassName({ variant: "primary", inactive: true }));
  assert.ok(!rest.includes("bg-ink"));
  assert.ok(rest.includes("bg-overlay") && rest.includes("text-stone-text"));
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

// Scope-lock: PR 1.3 adopteerde niets. Adopters per PR — elke volgende adoptie breidt
// deze lijst bewust uit in de eigen PR:
//   PR 2.1: hero-boekingszin (Button v2 + JourneyLine)
//   PR 2.4: BookingSection-stappen (Button)
//   PR 2.3: handoff-routelijn op /boeken (JourneyLine)
//   PR 2.5: bevestigingsmoment (Button + JourneyLine)
const ADOPTERS = new Set([
  join("components", "booking", "handoff", "HandoffRouteLine.tsx"),
  join("components", "booking-sentence", "SentencePattern.tsx"),
  join("components", "booking", "BookingSection.tsx"),
  join("components", "booking", "steps", "ConfirmStep.tsx"),
  join("components", "booking", "BookingConfirmation.tsx"),
]);

test("adoptie Button/JourneyLine: alleen de expliciet toegestane bestanden (PR 2.1, 2.3, 2.4, 2.5)", () => {
  const own = new Set([
    join("components", "ui", "Button.tsx"),
    join("components", "ui", "button-styles.ts"),
    join("components", "horizon", "JourneyLine.tsx"),
  ]);
  const users = [...sourceFiles("app"), ...sourceFiles("components")]
    .filter((f) => !own.has(f))
    .filter((f) => /components\/ui\/Button|ui\/button-styles|horizon\/JourneyLine|journey-line\.css|["']\.\/(Button|JourneyLine)["']/.test(readFileSync(f, "utf8")));
  assert.deepEqual(users.filter((f) => !ADOPTERS.has(f)), [], "onverwachte adoptie");
  assert.deepEqual(users.sort(), [...ADOPTERS].sort(), "precies de toegestane adopters gebruiken Button/JourneyLine");
});

test("Button als link: aria-disabled geeft de inactieve vorm (§13e)", () => {
  assert.match(button, /const inactive = ariaDisabled === true \|\| ariaDisabled === "true";/);
  assert.match(button, /buttonClassName\(\{ variant, size, fullWidth, inactive, className \}\)/);
});
