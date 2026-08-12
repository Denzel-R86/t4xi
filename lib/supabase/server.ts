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
 *  2. createPricingLogClient()   — SERVICE ROLE key. UITSLUITEND voor tabellen
 *     die RLS-aan-geen-policies (dus alleen service_role) hebben: het
 *     wegschrijven van audit-/analyticsregels naar pricing_quote_logs, én het
 *     lezen van de deadhead-shadow-configtabellen (pricing_deadhead_config,
 *     pricing_high_demand_zones) — die hebben bewust geen publieke policy, dus
 *     de anon-key read-client hierboven ziet daar altijd 0 rijen. Nooit voor de
 *     publieke referentietabellen (cities/locations/...) en nooit client-side
 *     gebruiken.
 *
 * Benodigde environment variables (server, niet in de browser bundelen):
 *   NEXT_PUBLIC_SUPABASE_URL         (bestaand)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY    (bestaand)
 *   SUPABASE_SERVICE_ROLE_KEY        (NIEUW — alleen server; log-writes)
 */

export type PricingSupabaseClient = SupabaseClient<Database>;

/**
 * Fetch die Next's Data Cache overslaat.
 *
 * Next patcht global fetch in server components en cachet GET-responses. Dat
 * gold ook voor de Supabase-reads: op 2026-07-19 stonden er twaalf routes
 * actief in de database terwijl /tarieven ze niet toonde, en bleef de pagina
 * na een prijswijziging oude bedragen serveren. `export const dynamic =
 * "force-dynamic"` op de pagina loste dat NIET op — dat maakt de route
 * dynamisch, maar laat de gecachete fetch-response intact.
 *
 * Prijsdata mag nooit uit een cache komen: de tarievenpagina en de quote-engine
 * moeten hetzelfde bedrag tonen, anders ziet een klant €85 en betaalt hij €105.
 */
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store" });

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: noStoreFetch },
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
 * Service-role client — uitsluitend voor tabellen die alleen via service_role
 * leesbaar/schrijfbaar zijn (RLS aan, geen policies): inserts in
 * pricing_quote_logs, en reads van pricing_deadhead_config/
 * pricing_high_demand_zones. Retourneert null als de service-role key
 * ontbreekt — de aanroeper degradeert dan stil (loggen wordt een no-op,
 * shadow-berekening wordt overgeslagen); de prijsofferte zelf blijft altijd
 * werken.
 */
export function createPricingLogClient(): PricingSupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient<Database>(url, serviceKey, clientOptions);
}
