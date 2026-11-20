/**
 * IO-kant van de afstand-tarief-health-check (Monitoring 2.0, 2026-11-21).
 *
 * Leest uitsluitend TELLINGEN (`head: true`, `count: "exact"`) en één
 * tijdstempel uit `pricing_quote_logs` — nooit adressen, payloads of
 * foutteksten — en bouwt de response die naar de GitHub-workflow gaat. Schrijft
 * niets.
 *
 * Faalt of hangt een query, dan gooit `collectDistanceTariffCounts`; de route
 * maakt daar een 503 `monitoring_failed` van. De monitoring zelf kan dus nooit
 * stil "gezond" melden.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_STALE_AFTER_DAYS,
  evaluateDistanceTariffHealth,
  healthState,
  type DistanceTariffCounts,
  type DistanceTariffHealth,
  type HealthState,
} from "@/lib/pricing/distance-tariff-health";

const WINDOW_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Totaalbudget voor alle health-queries samen. Ruim boven een normale
 * Supabase-respons (tientallen ms), ruim onder de functie-timeout van Vercel,
 * zodat een hangende database een 503 oplevert in plaats van een
 * functietimeout zonder body.
 */
export const HEALTH_QUERY_TIMEOUT_MS = 8_000;

/** `error_code`-waarden die per definitie een infrastructuurstoring zijn. */
export const INFRA_ERROR_CODES = ["data_unavailable", "airport_arrival_surcharge_unavailable"] as const;

export class HealthQueryTimeoutError extends Error {}

type CountResult = PromiseLike<{ count: number | null; error: unknown }>;

async function count(query: CountResult): Promise<number> {
  const { count: n, error } = await query;
  if (error) throw error;
  return n ?? 0;
}

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new HealthQueryTimeoutError(`health queries exceeded ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

export async function collectDistanceTariffCounts(
  supabase: SupabaseClient,
  now: Date,
  timeoutMs: number = HEALTH_QUERY_TIMEOUT_MS
): Promise<Required<DistanceTariffCounts>> {
  const windowStart = new Date(now.getTime() - WINDOW_MS).toISOString();
  const staleStart = new Date(now.getTime() - DEFAULT_STALE_AFTER_DAYS * DAY_MS).toISOString();
  const logs = () => supabase.from("pricing_quote_logs").select("id", { count: "exact", head: true });
  const infraCodes = [...INFRA_ERROR_CODES];

  const all = Promise.all([
    // Missers = aanvragen die een afstandsprijs nodig hadden en er geen kregen.
    // `outside_service_area` / `beyond_max_approach` tellen bewust NIET mee:
    // dat is beleid, geen storing.
    count(logs().gte("created_at", windowStart).eq("price_source", "distance_tariff").is("error_code", null)),
    count(logs().gte("created_at", windowStart).like("error_code", "routing_unavailable:%")),
    count(logs().gte("created_at", staleStart).in("error_code", ["unknown_location", "route_not_fixed"])),
    count(logs().gte("created_at", staleStart).like("error_code", "routing_unavailable:%")),
    // Monitoring 2.0 — infrastructuurstoringen, 24 uur en 7 dagen. Een rij met
    // `infraFailure` heeft altijd error_code unknown_location/route_not_fixed,
    // dus de twee tellingen per periode zijn disjunct.
    count(logs().gte("created_at", windowStart).in("error_code", infraCodes)),
    count(logs().gte("created_at", windowStart).not("price_breakdown->infraFailure", "is", null)),
    count(logs().gte("created_at", staleStart).in("error_code", infraCodes)),
    // Alle geprijsde offertes (vaste route of afstand) in 24 uur.
    count(logs().gte("created_at", windowStart).is("error_code", null).not("price_source", "is", null)),
    supabase
      .from("pricing_quote_logs")
      .select("created_at")
      .eq("price_source", "distance_tariff")
      .is("error_code", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const [
    successesInWindow,
    routingFailuresInWindow,
    unresolvedMisses,
    routingMisses,
    infraCodeInWindow,
    infraTaggedInWindow,
    infraCodeInStale,
    pricedQuotesInWindow,
    last,
  ] = await withDeadline(all, timeoutMs);
  if (last.error) throw last.error;

  const createdAt = (last.data as { created_at?: unknown } | null)?.created_at;
  const lastSuccessAt = typeof createdAt === "string" ? new Date(createdAt) : null;
  if (lastSuccessAt && Number.isNaN(lastSuccessAt.getTime())) throw new Error("invalid created_at");

  // `unknown_location`/`route_not_fixed` in de 7-daagse misser-telling bevat
  // de getagde infrastructuurrijen al; alleen de error_code-storingen komen erbij.
  return {
    successesInWindow,
    routingFailuresInWindow,
    missesInStalePeriod: unresolvedMisses + routingMisses + infraCodeInStale,
    lastSuccessAt,
    infraFailuresInWindow: infraCodeInWindow + infraTaggedInWindow,
    pricedQuotesInWindow,
  };
}

/**
 * De response van de health-check. Bevat UITSLUITEND tellingen, vaste
 * status-/redencodes en tijdstempels — gebouwd uit een expliciete allowlist
 * van velden, nooit door een databaserij door te geven.
 */
export type DistanceTariffHealthBody = {
  ok: boolean;
  state: HealthState;
  health: DistanceTariffHealth;
  counts: {
    successesInWindow: number;
    routingFailuresInWindow: number;
    missesInStalePeriod: number;
    infraFailuresInWindow: number;
    pricedQuotesInWindow: number;
  };
  lastSuccessAt: string | null;
  checkedAt: string;
};

export function buildDistanceTariffHealthBody(
  counts: Required<DistanceTariffCounts>,
  now: Date
): DistanceTariffHealthBody {
  const health = evaluateDistanceTariffHealth(counts, { now });
  return {
    ok: health.status !== "unhealthy",
    state: healthState(health),
    health,
    counts: {
      successesInWindow: counts.successesInWindow,
      routingFailuresInWindow: counts.routingFailuresInWindow,
      missesInStalePeriod: counts.missesInStalePeriod,
      infraFailuresInWindow: counts.infraFailuresInWindow,
      pricedQuotesInWindow: counts.pricedQuotesInWindow,
    },
    lastSuccessAt: counts.lastSuccessAt?.toISOString() ?? null,
    checkedAt: now.toISOString(),
  };
}

/** Response wanneer de monitoring zelf niet kan draaien — nooit "gezond". */
export function monitoringFailedBody(error: string, now: Date) {
  return {
    ok: false as const,
    state: "unhealthy" as const,
    error,
    health: { status: "unhealthy" as const, reason: "monitoring_failed" as const },
    checkedAt: now.toISOString(),
  };
}
