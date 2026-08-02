import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { pollActiveFlightsWithSupabase } from "@/lib/flight-monitoring/service";

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

export async function POST(request: Request) {
  const secret = (process.env.FLIGHT_MONITOR_SECRET ?? "").trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "not_configured", message: "Monitoring is niet geconfigureerd." },
      { status: 503 }
    );
  }
  if (providedSecret(request) !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = serviceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "unavailable", message: "Database is tijdelijk niet beschikbaar." },
      { status: 503 }
    );
  }

  const summary = await pollActiveFlightsWithSupabase(supabase);
  const httpStatus = summary.aborted ? 502 : 200;
  return NextResponse.json({ ok: !summary.aborted, ...summary }, { status: httpStatus });
}
