import { NextRequest, NextResponse } from "next/server";

/**
 * Google Places API (New) fallback — server-side only.
 * Key blijft op de server (GOOGLE_PLACES_API_KEY, geen NEXT_PUBLIC).
 *
 * Hardening (audit 2026-07-05):
 * - inputvalidatie: 3–120 tekens, control chars gestript
 * - rate limiting: 30 requests/min per IP (in-memory token bucket)
 *
 * LET OP (serverless): de in-memory limiter geldt per warme instance.
 * Op Vercel/Netlify met meerdere instances is het een dempende laag,
 * geen harde garantie. Voor een harde limiet: Upstash Redis of de
 * platform-eigen rate limiting — zie eindrapport, "openstaande risico's".
 */

const RATE_LIMIT = 30;          // requests
const WINDOW_MS = 60_000;       // per minuut
const MAX_QUERY_LENGTH = 120;

const buckets = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(ip);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  if (buckets.size > 10_000) buckets.clear(); // memory guard
  return bucket.count > RATE_LIMIT;
}

function sanitizeQuery(raw: string): string | null {
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (cleaned.length < 3 || cleaned.length > MAX_QUERY_LENGTH) return null;
  return cleaned;
}

export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Te veel verzoeken. Probeer het over een minuut opnieuw." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const q = sanitizeQuery(req.nextUrl.searchParams.get("q") ?? "");
  if (!q) return NextResponse.json([], { status: 200 });

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    // Fallback niet geconfigureerd — PDOK blijft primary
    return NextResponse.json([], { status: 200 });
  }

  try {
    const res = await fetch(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
        },
        body: JSON.stringify({
          input: q,
          languageCode: "nl",
          regionCode: "NL",
        }),
        cache: "no-store",
      }
    );

    if (!res.ok) return NextResponse.json([], { status: 200 });

    const data = await res.json();
    const suggestions = (data.suggestions ?? [])
      .slice(0, 6)
      .map((s: { placePrediction?: { placeId?: string; text?: { text?: string } } }) => ({
        id: s.placePrediction?.placeId ?? crypto.randomUUID(),
        label: s.placePrediction?.text?.text ?? "",
        source: "google" as const,
      }))
      .filter((s: { label: string }) => s.label);

    return NextResponse.json(suggestions);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
