import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const header = readFileSync("components/sections/Header.tsx", "utf8");
const sticky = readFileSync("components/sections/StickyCta.tsx", "utf8");
const footer = readFileSync("components/sections/Footer.tsx", "utf8");

test("mobiel toont één vaste set primaire contactacties", () => {
  assert.match(header, /href="tel:\+31634744522"[\s\S]*?className="hidden[^"]*lg:flex"/);
  assert.match(header, /aria-label=\{t\("whatsapp"\)\}[\s\S]*?className="hidden[^"]*lg:flex"/);
  assert.match(header, /href="\/boeken"[\s\S]*?className="hidden[^"]*lg:inline-flex"/);
  assert.match(sticky, /lg:hidden/);
});

test("pagina-inhoud houdt ruimte vrij voor de mobiele actiebalk", () => {
  assert.match(
    footer,
    /pb-\[calc\(72px_\+_env\(safe-area-inset-bottom\)\)\][^"\n]*lg:pb-0/,
  );
});
