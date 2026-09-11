/**
 * Scheduler execution records — de applicatiekant van de statusmachine.
 *
 *   scheduled → running → completed | failed
 *
 * De database is eigenaar van het ONTSTAAN van een execution: `schedule_execution()`
 * draait aan de schedulerkant, vóór de HTTP-call. Deze module kan een bestaande
 * execution alléén starten en afronden — nooit aanmaken. Dat is met opzet: een
 * record dat de applicatie zelf zou schrijven kan een mislukte trigger niet
 * vastleggen, want dan draait de applicatie helemaal niet.
 *
 * Stale/abandoned is afgeleid, geen opgeslagen status: `started_at` gezet,
 * `completed_at` leeg, ouder dan de maximale looptijd. Zie `list_stale_executions`.
 *
 * De echte garanties staan in de migratie 20260910120000_scheduler_executions:
 * de statusconstraint, de RPC's en het feit dat `service_role` alleen SELECT
 * heeft op de tabel. Deze module is de typed toegang daartoe, geen tweede
 * implementatie ervan.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Header waarin de scheduler de database-side trace_id meegeeft. */
export const SCHEDULER_TRACE_HEADER = "x-trace-id";

/** `job_type` van de vluchtmonitor. */
export const JOB_FLIGHT_MONITOR = "flight-monitor";

export const EXECUTION_STATUSES = ["scheduled", "running", "completed", "failed"] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Alleen een geldige UUID telt als trace_id; een verzonnen string wordt geweigerd. */
export function isTraceId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/** Leest de trace_id uit de request. Geen waarde betekent: geen scheduler-run. */
export function readTraceId(request: Request): string | null {
  const raw = request.headers.get(SCHEDULER_TRACE_HEADER);
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return isTraceId(trimmed) ? trimmed.toLowerCase() : null;
}

export type StartOutcome =
  | { ok: true; id: string }
  | {
      ok: false;
      /** `unknown_trace_id` | `already_running` | `already_terminal` | `rpc_error` */
      error: string;
      status?: ExecutionStatus;
    };

/**
 * Zet een geplande execution op running. Faalt expliciet wanneer de trace_id
 * onbekend is of de execution niet meer op `scheduled` staat — er ontstaat dan
 * geen nieuwe rij en de aanroeper hoort géén werk te doen.
 */
export async function startExecution(
  supabase: SupabaseClient,
  traceId: string
): Promise<StartOutcome> {
  const { data, error } = await supabase.rpc("start_execution", { p_trace_id: traceId });
  if (error) return { ok: false, error: "rpc_error" };

  const row = data as { ok?: boolean; id?: string; error?: string; status?: string } | null;
  if (row?.ok === true && typeof row.id === "string") return { ok: true, id: row.id };
  return {
    ok: false,
    error: typeof row?.error === "string" ? row.error : "rpc_error",
    status: (row?.status as ExecutionStatus | undefined) ?? undefined,
  };
}

export type CompletionInput = {
  status: Extract<ExecutionStatus, "completed" | "failed">;
  claimedCount?: number;
  processedCount?: number;
  failedCount?: number;
  httpStatus?: number;
  errorCode?: string;
  errorMessage?: string;
};

export type CompleteOutcome =
  | { ok: true; changed: boolean; status: string }
  | { ok: false; error: string; status?: string };

/**
 * Rondt de lopende execution af. Een tweede completion op een al terminale rij
 * is een geslaagde no-op; de eerste uitkomst blijft staan.
 */
export async function completeExecution(
  supabase: SupabaseClient,
  traceId: string,
  input: CompletionInput
): Promise<CompleteOutcome> {
  const { data, error } = await supabase.rpc("complete_execution", {
    p_trace_id: traceId,
    p_status: input.status,
    p_claimed_count: input.claimedCount ?? null,
    p_processed_count: input.processedCount ?? null,
    p_failed_count: input.failedCount ?? null,
    p_http_status: input.httpStatus ?? null,
    p_error_code: input.errorCode ?? null,
    p_error_message: input.errorMessage ?? null,
  });
  if (error) return { ok: false, error: "rpc_error" };

  const row = data as { ok?: boolean; changed?: boolean; error?: string; status?: string } | null;
  if (row?.ok === true) {
    return { ok: true, changed: row.changed === true, status: String(row.status ?? input.status) };
  }
  return {
    ok: false,
    error: typeof row?.error === "string" ? row.error : "rpc_error",
    status: typeof row?.status === "string" ? row.status : undefined,
  };
}

/**
 * Vertaalt een `PollSummary` naar de tellers van het execution-record.
 *
 * `processed` telt de rijen met een afgeronde uitkomst (bijgewerkt, gedeactiveerd
 * of niet gevonden); `failed` telt de transiënte mislukkingen (upstream-fouten en
 * rate limits). Samen dekken ze elke geclaimde rij, want `decidePatch` geeft elke
 * rij precies één categorie.
 */
export function countsFromSummary(summary: {
  claimed: number;
  updated: number;
  deactivated: number;
  notFound: number;
  errors: number;
  rateLimited: number;
}): { claimedCount: number; processedCount: number; failedCount: number } {
  return {
    claimedCount: summary.claimed,
    processedCount: summary.updated + summary.deactivated + summary.notFound,
    failedCount: summary.errors + summary.rateLimited,
  };
}
