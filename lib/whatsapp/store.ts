import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertSupabaseNotProductionInNonProd, getAppEnv } from "@/lib/config/environment";
import type { IngressReceipt, IngressStore } from "@/lib/whatsapp/ingress";

export function supabaseIngressStore(client: Pick<SupabaseClient, "rpc">): IngressStore {
  return { async receive(scope, events) {
    const { data, error } = await client.rpc("receive_whatsapp_events", {
      p_waba_id: scope.wabaId, p_phone_number_id: scope.phoneNumberId, p_events: events,
    });
    if (error || !data || typeof data !== "object") throw new Error("whatsapp_store_unavailable");
    const keys = ["received", "stored", "ignored", "rejected", "duplicates"] as const;
    if (!keys.every(key => Number.isInteger(data[key]) && data[key] >= 0)
      || data.received !== events.length
      || data.stored + data.ignored + data.rejected + data.duplicates !== events.length) {
      throw new Error("whatsapp_invalid_receipt");
    }
    return data as IngressReceipt;
  } };
}

/** Lazy, server-side only. Never permits a development handler to mutate production. */
export function configuredIngressStore(): IngressStore | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  assertSupabaseNotProductionInNonProd(getAppEnv(), url);
  return supabaseIngressStore(createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}
