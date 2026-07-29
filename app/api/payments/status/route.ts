import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseBookingIdParam, shapeStatusResponse, type BookingStatusRow } from "@/lib/payments/status";
import { rateLimit, clientIp } from "@/lib/security/rate-limit";

/**
 * GET /api/payments/status?bookingId=<uuid>  (stap 7.5)
 *
 * Server-side betaalstatus voor client-reconciliation na confirmPayment. Leest
 * uitsluitend niet-PII statusvelden op basis van het interne booking_id (UUID,
 * capability). De client-side confirmPayment blijft geen autoriteit — alleen
 * deze server-status (gezet door de webhook) telt.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ruime limiet: de client pollt elke ~2,5s gedurende maximaal ~60s.
const RATE_MAX = 60;
const RATE_WINDOW_MS = 60_000;

function serviceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: Request) {
  const ip = clientIp(request);
  const rl = rateLimit(`payment-status:${ip}`, RATE_MAX, RATE_WINDOW_MS);
  if (rl.limited) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  const bookingId = parseBookingIdParam(new URL(request.url).searchParams.get("bookingId"));
  if (!bookingId) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const supabase = serviceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const { data: row, error } = await supabase
    .from("bookings")
    .select("payment_status, amount_due_cents, amount_paid_cents, payment_currency, paid_at")
    .eq("id", bookingId)
    .maybeSingle();

  if (error) {
    console.error(`[payment-status] lookup faalde: ${error.message}`);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  if (!row) {
    // Onbekend/verkeerd UUID → generieke 404, geen data-lek.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(shapeStatusResponse(row as BookingStatusRow), { status: 200 });
}
