import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  EXECUTION_STATUSES,
  JOB_FLIGHT_MONITOR,
  SCHEDULER_TRACE_HEADER,
  completeExecution,
  countsFromSummary,
  isTraceId,
  readTraceId,
  startExecution,
} from "@/lib/scheduler/executions";

const MIGRATION = readFileSync(
  "supabase/migrations/20260910120000_scheduler_executions.sql",
  "utf8"
);

const TRACE = "9f1c2f2a-3b4d-4e5f-8a9b-0c1d2e3f4a5b";

/** Minimale Supabase-dubbelganger: alleen `rpc` wordt gebruikt. */
function fakeClient(handler: (name: string, args: Record<string, unknown>) => unknown) {
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      const result = handler(name, args);
      if (result instanceof Error) return { data: null, error: { message: result.message } };
      return { data: result, error: null };
    },
  } as never;
}

// ── trace_id ────────────────────────────────────────────────────────────────

test("alleen een geldige UUID telt als trace_id", () => {
  assert.equal(isTraceId(TRACE), true);
  assert.equal(isTraceId(TRACE.toUpperCase()), true);
  for (const rommel of ["", "   ", "niet-een-uuid", "12345", null, undefined, 42, {}]) {
    assert.equal(isTraceId(rommel), false, String(rommel));
  }
});

test("readTraceId normaliseert en weigert onbruikbare invoer", () => {
  const met = (value: string) =>
    new Request("https://x.test", { method: "POST", headers: { [SCHEDULER_TRACE_HEADER]: value } });

  assert.equal(readTraceId(met(`  ${TRACE.toUpperCase()}  `)), TRACE);
  assert.equal(readTraceId(met("kapot")), null);
  assert.equal(readTraceId(met("")), null);
  assert.equal(readTraceId(new Request("https://x.test", { method: "POST" })), null);
});

// ── tellers ─────────────────────────────────────────────────────────────────

test("elke geclaimde rij telt precies één keer mee", () => {
  const summary = {
    claimed: 9, updated: 4, deactivated: 2, notFound: 1, errors: 1, rateLimited: 1,
  };
  const counts = countsFromSummary(summary);
  assert.deepEqual(counts, { claimedCount: 9, processedCount: 7, failedCount: 2 });
  assert.equal(
    counts.processedCount + counts.failedCount,
    counts.claimedCount,
    "processed + failed moet de claim dekken, anders raakt een categorie zoek"
  );
});

// ── RPC-vertaling ───────────────────────────────────────────────────────────

test("startExecution vertaalt de RPC-uitkomsten zonder ze te verzachten", async () => {
  const geslaagd = await startExecution(
    fakeClient(() => ({ ok: true, changed: true, id: "row-1", status: "running" })),
    TRACE
  );
  assert.deepEqual(geslaagd, { ok: true, id: "row-1" });

  for (const fout of ["unknown_trace_id", "already_running", "already_terminal"]) {
    const uitkomst = await startExecution(fakeClient(() => ({ ok: false, error: fout })), TRACE);
    assert.equal(uitkomst.ok, false);
    assert.equal(uitkomst.ok === false && uitkomst.error, fout);
  }

  // Een databasefout mag nooit als succes doorgaan.
  const kapot = await startExecution(fakeClient(() => new Error("connection refused")), TRACE);
  assert.equal(kapot.ok, false);
  assert.equal(kapot.ok === false && kapot.error, "rpc_error");
});

test("completeExecution onderscheidt een echte afronding van een no-op", async () => {
  const eerste = await completeExecution(
    fakeClient(() => ({ ok: true, changed: true, status: "completed" })),
    TRACE,
    { status: "completed", claimedCount: 3, processedCount: 3, failedCount: 0 }
  );
  assert.deepEqual(eerste, { ok: true, changed: true, status: "completed" });

  // Tweede completion op een terminale rij: geslaagd, maar niets gewijzigd.
  const tweede = await completeExecution(
    fakeClient(() => ({ ok: true, changed: false, status: "completed" })),
    TRACE,
    { status: "failed" }
  );
  assert.deepEqual(tweede, { ok: true, changed: false, status: "completed" });

  const onbekend = await completeExecution(
    fakeClient(() => ({ ok: false, error: "unknown_trace_id" })),
    TRACE,
    { status: "completed" }
  );
  assert.equal(onbekend.ok, false);
});

test("de tellers en foutvelden komen ongewijzigd bij de RPC aan", async () => {
  let ontvangen: Record<string, unknown> = {};
  await completeExecution(
    fakeClient((_name, args) => {
      ontvangen = args;
      return { ok: true, changed: true, status: "failed" };
    }),
    TRACE,
    {
      status: "failed", claimedCount: 5, processedCount: 2, failedCount: 3,
      httpStatus: 502, errorCode: "not_configured", errorMessage: "Schiphol-key ontbreekt",
    }
  );
  assert.equal(ontvangen.p_trace_id, TRACE);
  assert.equal(ontvangen.p_status, "failed");
  assert.equal(ontvangen.p_claimed_count, 5);
  assert.equal(ontvangen.p_failed_count, 3);
  assert.equal(ontvangen.p_http_status, 502);
  assert.equal(ontvangen.p_error_code, "not_configured");
});

// ── regressiebescherming op de migratie ─────────────────────────────────────
// Aanvullend, GEEN vervanging van de stagingproef: dit bewijst niet dat Postgres
// zich zo gedraagt, alleen dat de garanties niet stilletjes uit de SQL verdwijnen.

test("de migratie draagt hetzelfde statusmodel als de code", () => {
  for (const status of EXECUTION_STATUSES) {
    assert.ok(MIGRATION.includes(`'${status}'`), `${status} ontbreekt in de migratie`);
  }
  assert.match(MIGRATION, /check \(status in \('scheduled', 'running', 'completed', 'failed'\)\)/);
});

test("de statusmachine staat als constraint in de database, niet alleen in de RPC's", () => {
  assert.match(MIGRATION, /scheduler_executions_state_consistent/);
  assert.match(MIGRATION, /status = 'scheduled'\s*\n\s*and started_at is null and completed_at is null/);
  assert.match(MIGRATION, /status = 'running'\s*\n\s*and started_at is not null and completed_at is null/);
});

test("service_role mag de tabel niet rechtstreeks muteren", () => {
  // Alleen SELECT: schrijven loopt uitsluitend via de SECURITY DEFINER-RPC's,
  // zodat ook de applicatie de statusmachine niet kan omzeilen.
  assert.match(MIGRATION, /grant select on public\.scheduler_executions to service_role;/);
  assert.doesNotMatch(MIGRATION, /grant[^;]*insert[^;]*on public\.scheduler_executions/i);
  assert.doesNotMatch(MIGRATION, /grant[^;]*update[^;]*on public\.scheduler_executions/i);
  assert.match(MIGRATION, /revoke all on public\.scheduler_executions from public, anon, authenticated;/);
  assert.match(MIGRATION, /enable row level security/);
});

test("elke RPC is security definer met een vastgezette search_path", () => {
  const functies = MIGRATION.match(/create or replace function public\.\w+/g) ?? [];
  assert.equal(functies.length, 4, "verwacht schedule/start/complete/list_stale");
  const definers = MIGRATION.match(/security definer\s*\n\s*set search_path = ''/g) ?? [];
  assert.equal(definers.length, 4, "elke RPC hoort search_path expliciet vast te zetten");
});

test("start_execution kan nooit stilletjes een execution aanmaken", () => {
  const body = MIGRATION.slice(
    MIGRATION.indexOf("function public.start_execution"),
    MIGRATION.indexOf("function public.complete_execution")
  );
  assert.doesNotMatch(body, /\binsert\b/i, "start_execution mag geen insert bevatten");
  assert.match(body, /and status = 'scheduled'/);
  assert.match(body, /'unknown_trace_id'/);
});

test("alleen service_role mag de RPC's uitvoeren", () => {
  for (const fn of ["schedule_execution", "start_execution", "complete_execution", "list_stale_executions"]) {
    assert.ok(
      new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\)[\\s\\n]*from public, anon, authenticated`).test(MIGRATION),
      `${fn} is niet ingetrokken voor public/anon/authenticated`
    );
    assert.ok(
      new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\)[\\s\\n]*to service_role`).test(MIGRATION),
      `${fn} is niet aan service_role gegund`
    );
  }
});

test("stale is afgeleid en wordt nergens als status opgeslagen", () => {
  assert.doesNotMatch(MIGRATION, /'stale'|'abandoned'/);
  assert.match(MIGRATION, /list_stale_executions/);
  assert.match(MIGRATION, /completed_at is null/);
});

test("het endpoint weigert te pollen zonder geldige trace_id", () => {
  const route = readFileSync("app/api/flights/monitor/route.ts", "utf8");
  const traceCheck = route.indexOf("readTraceId");
  const poll = route.indexOf("pollActiveFlightsWithSupabase(supabase)");
  const start = route.indexOf("startExecution(");
  assert.ok(traceCheck > 0 && start > traceCheck, "trace_id wordt vóór de start gelezen");
  assert.ok(poll > start, "er wordt pas gepolld nadat de execution is gestart");
  assert.match(route, /missing_trace_id/);
  assert.ok(JOB_FLIGHT_MONITOR.length > 0);
});
