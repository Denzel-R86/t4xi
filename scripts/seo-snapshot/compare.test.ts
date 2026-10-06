import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPageSeo, parseSitemap } from "./extract";
import { buildPageSnapshot, compareSnapshots, type SeoSnapshot } from "./compare";

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
<url>
<loc>https://www.t4xi.nl/taxi-almere</loc>
<xhtml:link rel="alternate" hreflang="nl-NL" href="https://www.t4xi.nl/taxi-almere" />
<xhtml:link rel="alternate" hreflang="en" href="https://www.t4xi.nl/en/taxi-almere" />
</url>
</urlset>`;

const PAGE = `<!DOCTYPE html><html><head>
<title>Taxi Almere &amp; omgeving — T4XI</title>
<meta name="description" content="x"/>
<link rel="canonical" href="https://www.t4xi.nl/taxi-almere"/>
<link rel="alternate" hrefLang="nl-NL" href="https://www.t4xi.nl/taxi-almere"/>
<link rel="alternate" hrefLang="en" href="https://www.t4xi.nl/en/taxi-almere"/>
</head><body><svg><title>icoon</title></svg>
<h1 id="page-h1" class="x">Taxi Almere<br/><span class="block">naar Schiphol</span></h1>
</body></html>`;

function snapshotFrom(html: string, status = 200, path = "/taxi-almere"): SeoSnapshot {
  const [entry] = parseSitemap(SITEMAP);
  return {
    version: 1,
    source: "test",
    robotsTxt: ["User-Agent: *", "Allow: /"],
    pages: { [path]: buildPageSnapshot(entry, extractPageSeo(html, status)) },
  };
}

test("extracts title, canonical, hreflang and h1 while ignoring svg titles", () => {
  const page = extractPageSeo(PAGE, 200);
  assert.deepEqual(page.titles, ["Taxi Almere & omgeving — T4XI"]);
  assert.deepEqual(page.canonicals, ["https://www.t4xi.nl/taxi-almere"]);
  assert.deepEqual(page.hreflang, {
    "nl-NL": "https://www.t4xi.nl/taxi-almere",
    en: "https://www.t4xi.nl/en/taxi-almere",
  });
  assert.deepEqual(page.h1, ["Taxi Almere naar Schiphol"]);
});

test("identical snapshots produce no errors or warnings", () => {
  const result = compareSnapshots(snapshotFrom(PAGE), snapshotFrom(PAGE));
  assert.deepEqual(result, { errors: [], warnings: [] });
});

test("fails when the <title> disappears", () => {
  const result = compareSnapshots(snapshotFrom(PAGE), snapshotFrom(PAGE.replace(/<title>.*<\/title>/, "")));
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /<title> verdwenen/);
});

test("fails when the canonical changes", () => {
  const changed = PAGE.replace('canonical" href="https://www.t4xi.nl/taxi-almere', 'canonical" href="https://www.t4xi.nl/');
  assert.match(compareSnapshots(snapshotFrom(PAGE), snapshotFrom(changed)).errors.join("\n"), /canonical gewijzigd/);
});

test("fails when an hreflang alternate disappears", () => {
  const lost = PAGE.replace(/<link rel="alternate" hrefLang="en"[^>]*>/, "");
  assert.match(compareSnapshots(snapshotFrom(PAGE), snapshotFrom(lost)).errors.join("\n"), /hreflang 'en' verdwenen/);
});

test("fails when the h1 disappears, warns when an extra h1 appears", () => {
  const lost = compareSnapshots(snapshotFrom(PAGE), snapshotFrom(PAGE.replace(/<h1[\s\S]*<\/h1>/, "")));
  assert.match(lost.errors.join("\n"), /<h1> verdwenen/);
  const extra = compareSnapshots(snapshotFrom(PAGE), snapshotFrom(PAGE.replace("</body>", "<h1>Tweede</h1></body>")));
  assert.deepEqual(extra.errors, []);
  assert.match(extra.warnings.join("\n"), /extra <h1>/);
});

test("fails when a page turns noindex", () => {
  const noindex = PAGE.replace("<head>", '<head><meta name="robots" content="noindex, nofollow"/>');
  assert.match(compareSnapshots(snapshotFrom(PAGE), snapshotFrom(noindex)).errors.join("\n"), /noindex/);
});

test("fails when a sitemap URL disappears or stops returning 200; warns on new URLs", () => {
  const expected = snapshotFrom(PAGE);
  const moved = snapshotFrom(PAGE, 200, "/taxi-almere-nieuw");
  const result = compareSnapshots(expected, moved);
  assert.match(result.errors.join("\n"), /\/taxi-almere: URL verdwenen uit sitemap\.xml/);
  assert.match(result.warnings.join("\n"), /\/taxi-almere-nieuw: nieuwe URL/);

  assert.match(compareSnapshots(expected, snapshotFrom("", 404)).errors.join("\n"), /HTTP-status gewijzigd: 200 → 404/);
});

test("fails when a robots.txt rule disappears", () => {
  const actual = snapshotFrom(PAGE);
  actual.robotsTxt = ["User-Agent: *"];
  assert.match(compareSnapshots(snapshotFrom(PAGE), actual).errors.join("\n"), /robots\.txt: regel verdwenen/);
});

test("CMS-dependent fields are checked for presence only", () => {
  const expected = snapshotFrom(PAGE);
  expected.pages["/taxi-almere"].cmsDependent = ["title", "h1"];
  const edited = PAGE.replace("Taxi Almere &amp; omgeving", "Andere CMS-titel").replace("naar Schiphol", "uit het CMS");
  assert.deepEqual(compareSnapshots(expected, snapshotFrom(edited)).errors, []);

  const empty = PAGE.replace(/<title>.*<\/title>/, "<title></title>");
  assert.match(compareSnapshots(expected, snapshotFrom(empty)).errors.join("\n"), /<title> verdwenen/);
});
