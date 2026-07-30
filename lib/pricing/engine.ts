// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY module. Importeert de pricing-service (die server-side Supabase
// leest); nooit in een client component importeren. Dit volgt dezelfde conventie
// als lib/pricing/service.ts — de idiomatische `server-only`-package is in deze
// codebase bewust (nog) niet toegevoegd; zie docs/architecture/booking-price-contract.md.
// ─────────────────────────────────────────────────────────────────────────────
import {
  getPricingQuote,
  type PricingQuoteInput,
  type PricingQuoteResult,
} from "@/lib/pricing/service";

/**
 * DE centrale, server-side entrypoint voor een klantprijs (Sprint 7.6 — PR 7.6.2).
 *
 * In deze PR is dit een PURE PASS-THROUGH om `getPricingQuote()`. De bindende
 * financiële uitkomst is exact `quote` (bron van waarheid: `fixed_route_prices`).
 * Er wordt GEEN nieuwe berekening, afronding, currency, fallback-status of toeslag
 * geïntroduceerd. Zowel `/api/pricing/quote` als de server-side booking-creatie
 * gebruiken deze functie, zodat er precies één runtime-entrypoint voor prijzen is.
 *
 * Het contract is bewust voorbereid op V2 (persistente breakdown, pricingVersion,
 * quote-identifier, route-snapshot, adjustments, tussenstops) — zie
 * docs/architecture/booking-price-contract.md — maar die velden worden hier NOG
 * NIET gevuld. Geen fictieve waarden of lege financiële regels die productiegedrag
 * beïnvloeden: het bedrag is en blijft dat van `getPricingQuote()`.
 */

/** Input-contract — identiek aan de bestaande pricing-input (geen nieuwe velden). */
export type BookingPriceInput = PricingQuoteInput;

export type BookingPriceResult = {
  /**
   * LEGACY / PASS-THROUGH — vandaag de bindende financiële uitkomst, exact zoals
   * `getPricingQuote()` hem teruggeeft (available/price/singlePrice/returnPrice/
   * returnApplied/currency/vatRate/airport/reason/…). Alle consumers lezen dit veld.
   */
  readonly quote: PricingQuoteResult;
  /**
   * Contract-marker. Blijft `"legacy-passthrough"` tot PR 7.6.3 de persistente
   * breakdown + pricingVersion introduceert; dan volgt bv. `"v2"`.
   */
  readonly contractVersion: "legacy-passthrough";
};

/**
 * Testbaarheid: de onderliggende quote-bron is injecteerbaar. Default is de echte
 * `getPricingQuote`. Zo kan de pass-through-equivalentie bewezen worden zonder DB.
 */
export type CalculateBookingPriceDeps = {
  getQuote?: (input: BookingPriceInput) => Promise<PricingQuoteResult>;
};

/**
 * De centrale prijsfunctie. Pass-through: retourneert exact de `getPricingQuote()`-
 * uitkomst onder `quote`. Verandert niets aan bedrag, currency, afronding,
 * vaste-routekeuze, fallback-status of foutredenen.
 */
export async function calculateBookingPrice(
  input: BookingPriceInput,
  deps: CalculateBookingPriceDeps = {}
): Promise<BookingPriceResult> {
  const getQuote = deps.getQuote ?? getPricingQuote;
  const quote = await getQuote(input);
  return { quote, contractVersion: "legacy-passthrough" };
}
