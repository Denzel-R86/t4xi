import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_STALE_AFTER_DAYS,
  evaluateDistanceTariffHealth,
} from "@/lib/pricing/distance-tariff-health";

/**
 * GET /api/pricing/health
 *
 * Dagelijkse controle op het afstand-tarief (2026-11-19). Leest uitsluitend
 * TELLINGEN uit `pricing_quote_logs` (geen adressen, geen payloads) en geeft
 * 503 bij een vermoedelijke storing, zodat de geplande GitHub-workflow faalt
 * en GitHub de eigenaar mailt. Zie lib/pricing/distance-tariff-health.ts.
 *
 * Niet publiek: vereist PRICING_HEALTH_SECRET in `x-health-secret` of
 * `Authorization: Bearer <secret>`. Server-only service-role client.
 * Schrijft niets.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function serviceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function providedSecret(request: Request): string {
  const header = request.headers.get("x-health-secret");
  if (header) return header.trim();
  const auth = request.headers.get("authorization") ?? "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

function secretsMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

async function count(
  query: PromiseLike<{ count: number | null; error: unknown }>
): Promise<number> {
  const { count: n, error } = await query;
  if (error) throw error;
  return n ?? 0;
}

export async function GET(request: Request) {
  const secret = (process.env.PRICING_HEALTH_SECRET ?? "").trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  if (!secretsMatch(providedSecret(request), secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = serviceRoleClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "no_service_role_client" }, { status: 503 });
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_MS).toISOString();
  const staleStart = new Date(now.getTime() - DEFAULT_STALE_AFTER_DAYS * DAY_MS).toISOString();
  const logs = () => supabase.from("pricing_quote_logs").select("id", { count: "exact", head: true });

  try {
    // Missers = aanvragen die een afstandsprijs nodig hadden en er geen kregen.
    // `outside_service_area` / `beyond_max_approach` tellen bewust NIET mee:
    // dat is beleid, geen storing.
    const [successesInWindow, routingFailuresInWindow, unresolvedMisses, routingMisses, last] = await Promise.all([
      count(logs().gte("created_at", windowStart).eq("price_source", "distance_tariff").is("error_code", null)),
      count(logs().gte("created_at", windowStart).like("error_code", "routing_unavailable:%")),
      count(logs().gte("created_at", staleStart).in("error_code", ["unknown_location", "route_not_fixed"])),
      count(logs().gte("created_at", staleStart).like("error_code", "routing_unavailable:%")),
      supabase
        .from("pricing_quote_logs")
        .select("created_at")
        .eq("price_source", "distance_tariff")
        .is("error_code", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (last.error) throw last.error;
    const missesInStalePeriod = unresolvedMisses + routingMisses;

    const lastSuccessAt = last.data?.created_at ? new Date(last.data.created_at as string) : null;
    const health = evaluateDistanceTariffHealth(
      { successesInWindow, routingFailuresInWindow, missesInStalePeriod, lastSuccessAt },
      { now }
    );

    return NextResponse.json(
      {
        ok: health.status !== "unhealthy",
        health,
        counts: { successesInWindow, routingFailuresInWindow, missesInStalePeriod },
        lastSuccessAt: lastSuccessAt?.toISOString() ?? null,
        checkedAt: now.toISOString(),
      },
      { status: health.status === "unhealthy" ? 503 : 200, headers: { "cache-control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 503 });
  }
}
