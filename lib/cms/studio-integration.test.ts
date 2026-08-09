import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const nextConfig = readFileSync("next.config.mjs", "utf8");
const proxy = readFileSync("proxy.ts", "utf8");
const studioPage = readFileSync("app/studio/[[...tool]]/page.tsx", "utf8");
const studioLayout = readFileSync("app/studio/layout.tsx", "utf8");
const sanityConfig = readFileSync("sanity.config.ts", "utf8");
const envExample = readFileSync(".env.example", "utf8");
const robots = readFileSync("app/robots.ts", "utf8");

test("Studio gebruikt de officiële Next 16 catch-all integratie", () => {
  assert.match(studioPage, /import \{ NextStudio \} from "next-sanity\/studio"/);
  assert.match(studioPage, /dynamic = "force-static"/);
  assert.match(
    studioPage,
    /export \{ metadata, viewport \} from "next-sanity\/studio"/,
  );
  assert.match(studioPage, /<NextStudio config=\{config\}/);
  assert.match(sanityConfig, /^"use client";/);
  assert.match(studioLayout, /<html lang="nl">/);
  assert.match(studioLayout, /<body style=\{\{ margin: 0 \}\}>/);
});

test("locale-proxy sluit /studio en alle Studio-subroutes exact uit", () => {
  assert.match(proxy, /studio\(\?:\/\|\$\)/);
  assert.doesNotMatch(proxy, /\(\?!api\|studio\|/);
});

test("Presentation kan uitsluitend same-origin framen", () => {
  assert.match(nextConfig, /X-Frame-Options", value: "SAMEORIGIN"/);
  assert.match(nextConfig, /frame-ancestors 'self'/);
  assert.doesNotMatch(nextConfig, /frame-ancestors https:/);
});

test("CSP staat alleen de vaste T4XI Sanity API-, CDN- en WebSocket-origins toe", () => {
  assert.match(nextConfig, /NEXT_PUBLIC_SANITY_PROJECT_ID/);
  assert.match(nextConfig, /\^\[a-z0-9\]\+\$/);
  assert.match(nextConfig, /`https:\/\/\$\{sanityProjectId\}\.api\.sanity\.io`/);
  assert.match(nextConfig, /`https:\/\/\$\{sanityProjectId\}\.apicdn\.sanity\.io`/);
  assert.match(nextConfig, /`wss:\/\/\$\{sanityProjectId\}\.api\.sanity\.io`/);
  assert.doesNotMatch(nextConfig, /https:\/\/\*\.api\.sanity\.io/);
  assert.doesNotMatch(nextConfig, /https:\/\/\*\.apicdn\.sanity\.io/);
  assert.doesNotMatch(nextConfig, /wss:\/\/\*\.api\.sanity\.io/);
  assert.match(nextConfig, /const sanityCoreOrigin = "https:\/\/core\.sanity-cdn\.com"/);
  assert.match(nextConfig, /https:\/\/js\.stripe\.com \$\{sanityCoreOrigin\}/);
  assert.match(nextConfig, /worker-src 'self' blob:/);
});

test("Next Image accepteert alleen beelden uit het T4XI-productiepad", () => {
  assert.match(nextConfig, /hostname: "cdn\.sanity\.io"/);
  assert.match(nextConfig, /pathname: `\/images\/\$\{sanityProjectId\}\/\$\{sanityDataset\}\/\*\*`/);
  assert.doesNotMatch(nextConfig, /hostname: "\*\*\.sanity\.io"/);
});

test("het preview-token blijft server-only in het voorbeeldbestand", () => {
  assert.match(envExample, /^SANITY_API_READ_TOKEN=$/m);
  assert.doesNotMatch(envExample, /^NEXT_PUBLIC_SANITY_API_READ_TOKEN=/m);
});

test("de beheeromgeving is noindex en uitgesloten voor crawlers", () => {
  assert.match(
    studioPage,
    /export \{ metadata, viewport \} from "next-sanity\/studio"/,
  );
  assert.match(robots, /"\/studio"/);
});
