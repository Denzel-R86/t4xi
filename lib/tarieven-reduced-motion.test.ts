import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// RouteFinder scrolt het resultaat in beeld; bij reduced motion zonder animatie (§5).
test("RouteFinder respecteert reduced motion bij het in beeld scrollen van het resultaat", () => {
  const src = readFileSync("components/tarieven/RouteFinder.tsx", "utf8");
  assert.match(src, /usePrefersReducedMotion\(\)/);
  assert.match(src, /scrollIntoView\(\{ behavior: reducedMotion \? "auto" : "smooth"/);
  assert.doesNotMatch(src, /scrollIntoView\(\{ behavior: "smooth"/);
});
