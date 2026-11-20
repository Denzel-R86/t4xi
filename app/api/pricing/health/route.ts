import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  HealthQueryTimeoutError,
  buildDistanceTariffHealthBody,
  collectDistanceTariffCounts,
  monitoringFailedBody,
} from "@/lib/pricing/distance-tariff-health-query";

/**
 * GET /api/pricing/health
 *
 * Dagelijkse controle op het afstand-tarief (2026-11-19). Leest uitsluitend
 * TELLINGEN uit `pricing_quote_logs` (geen adressen, geen payloads) en geeft
 * 503 bij een vermoedelijke storing, zodat de geplande GitHub-workflow faalt
 * en GitHub de eigenaar mailt. Zie lib/pricing/distance-tariff-health.ts.
 *
 * Monitoring 2.0 (2026-11-21): telt ook infrastructuurstoringen (config-
 * timeouts, database onbereikbaar) apart van onbekende locaties, en geeft
 * `degraded` (200, waarschuwing) naast `unhealthy` (503). Kan de monitoring
 * zelf niet draaien (query faalt/hangt, env ontbreekt), dan altijd 503 —
 * nooit "gezond". Zie lib/pricing/distance-tariff-health-query.ts.
 *
 * Niet publiek: vereist PRICING_HEALTH_SECRET in `x-health-secret` of
 * `Authorization: Bearer <secret>`. Server-only service-role client.
 * Schrijft niets.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET(request: Request) {
  const secret = (process.env.PRICING_HEALTH_SECRET ?? "").trim();
  if (!secret) {
    return NextResponse.json(monitoringFailedBody("not_configured", new Date()), { status: 503 });
  }
  if (!secretsMatch(providedSecret(request), secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = serviceRoleClient();
  if (!supabase) {
    return NextResponse.json(monitoringFailedBody("no_service_role_client", new Date()), { status: 503 });
  }

  const now = new Date();
  try {
    const counts = await collectDistanceTariffCounts(supabase, now);
    const body = buildDistanceTariffHealthBody(counts, now);
    const health = body.health;
    return NextResponse.json(body, {
      status: health.status === "unhealthy" ? 503 : 200,
      headers: { "cache-control": "no-store" },
    });
  } catch (e) {
    const error = e instanceof HealthQueryTimeoutError ? "query_timeout" : "query_failed";
    return NextResponse.json(monitoringFailedBody(error, now), {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
}
