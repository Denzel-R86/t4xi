/** F-41 — /api/flights/health: limiet per IP en 60 s cache van de Schiphol-opvraag. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import { GET } from "@/app/api/flights/health/route";
import { cachedSchipholHealth, HEALTH_CACHE_TTL_MS, resetSchipholHealthCache } from "@/lib/schiphol/health-cache";
import { resetSchipholTokenCache } from "@/lib/schiphol/client";
import type { SchipholHealth } from "@/lib/schiphol/types";

const realFetch = globalThis.fetch;
const saved = { id: process.env.SCHIPHOL_CLIENT_ID, secret: process.env.SCHIPHOL_CLIENT_SECRET };
let upstreamCalls = 0;

beforeEach(() => {
  resetSchipholHealthCache();
  resetSchipholTokenCache();
  process.env.SCHIPHOL_CLIENT_ID = `test-id-${randomUUID()}`;
  process.env.SCHIPHOL_CLIENT_SECRET = `test-secret-${randomUUID()}`;
  upstreamCalls = 0;
  // Geen netwerk: elke upstream-aanroep wordt geteld en geweigerd.
  globalThis.fetch = (async () => {
    upstreamCalls += 1;
    return new Response("{}", { status: 401 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  resetSchipholHealthCache();
  resetSchipholTokenCache();
  for (const [name, value] of [["SCHIPHOL_CLIENT_ID", saved.id], ["SCHIPHOL_CLIENT_SECRET", saved.secret]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const call = (ip: string) =>
  GET(new Request("https://www.t4xi.nl/api/flights/health", { headers: { "x-forwarded-for": ip } }));

test("health: herhaalde aanroepen raken Schiphol één keer (cache), antwoordvorm ongewijzigd", async () => {
  const first = await call("203.0.113.10");
  const body = await first.json();
  assert.equal(first.status, 502);
  assert.deepEqual(Object.keys(body).sort(), ["checkedAt", "ok", "status", "upstreamStatus"]);
  assert.equal(body.status, "unauthorized");
  const afterFirst = upstreamCalls;
  assert.ok(afterFirst >= 1);
  for (let i = 0; i < 4; i += 1) assert.equal((await call(`203.0.113.${20 + i}`)).status, 502);
  assert.equal(upstreamCalls, afterFirst, "binnen de TTL geen nieuwe upstream-opvraag, ook niet vanaf andere IP's");
});

test("health: de 7e aanroep per IP binnen een minuut krijgt 429 zonder upstream-opvraag", async () => {
  const ip = "203.0.113.99";
  for (let i = 0; i < 6; i += 1) assert.notEqual((await call(ip)).status, 429);
  const before = upstreamCalls;
  const limited = await call(ip);
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error, "rate_limited");
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.equal(upstreamCalls, before);
});

test("health-cache: verloopt na de TTL, deelt een lopende opvraag en cachet geen exception", async () => {
  let checks = 0;
  const result: SchipholHealth = { ok: true, status: "ok", upstreamStatus: 200, checkedAt: "x" };
  const check = async () => { checks += 1; return result; };
  const t0 = 1_000_000;
  await Promise.all([cachedSchipholHealth(check, t0), cachedSchipholHealth(check, t0)]);
  await cachedSchipholHealth(check, t0 + HEALTH_CACHE_TTL_MS - 1);
  assert.equal(checks, 1);
  await cachedSchipholHealth(check, t0 + HEALTH_CACHE_TTL_MS + 1);
  assert.equal(checks, 2);

  resetSchipholHealthCache();
  await assert.rejects(cachedSchipholHealth(async () => { throw new Error("boom"); }, t0));
  assert.equal((await cachedSchipholHealth(check, t0 + 1)).status, "ok", "na een exception wordt opnieuw gevraagd");
});
