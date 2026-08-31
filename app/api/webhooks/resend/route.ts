import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { deliveryStatusFor, verifyResendSignature } from "@/lib/communication/webhook-signature";

/**
 * POST /api/webhooks/resend
 *
 * Zet afleverstatussen van de mailprovider terug in `communication_deliveries`:
 * delivered, bounced en complained. Daarmee is er voor het eerst zicht op wat er
 * ná het verzenden gebeurt — een bounce op een boekingsbevestiging betekent dat
 * de klant niets weet.
 *
 * Server-only, ongecachet. Vereist `RESEND_WEBHOOK_SECRET`; zonder die waarde
 * weigert het endpoint alles, zodat niemand statussen kan verzinnen.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serviceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  const body = await request.text();
  const verification = verifyResendSignature({
    secret: process.env.RESEND_WEBHOOK_SECRET,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
    body,
  });

  if (!verification.ok) {
    const status = verification.reason === "not_configured" ? 503 : 401;
    return NextResponse.json({ ok: false, error: verification.reason }, { status });
  }

  type ResendEvent = { type?: unknown; data?: { email_id?: unknown } };
  let payload: ResendEvent | null;
  try {
    payload = JSON.parse(body) as ResendEvent;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const status = typeof payload?.type === "string" ? deliveryStatusFor(payload.type) : null;
  const messageId = typeof payload?.data?.email_id === "string" ? payload.data.email_id : null;
  // Onbekende of niet-relevante events zijn geen fout: 200 voorkomt dat de
  // provider blijft herhalen op iets wat we bewust negeren.
  if (!status || !messageId) return NextResponse.json({ ok: true, ignored: true });

  const supabase = serviceRoleClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });

  const { data, error } = await supabase.rpc("record_communication_provider_event", {
    p_provider_message_id: messageId,
    p_status: status,
  });
  if (error) {
    console.error("[resend-webhook] vastleggen mislukt:", error.message);
    return NextResponse.json({ ok: false, error: "record_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, result: data });
}
