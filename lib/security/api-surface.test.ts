/**
 * S2 — publieke API-matrix als broncode-lock (masterplan §9).
 *
 * 1. Volledigheid: elke `app/api/**\/route.ts` en elke geëxporteerde HTTP-methode
 *    heeft precies één entry in API_SURFACE, en omgekeerd.
 * 2. Juistheid: elk `evidence`-fragment staat in de handler van die methode; een
 *    entry die "geen" claimt (publiek, geen limiet, geen body) mag de bijbehorende
 *    aanroepen ook niet bevatten.
 * 3. F-39/F-41: Origin-check op muterende admin-methoden, limiet + lockout op de
 *    ops-login en limiet + cache op /api/flights/health staan in de bron.
 * 4. Gaps zijn expliciet: ontbrekende limiet/body-limiet, PII in logs of in een
 *    logtabel en de in-memory store vereisen een gap met findings-nummer.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  API_SURFACE,
  GLOBAL_GAPS,
  type ApiSurfaceEntry,
  type AuthKind,
  type GapCategory,
  type HttpMethod,
} from "@/lib/security/api-surface";

const ROOT = process.cwd();
const API_DIR = path.join(ROOT, "app", "api");
const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

/** Bronmarkeringen per auth-soort. `publiek` mag geen van deze bevatten. */
const AUTH_MARKERS: Record<Exclude<AuthKind, "publiek">, string[]> = {
  "basic-auth": ["isAuthorizedAdminRequest(", "hasValidOpsCredentials("],
  "webhook-signature": ["webhooks.constructEvent(", "verifyResendSignature("],
  "draft-secret": ["defineEnableDraftMode("],
  service: ["secretsMatch(providedSecret("],
};
const ALL_AUTH_MARKERS = Object.values(AUTH_MARKERS).flat();
const RATE_LIMIT_MARKERS = ["rateLimit(", "isRateLimited("];
const BODY_READ_MARKERS = ["request.text(", "request.json(", "req.text(", "req.json(", "request.formData(", "request.arrayBuffer("];
const INPUT_MARKERS = [...BODY_READ_MARKERS, "searchParams", "params"];
/** Tokens die in een console-regel op persoonsgegevens wijzen. */
const PII_LOG_TOKENS = /\$\{(?:ip|ua|email|phone|name|reason|pickup|dropoff|address)\b|customer_?(?:email|name|phone)/i;

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((dirent) => {
    const full = path.join(dir, dirent.name);
    if (dirent.isDirectory()) return routeFiles(full);
    return dirent.name === "route.ts" ? [path.relative(ROOT, full).split(path.sep).join("/")] : [];
  });
}

function routePath(file: string): string {
  return "/" + file.replace(/^app\//, "").replace(/\/route\.ts$/, "");
}

function exportedMethods(source: string): HttpMethod[] {
  const found = new Set<HttpMethod>();
  const direct = /export\s+(?:async\s+)?(?:function|const|let)\s+([A-Z]+)\b/g;
  for (const match of source.matchAll(direct)) {
    if (METHODS.includes(match[1] as HttpMethod)) found.add(match[1] as HttpMethod);
  }
  for (const block of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of block[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && METHODS.includes(name as HttpMethod)) found.add(name as HttpMethod);
    }
  }
  return [...found].sort();
}

/** Handlerbron: vanaf de export van `method` tot de volgende top-level export. */
function handlerSource(source: string, method: HttpMethod): string {
  const start = source.search(new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let)\\s+${method}\\b`));
  assert.ok(start >= 0, `export van ${method} niet gevonden`);
  const rest = source.slice(start + 1);
  const next = rest.search(/^export\s/m);
  return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
}

function consoleCalls(source: string): string[] {
  return [...source.matchAll(/console\.(?:log|info|warn|error|debug)\(([\s\S]*?)\);/g)].map((m) => m[1]);
}

const sources = new Map<string, string>();
function read(file: string): string {
  if (!sources.has(file)) sources.set(file, readFileSync(path.join(ROOT, file), "utf8"));
  return sources.get(file)!;
}

const label = (e: ApiSurfaceEntry) => `${e.method} ${e.route}`;
const hasGap = (e: ApiSurfaceEntry, category: GapCategory) =>
  e.gaps.some((gap) => gap.category === category && /^F-\d+$/.test(gap.finding) && gap.text.trim().length > 10);

test("elke app/api/**/route.ts en elke geëxporteerde methode staat in de matrix", () => {
  const files = routeFiles(API_DIR);
  assert.ok(files.length > 0, "geen routes gevonden — klopt de werkmap?");
  const actual = files.flatMap((file) => exportedMethods(read(file)).map((m) => `${m} ${file}`)).sort();
  const declared = API_SURFACE.map((e) => `${e.method} ${e.file}`).sort();
  const missing = actual.filter((key) => !declared.includes(key));
  const stale = declared.filter((key) => !actual.includes(key));
  assert.deepEqual(missing, [], `route/methode zonder matrix-entry: ${missing.join(", ")}`);
  assert.deepEqual(stale, [], `matrix-entry zonder route/methode: ${stale.join(", ")}`);
  assert.equal(new Set(declared).size, declared.length, "dubbele matrix-entry");
  for (const e of API_SURFACE) assert.equal(e.route, routePath(e.file), `${label(e)}: route ≠ bestandspad`);
});

test("auth: het opgegeven mechanisme staat in de handler; publiek bevat geen auth-check", () => {
  for (const e of API_SURFACE) {
    const handler = handlerSource(read(e.file), e.method);
    if (e.auth.kind === "publiek") {
      for (const marker of ALL_AUTH_MARKERS) {
        assert.ok(!handler.includes(marker), `${label(e)}: publiek, maar bevat ${marker}`);
      }
      continue;
    }
    const markers = AUTH_MARKERS[e.auth.kind];
    assert.ok(e.auth.evidence.length > 0, `${label(e)}: auth zonder bewijs`);
    for (const ev of e.auth.evidence) {
      assert.ok(handler.includes(ev), `${label(e)}: auth-bewijs ontbreekt in de bron: ${ev}`);
      assert.ok(markers.some((m) => ev.includes(m)), `${label(e)}: ${ev} is geen ${e.auth.kind}-mechanisme`);
    }
  }
});

test("admin-routes: elke methode onder /api/admin (behalve uitloggen) gebruikt de ops-check", () => {
  for (const file of routeFiles(path.join(API_DIR, "admin"))) {
    for (const method of exportedMethods(read(file))) {
      const entry = API_SURFACE.find((e) => e.file === file && e.method === method)!;
      if (file.endsWith("admin/session/route.ts") && method === "DELETE") continue;
      assert.equal(entry.auth.kind, "basic-auth", `${label(entry)} moet basic-auth zijn`);
    }
  }
});

test("CSRF: cookie-auth routes leunen op een SameSite=Strict-sessiecookie", () => {
  const session = read("app/api/admin/session/route.ts");
  assert.ok(session.includes('sameSite: "strict"'), "ops-sessiecookie is niet meer SameSite=Strict");
  assert.ok(session.includes("httpOnly: true"), "ops-sessiecookie is niet meer HttpOnly");
  for (const e of API_SURFACE) {
    const cookieAuth = e.route.startsWith("/api/admin/");
    assert.equal(e.csrf !== "n.v.t.", cookieAuth, `${label(e)}: CSRF-kolom klopt niet met cookie-auth`);
  }
});

test("CSRF (F-39): elke muterende admin-methode doet de Origin-check als eerste stap", () => {
  const helper = read("lib/security/same-origin.ts");
  assert.ok(helper.includes("export function isSameOriginRequest("), "Origin-helper ontbreekt");
  for (const e of API_SURFACE.filter((entry) => entry.route.startsWith("/api/admin/"))) {
    const handler = handlerSource(read(e.file), e.method);
    const mutating = e.method !== "GET" && e.method !== "HEAD" && e.method !== "OPTIONS";
    const claimsOrigin = e.csrf === "SameSite=Strict-cookie + Origin-check";
    assert.equal(claimsOrigin, mutating, `${label(e)}: muterend ⇔ Origin-check in de matrix`);
    assert.equal(handler.includes("isSameOriginRequest(request)"), claimsOrigin, `${label(e)}: Origin-check in de bron klopt niet met de matrix`);
    if (!claimsOrigin) continue;
    assert.ok(read(e.file).includes('from "@/lib/security/same-origin"'), `${label(e)}: gebruikt lib/security/same-origin niet`);
    const origin = handler.indexOf("isSameOriginRequest(request)");
    for (const later of ["isAuthorizedAdminRequest(", "hasValidOpsCredentials(", "request.json(", "rateLimit("]) {
      const at = handler.indexOf(later);
      assert.ok(at < 0 || origin < at, `${label(e)}: Origin-check moet vóór ${later} staan`);
    }
  }
});

test("ops-login (F-39): limiet per IP, lockout per IP en naam vóór de wachtwoordcheck", () => {
  const login = API_SURFACE.find((e) => e.route === "/api/admin/session" && e.method === "POST")!;
  assert.equal(login.rateLimit.kind, "lib-in-memory", "ops-login zonder limiet");
  assert.ok(login.lockout && login.lockout.evidence.length >= 2, "ops-login zonder lockout in de matrix");
  const handler = handlerSource(read(login.file), "POST");
  for (const ev of login.lockout.evidence) assert.ok(handler.includes(ev), `lockout-bewijs ontbreekt: ${ev}`);
  const gate = handler.indexOf("checkOpsLogin(ip, username)");
  const verify = handler.indexOf("hasValidOpsCredentials(username, password)");
  assert.ok(gate >= 0 && gate < verify, "lockout moet vóór de wachtwoordcheck gelezen worden");
  assert.ok(handler.indexOf("recordOpsLoginFailure(ip, username)") > verify, "mislukte poging wordt niet geteld");
  const throttle = read("lib/admin/login-throttle.ts");
  assert.ok(throttle.includes('from "@/lib/security/rate-limit"'), "lockout gebruikt de bestaande limiter niet");
  for (const call of ["peekRateLimit(", "rateLimit(`ops-login:", "rateLimit(`ops-login-fail:"]) {
    assert.ok(throttle.includes(call), `lockout-helper mist ${call}`);
  }
  assert.ok(!login.gaps.some((g) => g.finding === "F-39"), "F-39 is opgelost: geen open F-39-gap meer");
});

test("upstream-cache (F-41): de health-check cachet de Schiphol-opvraag", () => {
  for (const e of API_SURFACE.filter((entry) => entry.upstreamCache)) {
    const handler = handlerSource(read(e.file), e.method);
    for (const ev of e.upstreamCache!.evidence) assert.ok(handler.includes(ev), `${label(e)}: cache-bewijs ontbreekt: ${ev}`);
  }
  const health = API_SURFACE.find((e) => e.route === "/api/flights/health")!;
  assert.ok(health.upstreamCache, "/api/flights/health zonder cache in de matrix");
  assert.notEqual(health.rateLimit.kind, "none", "/api/flights/health zonder limiet");
  const cache = read("lib/schiphol/health-cache.ts");
  assert.ok(cache.includes(`HEALTH_CACHE_TTL_MS = ${health.upstreamCache.ttlSec}_000`), "cache-TTL klopt niet met de matrix");
  assert.ok(!health.gaps.some((g) => g.finding === "F-41"), "F-41 is opgelost: geen open F-41-gap meer");
});

test("rate limit: budget en sleutel staan in de handler; 'none' bevat geen limiter", () => {
  for (const e of API_SURFACE) {
    const handler = handlerSource(read(e.file), e.method);
    const source = read(e.file);
    if (e.rateLimit.kind === "none") {
      for (const marker of RATE_LIMIT_MARKERS) {
        assert.ok(!handler.includes(marker), `${label(e)}: 'none', maar bevat ${marker}`);
      }
      assert.ok(hasGap(e, "rate-limit"), `${label(e)}: geen limiet zonder expliciete gap`);
      continue;
    }
    const call = e.rateLimit.kind === "lib-in-memory" ? "rateLimit(" : "isRateLimited(";
    assert.ok(handler.includes(call), `${label(e)}: limiter-aanroep ${call} ontbreekt`);
    if (e.rateLimit.kind === "lib-in-memory") {
      assert.ok(source.includes('from "@/lib/security/rate-limit"'), `${label(e)}: gebruikt lib/security/rate-limit niet`);
    }
    // Budgetbewijs mag in module-constanten staan; de aanroep zelf in de handler.
    for (const ev of e.rateLimit.evidence) {
      assert.ok(source.includes(ev), `${label(e)}: limiet-bewijs ontbreekt: ${ev}`);
    }
    assert.ok(e.rateLimit.evidence.some((ev) => ev.includes(call) && handler.includes(ev)), `${label(e)}: limiter-aanroep niet als bewijs vastgelegd`);
    assert.ok(e.rateLimit.max > 0 && e.rateLimit.windowSec > 0, `${label(e)}: ongeldig budget`);
  }
});

test("in-memory limiters zijn gedekt door de globale gap (B6)", () => {
  const inMemory = API_SURFACE.some((e) => e.rateLimit.kind !== "none");
  assert.equal(inMemory, true);
  assert.ok(GLOBAL_GAPS.some((g) => g.category === "rate-limit" && /^F-\d+$/.test(g.finding)));
  const limiter = readFileSync(path.join(ROOT, "lib/security/rate-limit.ts"), "utf8");
  assert.ok(limiter.includes("new Map<string, Bucket>()"), "limiter is niet meer in-memory: matrix en gap bijwerken");
});

test("body-size: limiet staat in de handler; 'geen-body' leest geen body; 'none' is een gap", () => {
  for (const e of API_SURFACE) {
    const handler = handlerSource(read(e.file), e.method);
    const readsBody = BODY_READ_MARKERS.some((m) => handler.includes(m));
    if (e.bodyLimit.kind === "geen-body") {
      assert.equal(readsBody, false, `${label(e)}: 'geen-body', maar leest een body`);
      continue;
    }
    assert.equal(readsBody, true, `${label(e)}: claimt een body, maar leest er geen`);
    if (e.bodyLimit.kind === "none") {
      assert.ok(!handler.includes("MAX_BODY_BYTES"), `${label(e)}: 'none', maar bevat MAX_BODY_BYTES`);
      assert.ok(hasGap(e, "body-size"), `${label(e)}: geen body-limiet zonder expliciete gap`);
      continue;
    }
    const source = read(e.file);
    for (const ev of e.bodyLimit.evidence) {
      assert.ok(source.includes(ev), `${label(e)}: body-limiet-bewijs ontbreekt: ${ev}`);
    }
    assert.ok(source.includes(`MAX_BODY_BYTES = ${e.bodyLimit.maxBytes.toLocaleString("en").replace(/,/g, "_")}`) ||
      source.includes(`MAX_BODY_BYTES = ${e.bodyLimit.maxBytes}`), `${label(e)}: maxBytes ${e.bodyLimit.maxBytes} klopt niet`);
    assert.ok(hasGap(e, "body-size"), `${label(e)}: limiet na inlezen zonder expliciete gap`);
  }
});

test("validatie: elk bewijsfragment staat in de handler; 'geen-invoer' leest geen invoer", () => {
  for (const e of API_SURFACE) {
    const handler = handlerSource(read(e.file), e.method);
    if (e.validation.kind === "geen-invoer") {
      for (const marker of INPUT_MARKERS) {
        assert.ok(!handler.includes(marker), `${label(e)}: 'geen-invoer', maar bevat ${marker}`);
      }
      continue;
    }
    assert.ok(e.validation.evidence.length > 0, `${label(e)}: validatie zonder bewijs`);
    for (const ev of e.validation.evidence) {
      assert.ok(read(e.file).includes(ev), `${label(e)}: validatie-bewijs ontbreekt: ${ev}`);
    }
  }
});

test("PII in logs: elke console-regel met PII-tokens staat in de matrix, met gap", () => {
  const files = [...new Set(API_SURFACE.map((e) => e.file))];
  for (const file of files) {
    const entries = API_SURFACE.filter((e) => e.file === file);
    const declared = entries.flatMap((e) => e.pii.logged.map((l) => l.evidence));
    for (const call of consoleCalls(read(file))) {
      if (!PII_LOG_TOKENS.test(call)) continue;
      assert.ok(declared.some((ev) => call.includes(ev)), `${file}: niet-gedeclareerde PII-logregel: ${call.trim().slice(0, 120)}`);
    }
    for (const e of entries) {
      for (const log of e.pii.logged) {
        assert.ok(consoleCalls(read(file)).some((c) => c.includes(log.evidence)), `${label(e)}: logbewijs niet in een console-regel: ${log.evidence}`);
      }
      if (e.pii.logged.length > 0) assert.ok(hasGap(e, "pii-log"), `${label(e)}: PII in logs zonder expliciete gap`);
      if (e.pii.persistedLog) assert.ok(hasGap(e, "pii-opslag"), `${label(e)}: PII in logtabel zonder expliciete gap`);
    }
  }
});

test("kostengevoelige upstream-routes zijn begrensd of hebben een kosten-/limietgap", () => {
  for (const e of API_SURFACE.filter((entry) => entry.upstreamCost && entry.auth.kind === "publiek")) {
    assert.ok(e.rateLimit.kind !== "none" || hasGap(e, "rate-limit"), `${label(e)}: kost geld zonder limiet of gap`);
  }
  const places = API_SURFACE.find((e) => e.route === "/api/places");
  assert.ok(places && hasGap(places, "kosten"), "/api/places: Google-kosten moeten apart benoemd zijn (§9)");
});

test("findings-nummers in de matrix bestaan in findings.md", () => {
  const findings = readFileSync(path.join(ROOT, "docs/experience-2.0/baseline/findings.md"), "utf8");
  const ids = new Set([...GLOBAL_GAPS, ...API_SURFACE.flatMap((e) => e.gaps)].map((g) => g.finding));
  for (const id of ids) {
    assert.match(findings, new RegExp(`^\\| ${id} \\|`, "m"), `${id} ontbreekt in findings.md`);
  }
});
