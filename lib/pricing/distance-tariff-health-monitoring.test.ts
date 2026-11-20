import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  evaluateDistanceTariffHealth,
  INFRA_UNHEALTHY_MIN_ALWAYS,
  INFRA_UNHEALTHY_MIN_WITHOUT_SUCCESS,
  type DistanceTariffCounts,
} from "@/lib/pricing/distance-tariff-health";
import {
  buildDistanceTariffHealthBody,
  collectDistanceTariffCounts,
  HealthQueryTimeoutError,
  monitoringFailedBody,
} from "@/lib/pricing/distance-tariff-health-query";

/** Monitoring 2.0 (2026-11-21) — beslislogica, queries, PII-vrije output, workflow. */

const NOW = new Date("2026-11-21T06:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
const base: Required<DistanceTariffCounts> = {
  successesInWindow: 0,
  routingFailuresInWindow: 0,
  missesInStalePeriod: 0,
  lastSuccessAt: daysAgo(1),
  infraFailuresInWindow: 0,
  pricedQuotesInWindow: 0,
};
const ev = (over: Partial<DistanceTariffCounts>) => evaluateDistanceTariffHealth({ ...base, ...over }, { now: NOW });

// ── Beslislogica ──────────────────────────────────────────────────────────

test("drempels zijn vastgelegd", () => {
  assert.equal(INFRA_UNHEALTHY_MIN_WITHOUT_SUCCESS, 2);
  assert.equal(INFRA_UNHEALTHY_MIN_ALWAYS, 5);
});

test("idle: geen verkeer en geen storingssignalen", () => {
  assert.deepEqual(ev({}), { status: "idle", reason: "no_traffic" });
});

test("healthy: geslaagde afstandsprijs, geen storingen", () => {
  assert.deepEqual(ev({ successesInWindow: 2, pricedQuotesInWindow: 3 }), { status: "ok", reason: "recent_success" });
});

test("config-timeouts zonder enige prijs -> unhealthy binnen 24 uur, ook zonder afstandssucces", () => {
  const h = ev({ infraFailuresInWindow: 2, missesInStalePeriod: 2 });
  assert.equal(h.status, "unhealthy");
  assert.equal(h.status === "unhealthy" && h.reason, "infrastructure_failing");
});

test("één losse storing -> degraded, geen alarm", () => {
  assert.deepEqual(ev({ infraFailuresInWindow: 1, missesInStalePeriod: 1 }), {
    status: "degraded",
    reason: "infrastructure_errors",
    infraFailuresInWindow: 1,
  });
});

test("storingen met wel werkende (vaste) prijzen onder de drempel -> degraded", () => {
  const h = ev({ infraFailuresInWindow: 3, pricedQuotesInWindow: 4, missesInStalePeriod: 3 });
  assert.equal(h.status, "degraded");
});

test("storing naast een geslaagde afstandsprijs -> degraded, niet ok", () => {
  const h = ev({ successesInWindow: 1, pricedQuotesInWindow: 1, infraFailuresInWindow: 1 });
  assert.equal(h.status, "degraded");
});

test(">= 5 storingen in 24 uur -> unhealthy, ook met tussendoor werkende prijzen", () => {
  const h = ev({ infraFailuresInWindow: 5, pricedQuotesInWindow: 10, successesInWindow: 2 });
  assert.equal(h.status === "unhealthy" && h.reason, "infrastructure_failing");
});

test("alleen echte unknown_location-missers (geen storing, recent succes) -> nooit alarm", () => {
  assert.deepEqual(ev({ lastSuccessAt: daysAgo(2), missesInStalePeriod: 10 }), { status: "ok", reason: "no_signal" });
});

test("7-daags vangnet werkt nog: geen succes in 8 dagen + 3 missers -> stale", () => {
  const h = ev({ lastSuccessAt: daysAgo(8), missesInStalePeriod: 3 });
  assert.equal(h.status === "unhealthy" && h.reason, "stale");
});

test("routingstoring zonder succes blijft unhealthy (ongewijzigd)", () => {
  const h = ev({ routingFailuresInWindow: 1 });
  assert.equal(h.status === "unhealthy" && h.reason, "routing_failing");
});

// ── Queries via een fake Supabase-client ─────────────────────────────────

type Filter = [string, string, unknown];
type Handler = (filters: Filter[]) => { count?: number; data?: unknown; error?: unknown } | Promise<never>;

function fakeClient(handler: Handler) {
  const queries: Filter[][] = [];
  const builder = (filters: Filter[]): Record<string, unknown> => {
    const add = (op: string) => (col: string, a?: unknown, b?: unknown) =>
      builder([...filters, [op, col, b === undefined ? a : [a, b]]]);
    const run = () => {
      queries.push(filters);
      const out = handler(filters);
      return out instanceof Promise ? out : Promise.resolve({ count: null, data: null, error: null, ...out });
    };
    return {
      gte: add("gte"), eq: add("eq"), is: add("is"), like: add("like"), in: add("in"), not: add("not"),
      order: add("order"), limit: add("limit"),
      maybeSingle: () => run(),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej),
    };
  };
  const client = { from: (t: string) => ({ select: (cols: string) => builder([["from", t, cols]]) }) };
  return { client: client as never, queries };
}

const has = (f: Filter[], op: string, col: string) => f.some(([o, c]) => o === op && c === col);

/** Scenario: config-timeouts getagd in price_breakdown, geen enkele prijs. */
function scenario(filters: Filter[]) {
  if (has(filters, "order", "created_at")) {
    return { data: { created_at: "2026-11-20T10:00:00Z", pickup_input: "Geheimstraat 1, Almere", request_payload: { pickup: "x" } } };
  }
  if (has(filters, "not", "price_breakdown->infraFailure")) return { count: 3 };
  if (filters.some(([o, c, v]) => o === "in" && c === "error_code" && Array.isArray(v) && v.includes("unknown_location"))) return { count: 3 };
  return { count: 0 };
}

test("collect: telt getagde storingen als infra; 3 timeouts zonder prijs -> unhealthy", async () => {
  const { client, queries } = fakeClient(scenario);
  const counts = await collectDistanceTariffCounts(client, NOW);
  assert.equal(counts.infraFailuresInWindow, 3);
  assert.equal(counts.pricedQuotesInWindow, 0);
  assert.equal(counts.missesInStalePeriod, 3);
  const body = buildDistanceTariffHealthBody(counts, NOW);
  assert.equal(body.state, "unhealthy");
  assert.equal(body.ok, false);
  // Alleen tellingen: elke count-query is head-only op pricing_quote_logs.
  for (const q of queries) assert.equal(q[0]![1], "pricing_quote_logs");
});

test("collect: data_unavailable telt als infrastructuurstoring", async () => {
  const { client } = fakeClient((f) =>
    f.some(([o, c, v]) => o === "in" && c === "error_code" && Array.isArray(v) && v.includes("data_unavailable"))
      ? { count: 2 }
      : has(f, "order", "created_at") ? { data: null } : { count: 0 }
  );
  const counts = await collectDistanceTariffCounts(client, NOW);
  assert.equal(counts.infraFailuresInWindow, 2);
  assert.equal(buildDistanceTariffHealthBody(counts, NOW).state, "unhealthy");
});

test("collect: geen verkeer -> idle", async () => {
  const { client } = fakeClient((f) => (has(f, "order", "created_at") ? { data: null } : { count: 0 }));
  const body = buildDistanceTariffHealthBody(await collectDistanceTariffCounts(client, NOW), NOW);
  assert.equal(body.state, "idle");
  assert.equal(body.ok, true);
});

test("monitoring kapot: een queryfout gooit (route -> 503), nooit healthy", async () => {
  const { client } = fakeClient(() => ({ error: { message: "permission denied" } }));
  await assert.rejects(collectDistanceTariffCounts(client, NOW));
});

test("monitoring kapot: hangende database -> HealthQueryTimeoutError", async () => {
  const { client } = fakeClient(() => new Promise<never>(() => {}));
  await assert.rejects(collectDistanceTariffCounts(client, NOW, 20), HealthQueryTimeoutError);
});

test("monitoringFailedBody is nooit ok/healthy", () => {
  const b = monitoringFailedBody("query_timeout", NOW);
  assert.equal(b.ok, false);
  assert.equal(b.state, "unhealthy");
  assert.equal(b.health.status, "unhealthy");
});

// ── PII: de response bevat alleen tellingen, codes en tijdstempels ─────────

test("health-response bevat geen adressen, klantdata, sleutels of payloads", async () => {
  const { client } = fakeClient(scenario);
  const body = buildDistanceTariffHealthBody(await collectDistanceTariffCounts(client, NOW), NOW);
  const json = JSON.stringify(body);
  for (const verboden of ["Geheimstraat", "Almere", "pickup", "dropoff", "request_payload", "AIza", "@", "secret", "key"]) {
    assert.ok(!json.toLowerCase().includes(verboden.toLowerCase()), `response bevat '${verboden}'`);
  }
  assert.deepEqual(Object.keys(body).sort(), ["checkedAt", "counts", "health", "lastSuccessAt", "ok", "state"]);
  for (const v of Object.values(body.counts)) assert.equal(typeof v, "number");
  assert.ok(body.lastSuccessAt === null || /^\d{4}-\d\d-\d\dT/.test(body.lastSuccessAt));
});

// ── Bronscans: route en workflow ─────────────────────────────────────────

const route = readFileSync(new URL("../../app/api/pricing/health/route.ts", import.meta.url), "utf8");
const query = readFileSync(new URL("./distance-tariff-health-query.ts", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../../.github/workflows/pricing-health.yml", import.meta.url), "utf8");

test("route: elke fout in de monitoring -> 503 met monitoringFailedBody", () => {
  assert.match(route, /catch \(e\) \{[\s\S]*monitoringFailedBody\(error, now\)[\s\S]*status: 503/);
  assert.match(route, /monitoringFailedBody\("not_configured"/);
  assert.match(route, /monitoringFailedBody\("no_service_role_client"/);
});

test("query-module selecteert nooit adresvelden", () => {
  for (const veld of ["pickup_input", "dropoff_input", "request_payload"]) assert.ok(!query.includes(veld), veld);
});

test("workflow: handmatig startbaar, faalt op non-200, waarschuwt bij degraded", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /if \[ "\$status" != "200" \]/);
  assert.match(workflow, /degraded\)\s*\n\s*echo "::warning::/);
});

test("workflow: optionele dead-man's switch, no-op zonder secret, URL nooit gelogd", () => {
  assert.match(workflow, /HEALTHCHECKS_PING_URL: \$\{\{ secrets\.HEALTHCHECKS_PING_URL \}\}/);
  assert.match(workflow, /if: failure\(\)/);
  assert.match(workflow, /"\$HEALTHCHECKS_PING_URL\/fail"/);
  assert.equal((workflow.match(/continue-on-error: true/g) ?? []).length, 2);
  assert.ok(!/echo[^\n]*\$HEALTHCHECKS_PING_URL/.test(workflow), "URL mag niet ge-echood worden");
  assert.ok(!/uses:/.test(workflow), "geen third-party actions");
});
