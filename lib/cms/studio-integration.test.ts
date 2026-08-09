import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const nextConfig = readFileSync("next.config.mjs", "utf8");
const middleware = readFileSync("middleware.ts", "utf8");
const studioPage = readFileSync("app/studio/[[...tool]]/page.tsx", "utf8");
const studioClient = readFileSync("app/studio/[[...tool]]/StudioClient.tsx", "utf8");
const studioLayout = readFileSync("app/studio/layout.tsx", "utf8");
const envExample = readFileSync(".env.example", "utf8");
const robots = readFileSync("app/robots.ts", "utf8");

test("Studio gebruikt de officiële Next 14 catch-all integratie", () => {
  assert.match(studioPage, /StudioClient/);
  assert.match(studioPage, /dynamic = "force-static"/);
  assert.match(studioPage, /export const metadata/);
  assert.match(studioPage, /export const viewport/);
  assert.match(studioClient, /^"use client";/);
  assert.match(studioClient, /next-sanity\/studio\/client-component/);
  assert.match(studioClient, /<NextStudio config=\{config\}/);
  assert.match(studioLayout, /<html lang="nl">/);
  assert.match(studioLayout, /<body style=\{\{ margin: 0 \}\}>/);
});

test("locale-middleware sluit /studio en alle Studio-subroutes exact uit", () => {
  assert.match(middleware, /studio\(\?:\/\|\$\)/);
  assert.doesNotMatch(middleware, /\(\?!api\|studio\|/);
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
  assert.match(studioPage, /robots: "noindex"/);
  assert.match(robots, /"\/studio"/);
});
