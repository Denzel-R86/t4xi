import { NextResponse } from "next/server";
import { checkSchipholHealth } from "@/lib/schiphol/service";

/**
 * GET /api/flights/health
 *
 * Health-check van de Schiphol-integratie: is de credential-configuratie aanwezig
 * en accepteert de upstream ze? Doet één minimale opvraag en rapporteert een
 * status zonder ooit sleutels te lekken.
 *
 * Statuscodes: 200 (ok), 503 (not_configured / unreachable), 502 (unauthorized).
 * Statisch pad — wint in Next.js van /api/flights/[flightNumber].
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const health = await checkSchipholHealth();
  const httpStatus =
    health.status === "ok" ? 200 : health.status === "unauthorized" ? 502 : 503;
  return NextResponse.json(health, { status: httpStatus });
}
