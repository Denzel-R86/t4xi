import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * Server-side Supabase clients voor de pricing engine.
 *
 * Twee gescheiden clients met verschillende privileges:
 *
 *  1. createPricingReadClient()  — ANON key. Leest de publieke pricing-tabellen
 *     (cities, locations, vehicle_classes, fixed_route_prices, ...). RLS staat
 *     `select` op active-rijen toe, dus de anon key is voldoende én veilig.
 *
 *  2. createPricingLogClient()   — SERVICE ROLE key. UITSLUITEND bedoeld voor
 *     het wegschrijven van audit-/analyticsregels naar pricing_quote_logs
 *     (RLS aan, geen policies → alleen service_role). Nooit client-side gebruiken.
 *
 * Benodigde environment variables (server, niet in de browser bundelen):
 *   NEXT_PUBLIC_SUPABASE_URL         (bestaand)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY    (bestaand)
 *   SUPABASE_SERVICE_ROLE_KEY        (NIEUW — alleen server; log-writes)
 */

export type PricingSupabaseClient = SupabaseClient<Database>;

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
} as const;

/** True als tenminste een read-client geconfigureerd kan worden. */
export function hasPricingReadConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/** True als de service-role client (log-writes) geconfigureerd kan worden. */
export function hasPricingLogConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Publieke read-client voor de pricing-referentiedata. Retourneert null als de
 * configuratie ontbreekt, zodat de aanroeper netjes kan degraderen (in v1:
 * "offerte op aanvraag") in plaats van te crashen.
 */
export function createPricingReadClient(): PricingSupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient<Database>(url, anonKey, clientOptions);
}

/**
 * Service-role client — UITSLUITEND voor inserts in pricing_quote_logs.
 * Retourneert null als de service-role key ontbreekt (loggen wordt dan een
 * stille no-op; de prijsofferte zelf blijft werken).
 */
export function createPricingLogClient(): PricingSupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient<Database>(url, serviceKey, clientOptions);
}
