import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { formatCspViolation, parseCspReports } from "@/lib/security/csp-report";

/**
 * Ontvanger voor `report-uri` van de report-only CSP (S1, lib/security/csp.ts).
 * Same-origin, geen externe dienst, geen opslag: één PII-vrije logregel per
 * violation (zie lib/security/csp-report.ts), zichtbaar in de Vercel-functielogs.
 *
 * Publiek en dus onbetrouwbaar: begrensd per IP én per instance, body-limiet
 * vóór en na inlezen, alleen CSP-rapport-content-types. Antwoord is altijd leeg.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8_000;
const RATE_MAX = 30;
const RATE_WINDOW_MS = 60_000;
/** Plafond per warme instance tegen log-flooding vanaf veel IP's. */
const GLOBAL_RATE_MAX = 300;
const CONTENT_TYPES = ["application/csp-report", "application/reports+json", "application/json"];

function empty(status: number): NextResponse {
  return new NextResponse(null, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  // Het IP is alleen de limietsleutel; het wordt nergens gelogd.
  if (rateLimit(`csp-report:${ip}`, RATE_MAX, RATE_WINDOW_MS).limited) return empty(429);
  if (rateLimit("csp-report:global", GLOBAL_RATE_MAX, RATE_WINDOW_MS).limited) return empty(429);

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!CONTENT_TYPES.includes(contentType)) return empty(415);

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return empty(413);
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return empty(413);

  for (const violation of parseCspReports(rawBody)) {
    console.warn(formatCspViolation(violation));
  }
  return empty(204);
}
