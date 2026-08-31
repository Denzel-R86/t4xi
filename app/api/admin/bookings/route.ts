import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isAuthorizedAdminRequest } from "@/lib/admin/basic-auth";
import { STATUS_EVENT, isBookingStatus, type BookingStatus } from "@/lib/bookings/lifecycle";
import { dispatch } from "@/lib/communication/orchestrator";
import { supabaseDeliveryLog } from "@/lib/communication/delivery-log";
import type { CommunicationEvent } from "@/lib/communication/events";

/**
 * Ops-acties op de boekings-lifecycle.
 *
 * De route bepaalt zelf niets over toegestane overgangen: dat doet de
 * `transition_booking_status`-RPC, zodat de regel in de database staat en geen
 * enkele client eromheen kan. Slaagt de overgang, dan publiceert deze route het
 * bijbehorende domeinevent — communicatie volgt dááruit, nooit uit de knop.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(status: number, payload: Record<string, unknown>) {
  return NextResponse.json(payload, { status, headers: NO_STORE });
}

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

export async function POST(request: Request) {
  if (!(await isAuthorizedAdminRequest(request))) return json(401, { error: "unauthorized" });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const bookingId = typeof body?.bookingId === "string" ? body.bookingId.trim() : "";
  const to = typeof body?.to === "string" ? body.to.trim() : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (!UUID_RE.test(bookingId) || !isBookingStatus(to)) {
    return json(400, { error: "invalid_input" });
  }

  const supabase = db();
  if (!supabase) return json(503, { error: "unavailable" });

  const { data, error } = await supabase.rpc("transition_booking_status", {
    p_booking_id: bookingId,
    p_to: to,
    p_actor: "ops-dashboard",
    p_reason: reason || null,
  });
  if (error) return json(500, { error: "transition_failed" });

  const result = data as { ok?: boolean; error?: string; from?: string; changed?: boolean } | null;
  if (!result?.ok) {
    const status = result?.error === "unknown_booking" ? 404 : 409;
    return json(status, { error: result?.error ?? "transition_failed", from: result?.from });
  }

  // Alleen een échte overgang levert een domeinevent op. Twee keer op dezelfde
  // knop drukken geeft `changed:false` en dus geen tweede event.
  if (result.changed) {
    await publishTransitionEvent(supabase, bookingId, to, reason);
  }

  return json(200, { ok: true, from: result.from, to, changed: result.changed === true });
}

/**
 * Best-effort: een haperende mailprovider mag een geslaagde statusovergang nooit
 * terugdraaien. De uitkomst staat in `communication_deliveries`.
 */
async function publishTransitionEvent(
  supabase: SupabaseClient,
  bookingId: string,
  to: BookingStatus,
  reason: string
): Promise<void> {
  const eventType = STATUS_EVENT[to];
  if (!eventType) return;

  const { data } = await supabase
    .from("bookings")
    .select("booking_ref")
    .eq("id", bookingId)
    .maybeSingle<{ booking_ref: string }>();
  const bookingRef = typeof data?.booking_ref === "string" ? data.booking_ref : bookingId;

  try {
    await dispatch(
      {
        type: eventType,
        subjectType: "booking",
        subjectId: bookingRef,
        bookingId,
        // Interne communicatie is Nederlands; klantcommunicatie op deze momenten
        // bestaat nog niet, dus er wordt hier niets in een taal beloofd.
        locale: "nl",
        bookingRef,
      } as CommunicationEvent,
      { log: supabaseDeliveryLog(supabase) }
    );
  } catch (e) {
    console.error(
      `[admin/bookings] communicatie na overgang naar ${to} faalde (${reason || "geen reden"}):`,
      e instanceof Error ? e.message : e
    );
  }
}
