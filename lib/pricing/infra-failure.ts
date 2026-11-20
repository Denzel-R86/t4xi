/**
 * Infrastructuurstoring in het quotepad (Monitoring 2.0, 2026-11-21) — INTERN.
 *
 * Aanleiding: wanneer de configuratie van het aanrijmodel (Supabase) of de
 * PDOK-gemeentelookup faalde of timede, gaf resolvePickupApproach
 * `config_or_routing_unavailable`, en viel de offerte daarna terug op
 * `unknown_location` (vrij adres) of `route_not_fixed` (bekende locaties).
 * Een configuratie-timeout zag er in `pricing_quote_logs` dus precies zo uit
 * als een legitieme aanvraag die we niet kunnen prijzen — en de health-check
 * kon het verschil niet zien.
 *
 * Deze module tagt zulke storingen APART, zonder het publieke contract of de
 * `reason`/`error_code` te veranderen: het label komt uitsluitend in
 * `pricing_quote_logs.price_breakdown.infraFailure` (bestaande jsonb-kolom,
 * geen migratie). Het label bevat nooit adressen, foutteksten of sleutels —
 * alleen een vaste stap + categorie.
 */

/** Waar in het quotepad de storing optrad. */
export type InfraFailureStage =
  /** Aanrijmodel-config / standplaatsen / servicegebieden (Supabase, service-role). */
  | "pickup_approach_config"
  /** PDOK-gemeentelookup voor de pickup (extern). */
  | "pickup_gemeente_lookup"
  /** Deadhead-zoneconfig (Supabase) voor een mogelijk Eindhoven/Roermond-bestemming. */
  | "deadhead_zone_config"
  /** PDOK-woonplaatslookup voor een mogelijk Eindhoven/Roermond-bestemming. */
  | "deadhead_zone_lookup";

export type InfraFailureCategory =
  /** Ook na de ene retry over het tijdsbudget. */
  | "timeout"
  /** Query/lookup gaf een fout terug. */
  | "load_error"
  /** SUPABASE_SERVICE_ROLE_KEY ontbreekt in de runtime. */
  | "no_service_role_client"
  /** Config-tabel leeg of inconsistent (bv. standplaats ontbreekt). */
  | "missing_config";

export type InfraFailureLogEntry = { stage: InfraFailureStage; category: InfraFailureCategory };

/**
 * Koppelt een (niet-beschikbaar) quoteresultaat aan zijn infrastructuurstoring,
 * zodat logQuote het label kan wegschrijven zonder dat de bestaande
 * signaturen van resolveQuote/getPricingQuote/logQuote veranderen. WeakMap:
 * geen geheugenlek, niet zichtbaar in het resultaatobject (en dus nooit in de
 * publieke response).
 */
const byResult = new WeakMap<object, InfraFailureLogEntry>();

export function noteInfraFailure(result: object, entry: InfraFailureLogEntry): void {
  byResult.set(result, { stage: entry.stage, category: entry.category });
}

export function infraFailureFor(result: object): InfraFailureLogEntry | null {
  return byResult.get(result) ?? null;
}
