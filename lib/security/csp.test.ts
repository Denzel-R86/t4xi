/**
 * S1 — header-snapshot van de report-only nonce-CSP (masterplan §9).
 *
 * 1. De policy is deterministisch op de nonce na (snapshot hieronder).
 * 2. De nonce is per aanroep anders en heeft het formaat dat Next accepteert.
 * 3. De afgedwongen CSP in next.config.mjs is NIET gewijzigd (broncode-lock):
 *    S1 verandert geen productiegedrag tot de eigenaar enforce besluit.
 * 4. proxy.ts zet de policy op request én response en wist client-CSP-headers.
 * 5. productionBrowserSourceMaps staat expliciet uit.
 * 6. Het rapport-endpoint logt geen PII.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildReportOnlyCsp, cspSourcesFromEnv, generateNonce, CSP_REPORT_PATH } from "@/lib/security/csp";
import { existsSync } from "node:fs";
import { classifyCspViolation, formatCspViolation, parseCspReports, SSG_PAGE_PATHS } from "@/lib/security/csp-report";

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

const SOURCES = cspSourcesFromEnv({
  NEXT_PUBLIC_SANITY_PROJECT_ID: "95pzjxjq",
  NEXT_PUBLIC_SANITY_DATASET: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co",
})!;

const SNAPSHOT = [
  "default-src 'self'",
  "script-src 'nonce-<NONCE>' 'strict-dynamic' 'self' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob: https://cdn.sanity.io/images/95pzjxjq/production/",
  "worker-src 'self' blob:",
  "connect-src 'self' https://abcdefgh.supabase.co https://api.pdok.nl https://places.googleapis.com https://api.stripe.com https://95pzjxjq.api.sanity.io https://95pzjxjq.apicdn.sanity.io wss://95pzjxjq.api.sanity.io",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "report-uri /api/csp-report",
].join("; ");

test("snapshot: report-only policy is deterministisch op de nonce na", () => {
  const a = generateNonce();
  const b = generateNonce();
  const pa = buildReportOnlyCsp(a, SOURCES, { isDev: false });
  const pb = buildReportOnlyCsp(b, SOURCES, { isDev: false });
  assert.equal(pa.replace(a, "<NONCE>"), SNAPSHOT);
  assert.equal(pb.replace(b, "<NONCE>"), SNAPSHOT);
  assert.ok(pa.endsWith(`report-uri ${CSP_REPORT_PATH}`));
});

test("script-src: geen 'unsafe-inline', wel nonce + strict-dynamic; dev voegt alleen 'unsafe-eval' toe", () => {
  const nonce = generateNonce();
  const prod = buildReportOnlyCsp(nonce, SOURCES, { isDev: false });
  const scriptSrc = prod.split("; ").find((d) => d.startsWith("script-src "))!;
  assert.ok(!scriptSrc.includes("'unsafe-inline'"));
  assert.ok(!scriptSrc.includes("'unsafe-eval'"));
  assert.ok(scriptSrc.includes(`'nonce-${nonce}'`) && scriptSrc.includes("'strict-dynamic'"));
  const dev = buildReportOnlyCsp(nonce, SOURCES, { isDev: true });
  assert.equal(dev, prod.replace("'self' https://js.stripe.com;", "'self' https://js.stripe.com 'unsafe-eval';"));
});

test("nonce: 128 bit base64, uniek per aanroep, door Next herkend", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const nonce = generateNonce();
    assert.match(nonce, /^[A-Za-z0-9+/]{22}==$/);
    seen.add(nonce);
  }
  assert.equal(seen.size, 500);
  // Zelfde regex als next/dist/server/app-render/get-script-nonce-from-header.js.
  const nextRe = /^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/;
  const nonce = generateNonce();
  const src = buildReportOnlyCsp(nonce, SOURCES, { isDev: false }).split("; ")[1].split(/\s+/)[1];
  assert.equal(src.match(nextRe)?.[1], nonce);
});

test("nonce en env kunnen geen directive injecteren", () => {
  assert.throws(() => buildReportOnlyCsp("abc'; script-src *", SOURCES, { isDev: false }));
  assert.equal(cspSourcesFromEnv({ NEXT_PUBLIC_SANITY_PROJECT_ID: "x; script-src *" }), null);
  assert.equal(cspSourcesFromEnv({ NEXT_PUBLIC_SANITY_DATASET: "prod uction" }), null);
  assert.equal(cspSourcesFromEnv({ NEXT_PUBLIC_SUPABASE_URL: "http://insecure.example" })?.supabaseOrigin, null);
  assert.equal(cspSourcesFromEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co/pad; script-src *" })?.supabaseOrigin, "https://x.supabase.co");
  const noSupabase = buildReportOnlyCsp(generateNonce(), cspSourcesFromEnv({})!, { isDev: false });
  assert.ok(noSupabase.includes("connect-src 'self' https://api.pdok.nl"));
});

test("afgedwongen CSP in next.config.mjs is ongewijzigd (S1 = alleen report-only)", () => {
  const config = read("next.config.mjs");
  const enforced = [
    `\`script-src 'self' 'unsafe-inline'\${isDev ? " 'unsafe-eval'" : ""} https://js.stripe.com \${sanityCoreOrigin}\`,`,
    `"style-src 'self' 'unsafe-inline'",`,
    `\`img-src 'self' data: blob: \${sanityImageSource}\`,`,
    `\`connect-src 'self'\${supabaseConnectOrigin} https://api.pdok.nl https://places.googleapis.com https://api.stripe.com \${sanityApiOrigin} \${sanityApiCdnOrigin} \${sanityWebSocketOrigin}\`,`,
    `"frame-src 'self' https://js.stripe.com https://hooks.stripe.com",`,
    `"frame-ancestors 'self'",`,
    `key: "Content-Security-Policy",`,
  ];
  for (const line of enforced) assert.ok(config.includes(line), `afgedwongen CSP gewijzigd: ${line}`);
  assert.ok(!/key:\s*"Content-Security-Policy-Report-Only"/.test(config), "report-only hoort in proxy.ts (nonce per request)");
  assert.ok(!/nonce/i.test(config.slice(config.indexOf("Content-Security-Policy"))), "een nonce in de afgedwongen policy schakelt 'unsafe-inline' uit");
});

test("productionBrowserSourceMaps staat expliciet op false", () => {
  assert.match(read("next.config.mjs"), /^\s*productionBrowserSourceMaps:\s*false,/m);
});

test("proxy.ts: policy op request (voor Next) én response (voor de browser), client-header gewist", () => {
  const proxy = read("proxy.ts");
  for (const fragment of [
    'headers.delete("content-security-policy");',
    "headers.delete(REPORT_ONLY_HEADER);",
    "headers.set(REPORT_ONLY_HEADER, policy);",
    'headers.set("x-nonce", nonce);',
    "response.headers.set(REPORT_ONLY_HEADER, policy);",
    "applyReportOnly(intlMiddleware(csp.request), csp.policy)",
  ]) {
    assert.ok(proxy.includes(fragment), `proxy.ts mist: ${fragment}`);
  }
  // Elke NextResponse.next() in de proxy draagt de CSP-requestheaders mee.
  assert.equal((proxy.match(/NextResponse\.next\(\)/g) ?? []).length, 0, "NextResponse.next() zonder nonce-requestheaders");
  // De afgedwongen variant mag nooit als RESPONSE-header vanuit de proxy komen.
  assert.ok(!/response\.headers\.set\("content-security-policy"/i.test(proxy));
});

test("rapport: alleen directive, origin en pad — geen query, sample of referrer", () => {
  const legacy = JSON.stringify({
    "csp-report": {
      "document-uri": "https://www.t4xi.nl/boeken?pickup=Kerkstraat%201&email=a%40b.nl#x",
      "blocked-uri": "https://evil.example/x.js?token=geheim",
      "effective-directive": "script-src-elem",
      "script-sample": "alert('Kerkstraat 1')",
      referrer: "https://www.t4xi.nl/?telefoon=0612345678",
      "source-file": "https://www.t4xi.nl/_next/static/chunks/a.js?v=1",
      disposition: "report",
    },
  });
  const [v] = parseCspReports(legacy);
  assert.deepEqual(v, { directive: "script-src-elem", blocked: "https://evil.example", page: "/boeken", source: "self", disposition: "report", category: "onbekend" });
  const line = formatCspViolation(v);
  for (const leak of ["Kerkstraat", "geheim", "0612345678", "a%40b", "alert", "?", "#"]) assert.ok(!line.includes(leak), `lekt ${leak}`);

  const reportTo = JSON.stringify([
    { type: "csp-violation", body: { documentURL: "https://www.t4xi.nl/en/tarieven?x=1", blockedURL: "inline", effectiveDirective: "script-src-elem", disposition: "report" } },
    { type: "deprecation", body: {} },
  ]);
  assert.deepEqual(parseCspReports(reportTo), [{ directive: "script-src-elem", blocked: "inline", page: "/en/tarieven", source: "-", disposition: "report", category: "onbekend" }]);
});

test("rapport: onzin, log-injectie en te veel rapporten worden begrensd", () => {
  assert.deepEqual(parseCspReports("niet-json"), []);
  assert.deepEqual(parseCspReports("{}"), []);
  assert.deepEqual(parseCspReports('{"csp-report": []}'), []);
  const [v] = parseCspReports(JSON.stringify({ "csp-report": { "effective-directive": "script-src\nFAKE=1", "document-uri": "https://x.test/a\nb c" } }));
  // Alleen het eerste token telt; de geïnjecteerde regel verdwijnt.
  assert.equal(v.directive, "script-src");
  assert.match(formatCspViolation(v), /^[^\n\r]*$/);
  assert.match(v.page, /^[A-Za-z0-9/_.~-]+$/);
  assert.equal(parseCspReports(JSON.stringify({ "csp-report": { "effective-directive": "x=1;rm" } }))[0].directive, "?");
  const many = JSON.stringify(Array.from({ length: 50 }, () => ({ type: "csp-violation", body: { effectiveDirective: "img-src" } })));
  assert.equal(parseCspReports(many).length, 10);
});

test("categorie: F-47-ruis (SSG zonder nonce) is herkenbaar, de rest niet", () => {
  const report = (doc: string, blocked: string, directive = "script-src-elem") =>
    parseCspReports(JSON.stringify({ "csp-report": { "document-uri": doc, "blocked-uri": blocked, "effective-directive": directive, disposition: "report" } }))[0];
  // Next-chunk (zelfde origin) en inline-script op een SSG-pagina, NL en EN.
  assert.equal(report("https://www.t4xi.nl/diensten", "https://www.t4xi.nl/_next/static/chunks/a.js").category, "F-47 ssg-no-nonce");
  assert.equal(report("https://www.t4xi.nl/en/over-ons?x=1", "inline").category, "F-47 ssg-no-nonce");
  assert.equal(report("https://www.t4xi.nl/diensten", "https://www.t4xi.nl/x.js").blocked, "self");
  // Zelfde violation op een dynamische pagina is GEEN F-47: dat is een echte afwijking.
  assert.equal(report("https://www.t4xi.nl/tarieven", "inline").category, "onbekend");
  assert.equal(report("https://www.t4xi.nl/", "inline").category, "onbekend");
  // Vreemde origin op een SSG-pagina is ook geen F-47.
  assert.equal(report("https://www.t4xi.nl/diensten", "https://evil.example/x.js").category, "onbekend");
  // Andere directive op een SSG-pagina evenmin.
  assert.equal(report("https://www.t4xi.nl/diensten", "https://cdn.example", "img-src").category, "onbekend");
  // Stripe-/Link-hosts apart (bewijs voor de Stripe-hostvraag).
  assert.equal(report("https://www.t4xi.nl/boeken", "https://b.js.stripe.com", "frame-src").category, "stripe-host");
  assert.equal(report("https://www.t4xi.nl/boeken", "https://checkout.link.com", "frame-src").category, "stripe-host");
  assert.equal(report("https://www.t4xi.nl/boeken", "https://stripe.com.evil.example", "frame-src").category, "onbekend");
  assert.match(formatCspViolation(report("https://www.t4xi.nl/diensten", "inline")), /^\[csp-report\] category="F-47 ssg-no-nonce" /);
  assert.equal(classifyCspViolation({ directive: "script-src", blocked: "inline", page: "/en", source: "-", disposition: "report" }), "onbekend");
});

test("SSG-lijst klopt met de laatste build (alleen als .next aanwezig is)", (t) => {
  const manifest = path.join(ROOT, ".next", "prerender-manifest.json");
  if (!existsSync(manifest)) return t.skip("geen build");
  const routes = Object.keys(JSON.parse(readFileSync(manifest, "utf8")).routes as Record<string, unknown>);
  const ssg = routes.filter((r) => r.startsWith("/nl/")).map((r) => r.slice(3))
    // /dashboard en /klant worden door proxy.ts als 404 beantwoord (nooit gerenderd).
    .filter((r) => r !== "/dashboard" && r !== "/klant").sort();
  assert.deepEqual(ssg, [...SSG_PAGE_PATHS].sort());
});
