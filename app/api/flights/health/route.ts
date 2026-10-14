import { NextResponse } from "next/server";
import { checkSchipholHealth } from "@/lib/schiphol/service";
import { cachedSchipholHealth } from "@/lib/schiphol/health-cache";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";

/**
 * GET /api/flights/health
 *
 * Health-check van de Schiphol-integratie: is de credential-configuratie aanwezig
 * en accepteert de upstream ze? Doet één minimale opvraag en rapporteert een
 * status zonder ooit sleutels te lekken.
 *
 * F-41: rate limit per IP en het resultaat 60 s in-memory gecachet, zodat
 * aanroepen het Schiphol-quotum niet onbeperkt verbruiken. Beide per warme
 * instance (F-37 / besluit B6).
 *
 * Statuscodes: 200 (ok), 503 (not_configured / unreachable), 502 (unauthorized),
 * 429 (rate limit).
 * Statisch pad — wint in Next.js van /api/flights/[flightNumber].
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_MAX = 6; // aanroepen
const RATE_WINDOW_MS = 60_000; // per minuut per IP

export async function GET(request: Request) {
  const ip = clientIp(request);
  const rl = rateLimit(`flights-health:${ip}`, RATE_MAX, RATE_WINDOW_MS);
  if (rl.limited) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", message: "Te veel aanvragen. Probeer het zo opnieuw." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  const health = await cachedSchipholHealth(() => checkSchipholHealth());
  const httpStatus =
    health.status === "ok" ? 200 : health.status === "unauthorized" ? 502 : 503;
  return NextResponse.json(health, { status: httpStatus });
}
