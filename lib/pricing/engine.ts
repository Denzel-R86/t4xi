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
import { buildPriceSnapshot, uuidv7, type PriceSnapshot } from "@/lib/pricing/snapshot";

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
   * Contract-marker. Blijft `"legacy-passthrough"` zolang de QUOTE de bindende
   * uitkomst is (booking/Stripe lezen `quote`). Klapt naar `"v2"` zodra de snapshot
   * bindend wordt (booking/Stripe lezen de snapshot — PR 7.6.3D/E). In 7.6.3C wordt
   * de snapshot alleen aanvullend geproduceerd/opgeslagen; de quote blijft leidend.
   */
  readonly contractVersion: "legacy-passthrough";
  /**
   * NIEUW (PR 7.6.3C, ADDITIEF) — de bijbehorende immutable prijs-snapshot, of
   * `null` als de quote niet beschikbaar is of de bron niet mapbaar is. Verandert
   * niets aan `quote`; bestaande consumers lezen uitsluitend `quote`.
   */
  readonly snapshot: PriceSnapshot | null;
};

/**
 * Testbaarheid: de onderliggende quote-bron is injecteerbaar. Default is de echte
 * `getPricingQuote`. Zo kan de pass-through-equivalentie bewezen worden zonder DB.
 */
export type CalculateBookingPriceDeps = {
  getQuote?: (input: BookingPriceInput) => Promise<PricingQuoteResult>;
  /** Injecteerbaar voor deterministische tests; default = huidige tijd. */
  now?: () => Date;
  /** Injecteerbaar voor deterministische tests; default = server-side UUID v7. */
  generateQuoteId?: () => string;
};

/**
 * De centrale prijsfunctie. De `quote` blijft een PURE PASS-THROUGH om
 * `getPricingQuote()` — bedrag, currency, afronding, vaste-routekeuze,
 * fallback-status en foutredenen ongewijzigd. ADDITIEF (PR 7.6.3C) wordt bij een
 * beschikbare quote ook een immutable `snapshot` geproduceerd (server-side
 * gegenereerde `quoteId`, één vast `now`-moment). De snapshot verandert `quote`
 * niet en wordt hier NIET opgeslagen; opslag + teruggave van `quoteId` gebeurt in
 * de preview-route (/api/pricing/quote).
 */
export async function calculateBookingPrice(
  input: BookingPriceInput,
  deps: CalculateBookingPriceDeps = {}
): Promise<BookingPriceResult> {
  const getQuote = deps.getQuote ?? getPricingQuote;
  const quote = await getQuote(input);
  const snapshot = quote.available
    ? buildPriceSnapshot(quote, {
        quoteId: (deps.generateQuoteId ?? uuidv7)(),
        now: (deps.now ?? (() => new Date()))(),
      })
    : null;
  return { quote, contractVersion: "legacy-passthrough", snapshot };
}
