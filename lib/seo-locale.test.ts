import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("lib/seo-locale.ts", "utf8");

test("404-metadata gebruikt een absolute titel zonder dubbel merksuffix", () => {
  assert.match(source, /notFoundMetadata\(title = "404 — T4XI"\)[\s\S]*?title: \{ absolute: title \}/);
});
