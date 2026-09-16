import { NextResponse } from "next/server";
import { quoteTrip } from "@/lib/pricing/quote";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RequestBody = Record<string, unknown>;
const PRIVATE_NO_STORE = "private, no-store, max-age=0";
const RATE_MAX = 20;
const RATE_WINDOW_MS = 60_000;
const MAX_BODY_BYTES = 8_000;
function json(
  status: number,
  payload: Record<string, unknown>,
  extraHeaders?: Record<string, string>
) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": PRIVATE_NO_STORE, ...extraHeaders },
  });
}

/** 400 — malformed/onvolledige request (geen offertepoging). */
function badRequest(message: string) {
  return json(400, { available: false, error: "invalid_input", message });
}

export async function POST(request: Request) {
  // 0. Elke poging telt, ook malformed/ongeldige input: zo kan een caller de
  // limiter niet omzeilen terwijl die dure aanvragen voorbereidt.
  const ip = clientIp(request);
  const limit = rateLimit(`pricing-quote:${ip}`, RATE_MAX, RATE_WINDOW_MS);
  if (limit.limited) {
    return json(
      429,
      {
        available: false,
        error: "rate_limited",
        message: "Te veel prijsaanvragen. Probeer het over een minuut opnieuw.",
      },
      { "Retry-After": String(limit.retryAfterSec) }
    );
  }

  // 1. Body begrenzen en parsen. Ook binnen de toegestane 20 verzoeken mag een
  // caller geen onbeperkte JSON/adresstrings laten verwerken of loggen.
  let body: RequestBody;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return json(413, {
        available: false,
        error: "payload_too_large",
        message: "Prijsaanvraag is te groot.",
      });
    }
    const parsed = JSON.parse(rawBody) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return badRequest("Body moet een JSON-object zijn.");
    }
    body = parsed as RequestBody;
  } catch {
    return badRequest("Body is geen geldige JSON.");
  }

  const result = await quoteTrip(body);
  return json(result.status, result.payload);
}
