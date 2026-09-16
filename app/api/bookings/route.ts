import { NextResponse } from "next/server";
import { createBooking } from "@/lib/bookings/create";
import { rateLimit, clientIp } from "@/lib/security/rate-limit";

/** HTTP adapter: abuse controls and JSON parsing, then the shared booking service. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Anti-spam/misbruik (Stap 9f) ─────────────────────────────────────────────
const RATE_MAX = 5; // pogingen
const RATE_WINDOW_MS = 10 * 60_000; // per 10 minuten
const MAX_BODY_BYTES = 4096; // ruime bovengrens voor een boeking-JSON
/** Verborgen veld dat bots invullen; echte formulieren sturen het niet mee. */
const HONEYPOT_FIELD = "website";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

type Body = Record<string, unknown>;

function json(status: number, payload: Record<string, unknown>) {
  return NextResponse.json(payload, { status, headers: NO_STORE_HEADERS });
}
function bad(message: string) {
  return json(400, { ok: false, error: "invalid_input", message });
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") ?? "unknown";

  // 0a. IP-only rate limiting, vóór het inlezen van de body. Elke poging telt,
  // inclusief een te grote of ongeldige body; User-Agent-rotatie kan de limiet
  // niet omzeilen. De UA wordt uitsluitend begrensd in de operationele logregel.
  const rl = rateLimit(`bookings:${ip}`, RATE_MAX, RATE_WINDOW_MS);
  if (rl.limited) {
    console.warn(`[bookings] rate-limit overschreden ip=${ip} ua="${ua.slice(0, 80)}"`);
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limited",
        message: "Te veel boekingspogingen. Probeer het over een paar minuten opnieuw, of bel ons.",
      },
      {
        status: 429,
        headers: { ...NO_STORE_HEADERS, "Retry-After": String(rl.retryAfterSec) },
      }
    );
  }

  // 0b. Payload-size guard — lees de ruwe body één keer, begrens de grootte.
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    console.warn(`[bookings] payload te groot (${rawBody.length} tekens) ip=${ip}`);
    return json(413, { ok: false, error: "payload_too_large", message: "Aanvraag te groot." });
  }

  // 1. Body parsen (uit de al gelezen tekst).
  let body: Body;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return bad("Body moet een JSON-object zijn.");
    }
    body = parsed as Body;
  } catch {
    return bad("Body is geen geldige JSON.");
  }

  // 1b. Honeypot — als het verborgen veld gevuld is, is dit vrijwel zeker een bot.
  //     Stil accepteren: neutrale success, GEEN DB-write (bot leert niets).
  const honeypot = body[HONEYPOT_FIELD];
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    console.warn(`[bookings] honeypot geraakt ip=${ip} ua="${ua.slice(0, 80)}"`);
    return json(200, {
      ok: true,
      status: "pending",
      quoteOnRequest: true,
      message: "Boeking ontvangen.",
    });
  }

  const result = await createBooking(body);
  return json(result.status, result.payload);
}
