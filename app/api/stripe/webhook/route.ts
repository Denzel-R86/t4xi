import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getStripeServer, isStripeConfigured } from "@/lib/payments/stripe";
import { handleStripeEvent } from "@/lib/payments/webhook";

/**
 * POST /api/stripe/webhook  (stap 7.4)
 *
 * Server-side only. Verwerkt Stripe payment_intent-events NA signature-verificatie.
 * De booking-payment-status wordt uitsluitend hier server-side gezet; client-side
 * `confirmPayment` blijft geen autoriteit.
 *
 * Vereisten:
 *   · RAW body (geen JSON-parsing vooraf, anders breekt de signature);
 *   · `stripe-signature` header + STRIPE_WEBHOOK_SECRET;
 *   · `stripe.webhooks.constructEvent(...)` VÓÓR enige verwerking;
 *   · idempotent + guarded transitions via de RPC (paid is terminaal).
 *
 * Responses: 200 verwerkt/genegeerd/duplicate · 400 ongeldige/ontbrekende
 * signature · 500 transient interne fout (Stripe retryt).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serviceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !isStripeConfigured()) {
    console.error("[stripe-webhook] niet geconfigureerd (secret of Stripe key ontbreekt).");
    return NextResponse.json({ error: "unconfigured" }, { status: 500 });
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  // RAW body — verplicht voor signature-verificatie.
  const rawBody = await request.text();

  const stripe = getStripeServer();
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch {
    // Ongeldige signature: nooit verwerken, geen details lekken.
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const supabase = serviceRoleClient();
  if (!supabase) {
    console.error("[stripe-webhook] Supabase service-role ontbreekt — transient, laat Stripe retryen.");
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }

  try {
    const result = await handleStripeEvent(event, async (args) => {
      const { data, error } = await supabase.rpc("process_stripe_payment_event", {
        p_event_id: args.eventId,
        p_event_type: args.eventType,
        p_payment_intent_id: args.paymentIntentId,
        p_new_status: args.newStatus,
        p_amount_received_cents: args.amountReceivedCents,
        p_currency: args.currency,
      });
      if (error) throw new Error(`process_stripe_payment_event: ${error.message}`);
      return typeof data === "string" ? data : "ok";
    });

    // Alleen veilige, PII-vrije operationele info loggen.
    if (result.handled) {
      console.info(`[stripe-webhook] ${event.type} → ${result.outcome}`);
    }
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (e) {
    // Transiente interne fout → 500 zodat Stripe het opnieuw aanbiedt. Geen secrets/payload.
    console.error(`[stripe-webhook] verwerkingsfout: ${e instanceof Error ? e.message : "onbekend"}`);
    return NextResponse.json({ error: "processing_error" }, { status: 500 });
  }
}
