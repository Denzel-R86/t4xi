import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { pollActiveFlightsWithSupabase } from "@/lib/flight-monitoring/service";
import {
  completeExecution,
  countsFromSummary,
  readTraceId,
  startExecution,
} from "@/lib/scheduler/executions";

/**
 * POST /api/flights/monitor
 *
 * Draait één pollronde: werkt elke actieve `flight_monitoring`-rij bij via de
 * Schiphol-API. Bedoeld om periodiek getriggerd te worden (bv. een cron), niet
 * publiek: de route vereist een gedeeld geheim in de `x-monitor-secret`-header
 * (of `Authorization: Bearer <secret>`), vergeleken met FLIGHT_MONITOR_SECRET.
 *
 * Server-only (service-role client). Geen pricing, geen Stripe, geen UI.
 * Statisch pad — wint in Next.js van /api/flights/[flightNumber].
 *
 * OBSERVABILITY (Phase 3, ticket 1)
 *   De scheduler maakt de execution aan en geeft de database-side trace_id mee
 *   in de `x-trace-id`-header. Deze route maakt er NOOIT zelf een aan: zonder
 *   geldige trace_id wordt er niet gepolld, zodat werk zonder spoor onmogelijk
 *   is. Slaagt de start niet — onbekende id, al gestart, al afgerond — dan
 *   blijft de pollronde eveneens achterwege.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Service-role client — uitsluitend server-side; key nooit naar de client. */
function serviceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function providedSecret(request: Request): string {
  const header = request.headers.get("x-monitor-secret");
  if (header) return header.trim();
  const auth = request.headers.get("authorization") ?? "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

/** Constant-time vergelijking; lengteverschil faalt zonder timingSafeEqual te gooien. */
function secretsMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export async function POST(request: Request) {
  const secret = (process.env.FLIGHT_MONITOR_SECRET ?? "").trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "not_configured", message: "Monitoring is niet geconfigureerd." },
      { status: 503 }
    );
  }
  if (!secretsMatch(providedSecret(request), secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Geen geldige trace_id → geen scheduler-run. Bewust vóór de databaseclient:
  // er wordt niets geclaimd en er ontstaat geen execution.
  const traceId = readTraceId(request);
  if (!traceId) {
    return NextResponse.json(
      { ok: false, error: "missing_trace_id", message: "Een geldige x-trace-id is verplicht." },
      { status: 400 }
    );
  }

  const supabase = serviceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "unavailable", message: "Database is tijdelijk niet beschikbaar." },
      { status: 503 }
    );
  }

  const started = await startExecution(supabase, traceId);
  if (!started.ok) {
    // Niet pollen. Een onbekende id mag geen run laten ontstaan, en een al
    // lopende of afgeronde execution mag niet dubbel verwerkt worden.
    const status = started.error === "unknown_trace_id" ? 404 : started.error === "rpc_error" ? 503 : 409;
    return NextResponse.json(
      { ok: false, error: started.error, trace_id: traceId, status: started.status },
      { status }
    );
  }

  const summary = await pollActiveFlightsWithSupabase(supabase);
  const httpStatus = summary.aborted ? 502 : 200;

  // Afronden is best-effort voor de HTTP-response: lukt het niet, dan blijft de
  // execution op `running` staan en is hij ná de maximale looptijd als
  // stale/abandoned afleidbaar. Dat is beter dan een response ophouden.
  const completion = await completeExecution(supabase, traceId, {
    status: summary.aborted ? "failed" : "completed",
    ...countsFromSummary(summary),
    httpStatus,
    errorCode: summary.aborted,
  }).catch(() => ({ ok: false, error: "complete_failed" }) as const);

  if (!completion.ok) {
    console.error(
      `[ALERT][scheduler] execution_not_completed — ${traceId}: ${completion.error}. ` +
        "De vluchten zijn wél verwerkt; de run blijft op 'running' en wordt stale."
    );
  }

  return NextResponse.json(
    { ok: !summary.aborted, trace_id: traceId, ...summary },
    { status: httpStatus }
  );
}
