import { NextResponse } from "next/server";
import { getFlightStatus, type GetFlightOptions } from "@/lib/schiphol/service";
import type { FlightLookupResult } from "@/lib/schiphol/types";
import { rateLimit, clientIp } from "@/lib/security/rate-limit";

/**
 * GET /api/flights/[flightNumber]
 *
 * Server-side proxy op de Schiphol Public Flight API. Valideert het vluchtnummer,
 * haalt de status op via de centrale service (lib/schiphol/service.ts) en geeft de
 * GENORMALISEERDE vlucht terug. De Schiphol-credentials blijven server-side; ze
 * verlaten deze route nooit.
 *
 * Optionele query:
 *   ?date=YYYY-MM-DD           filter op datum
 *   ?direction=arrival|departure
 *
 * Deze foundation heeft GEEN booking-, pricing- of UI-koppeling.
 *
 * NB: het statische pad /api/flights/health wint in Next.js van deze dynamische
 * route, dus "health" komt hier nooit binnen als vluchtnummer.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RATE_MAX = 30; // opvragingen
const RATE_WINDOW_MS = 60_000; // per minuut — dempt misbruik van het upstream-quotum

function json(status: number, payload: Record<string, unknown>) {
  return NextResponse.json(payload, { status });
}

/** Mapt de service-uitkomst op HTTP zonder interne details te lekken. */
function respond(result: FlightLookupResult) {
  switch (result.status) {
    case "ok":
      return json(200, { ok: true, flight: result.flight, matches: result.matches });
    case "invalid_input":
      return json(400, { ok: false, error: "invalid_input", message: result.message });
    case "not_found":
      return json(404, { ok: false, error: "not_found", message: "Geen vlucht gevonden." });
    case "not_configured":
      return json(503, {
        ok: false,
        error: "not_configured",
        message: "Vluchtinformatie is tijdelijk niet beschikbaar.",
      });
    case "unauthorized":
      return json(502, { ok: false, error: "upstream_unauthorized", message: "Vluchtbron weigerde de aanvraag." });
    case "upstream_error":
      return json(502, {
        ok: false,
        error: "upstream_error",
        message: "Vluchtbron is tijdelijk niet bereikbaar.",
        upstreamStatus: result.upstreamStatus,
      });
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ flightNumber: string }> }
) {
  const { flightNumber } = await params;
  const ip = clientIp(request);
  const rl = rateLimit(`flights:${ip}`, RATE_MAX, RATE_WINDOW_MS);
  if (rl.limited) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", message: "Te veel aanvragen. Probeer het zo opnieuw." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  const url = new URL(request.url);
  const date = (url.searchParams.get("date") ?? "").trim();
  const directionParam = (url.searchParams.get("direction") ?? "").trim().toLowerCase();

  const options: GetFlightOptions = {};
  if (date !== "") {
    if (!DATE_RE.test(date)) {
      return json(400, { ok: false, error: "invalid_input", message: "Ongeldige datum (YYYY-MM-DD)." });
    }
    options.scheduleDate = date;
  }
  if (directionParam !== "") {
    if (directionParam !== "arrival" && directionParam !== "departure") {
      return json(400, {
        ok: false,
        error: "invalid_input",
        message: "Ongeldige richting (arrival of departure).",
      });
    }
    options.direction = directionParam;
  }

  const result = await getFlightStatus(flightNumber, options);
  return respond(result);
}
