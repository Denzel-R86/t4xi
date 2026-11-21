import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("components/consent/Trackers.tsx", "utf8");

test("de eerste GA4-pageview wacht aantoonbaar tot na GA4-configuratie", () => {
  const configPosition = source.indexOf('window.gtag?.("config", gaMeasurementId');
  const readyPosition = source.indexOf("setGa4Ready(true)");
  const eventPosition = source.indexOf('window.gtag("event", "page_view"');
  assert.ok(configPosition >= 0 && readyPosition > configPosition && eventPosition > readyPosition);
  assert.match(source, /if \(!activation\.initializeGA4 \|\| !ga4Ready\)/);
  assert.match(source, /ga4Ready,\s*activation\.initializeGA4/);
});

test("GA4- en Meta-pageviews hebben ieder hun eigen toestemmingspoort", () => {
  assert.match(source, /if \(!activation\.initializeGA4 \|\| !ga4Ready\)/);
  assert.match(source, /if \(!marketing \|\| !metaPixelId \|\| !metaPixelReady\)/);
});

test("Meta heeft precies één PageView-pad en wacht op initialisatie", () => {
  assert.equal(source.match(/fbq\((?:"|')track(?:"|'), (?:"|')PageView(?:"|')\)/g)?.length, 1);
  assert.match(source, /if \(!marketing \|\| !metaPixelId \|\| !metaPixelReady\)/);
  assert.match(source, /onReady=\{\(\) => setMetaPixelReady\(true\)\}/);
});

// 2026-11-21: gtag.js verwerkt alleen `arguments`-objecten. Een rest-array
// (`(...args) => dataLayer.push(args)`) leverde in een browsertest 0 hits op.
test("gtag pusht het arguments-object, nooit een rest-array", () => {
  assert.match(source, /window\.gtag = function gtag\(\) \{[\s\S]{0,200}?window\.dataLayer\?\.push\(arguments\);/);
  assert.doesNotMatch(source, /window\.gtag = \(\.\.\.\w+[^)]*\) =>/);
  assert.doesNotMatch(source, /dataLayer\?\.push\(args\)/);
});

// 2026-11-21: live ging de eerste page_view met gcs=G100 (default "denied")
// uit, ondanks toestemming. Omdat er in Basic-mode pas iets laadt NA een
// keuze, is de default nu gelijk aan die keuze en volgt er geen update vóór
// de eerste hit. Intrekken blijft via `consent update` lopen.
test("consent default bij het opstarten is de gemaakte keuze, niet hard 'denied'", () => {
  const start = source.indexOf('window.gtag("consent", "default"');
  const js = source.indexOf('window.gtag("js", new Date())');
  assert.ok(start >= 0 && js > start);
  const defaultBlock = source.slice(start, js);
  assert.match(defaultBlock, /analytics_storage: statistics \? "granted" : "denied"/);
  assert.match(defaultBlock, /ad_storage: marketing \? "granted" : "denied"/);
  assert.match(defaultBlock, /ad_user_data: marketing \? "granted" : "denied"/);
  assert.match(defaultBlock, /ad_personalization: marketing \? "granted" : "denied"/);
  assert.doesNotMatch(defaultBlock, /analytics_storage: "denied"/);
});

test("tussen 'js' en de eerste config staat geen consent-update meer", () => {
  const js = source.indexOf('window.gtag("js", new Date())');
  const config = source.indexOf('window.gtag?.("config", gaMeasurementId');
  assert.ok(js >= 0 && config > js);
  assert.doesNotMatch(source.slice(js, config), /"consent", "update"/);
});

test("intrekken en wijzigen lopen nog steeds via consent update", () => {
  assert.match(source, /if \(typeof window\.gtag === "function"\) \{\s*window\.gtag\("consent", "update"/);
});
