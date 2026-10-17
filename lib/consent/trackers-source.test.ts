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
