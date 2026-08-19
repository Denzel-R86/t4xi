// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY module. Importeert de pricing-service (die server-side Supabase
// leest); nooit in een client component importeren. Dit volgt dezelfde conventie
// als lib/pricing/service.ts — de idiomatische `server-only`-package is in deze
// codebase bewust (nog) niet toegevoegd; zie docs/architecture/booking-price-contract.md.
// ─────────────────────────────────────────────────────────────────────────────
import {
  getPricingQuote,
  quoteFingerprint,
  type AirportContext,
  type PricingQuoteInput,
  type PricingQuoteResult,
} from "@/lib/pricing/service";
import {
  buildPriceSnapshot,
  checkSnapshotUsable,
  nightSurchargeCents,
  uuidv7,
  type PriceSnapshot,
  type StoredSnapshot,
} from "@/lib/pricing/snapshot";
import { isNightTariff } from "@/lib/pricing/departure-time";

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
        // Ophaaltijden meegeven zodat het nachttarief (+15% 23:00–06:00) PER RITDEEL
        // als adjustment in de snapshot komt. Afwezig → geen toeslag (basisprijs).
        ...(input.departureAt !== undefined ? { departureAt: input.departureAt } : {}),
        ...(input.returnDepartureAt !== undefined ? { returnDepartureAt: input.returnDepartureAt } : {}),
      })
    : null;
  return { quote, contractVersion: "legacy-passthrough", snapshot };
}

// ── Booking-prijs met quote-lock (PR 12 — dynamische prijs-lock) ─────────────

/** Wat de booking-route nodig heeft om de bindende prijs te bepalen. */
export type BookingPriceRequest = {
  pickup: string;
  dropoff: string;
  vehicleClass?: string;
  returnTrip: boolean;
  passengers: number;
  departureAt?: string;
  /** Vertrek van de retourrit (ISO); bepaalt het nachttarief van het retour-ritdeel. */
  returnDepartureAt?: string;
  /** Quote-lock id uit de getoonde prijs; leeg/afwezig → geen lock. */
  quoteId?: string | null;
};

export type BookingPriceDeps = {
  now: Date;
  /** Leest de opgeslagen snapshot (niet-destructief). */
  readSnapshot: (quoteId: string) => Promise<StoredSnapshot | null>;
  /**
   * Berekent een quote ZONDER routing (allowDistanceTariff:false) voor het
   * no-quoteId-pad. Injecteerbaar voor tests; default = calculateBookingPrice.
   */
  computeQuote?: (input: BookingPriceInput) => Promise<PricingQuoteResult>;
};

/**
 * Uitkomst van de bindende prijsbepaling. `priced` bevat het te boeken bedrag;
 * `on_request` = offerte op aanvraag (geen bindende prijs); `error` = harde,
 * klantzichtbare validatiefout (verlopen/mismatch/ongeldig/onbekend).
 */
export type BookingPriceOutcome =
  | {
      kind: "priced";
      priceEuros: number;
      currency: "EUR";
      returnApplied: boolean;
      airport: AirportContext;
      pricingSource: string;
      /** Te consumeren na alle overige validatie (idempotency); null = geen lock. */
      lockedQuoteId: string | null;
    }
  | { kind: "on_request"; airport: AirportContext }
  | { kind: "error"; status: number; error: string; message: string };

/**
 * Bepaalt de bindende boekingsprijs. Twee paden:
 *
 *  a) quoteId aanwezig → QUOTE-LOCK: lees de server-side snapshot, valideer
 *     (bestaat / niet verlopen / geldige bron / vingerafdruk matcht de aanvraag) en
 *     gebruik exact `totalCents`. GEEN routing/herberekening. De prijs, prijsbron,
 *     btw/breakdown en luchthavencontext komen uit de GEVALIDEERDE snapshot — nooit
 *     uit clientvelden. Consumeren gebeurt later (idempotency), de caller krijgt de
 *     `lockedQuoteId`.
 *  b) geen quoteId → uitsluitend een DETERMINISTISCHE vaste route (routing UIT) of
 *     offerte op aanvraag. Zo ontstaat er nooit een bindende dynamische prijs zonder
 *     door de klant geaccepteerde snapshot en wordt Google niet (opnieuw) gebeld.
 */
export async function resolveBookingPrice(
  req: BookingPriceRequest,
  deps: BookingPriceDeps
): Promise<BookingPriceOutcome> {
  const quoteId = (req.quoteId ?? "").trim();

  if (quoteId) {
    const stored = await deps.readSnapshot(quoteId);
    if (!stored) {
      return {
        kind: "error",
        status: 409,
        error: "quote_not_found",
        message: "Uw prijsofferte is niet (meer) gevonden. Vernieuw de prijs en probeer opnieuw.",
      };
    }
    const usable = checkSnapshotUsable(stored, {
      now: deps.now,
      expectedFingerprint: quoteFingerprint({
        pickup: req.pickup,
        dropoff: req.dropoff,
        vehicleClass: req.vehicleClass,
        returnTrip: req.returnTrip,
        departureAt: req.departureAt,
        returnDepartureAt: req.returnDepartureAt,
      }),
    });
    if (!usable.ok) {
      const map: Record<typeof usable.reason, [number, string, string]> = {
        expired: [409, "quote_expired", "Uw prijs is verlopen. Vernieuw de prijs en accepteer die opnieuw."],
        fingerprint_mismatch: [409, "quote_mismatch", "De rit is gewijzigd ten opzichte van de getoonde prijs. Vernieuw de prijs."],
        invalid_source: [422, "quote_invalid", "De prijsofferte is ongeldig. Vernieuw de prijs."],
      };
      const [status, error, message] = map[usable.reason];
      return { kind: "error", status, error, message };
    }
    return {
      kind: "priced",
      priceEuros: stored.totalCents / 100,
      currency: "EUR",
      returnApplied: stored.routeSnapshot.returnApplied,
      airport: stored.routeSnapshot.airport,
      pricingSource: stored.pricingSource,
      lockedQuoteId: quoteId,
    };
  }

  // Geen quoteId → routing UIT: alleen vaste route of offerte-op-aanvraag.
  const compute = deps.computeQuote ?? ((input) => calculateBookingPrice(input).then((r) => r.quote));
  const quote = await compute({
    pickup: req.pickup,
    dropoff: req.dropoff,
    ...(req.vehicleClass !== undefined ? { vehicleClass: req.vehicleClass } : {}),
    returnTrip: req.returnTrip,
    passengers: req.passengers,
    ...(req.departureAt !== undefined ? { departureAt: req.departureAt } : {}),
    ...(req.returnDepartureAt !== undefined ? { returnDepartureAt: req.returnDepartureAt } : {}),
    allowDistanceTariff: false,
  });

  if (quote.available) {
    // Nachttoeslag ook op dit no-quoteId-pad (deterministische vaste route), PER
    // RITDEEL: +15% over de enkele-rit-prijs voor elk ritdeel waarvan de eigen
    // ophaaltijd tussen 23:00–06:00 valt. Zelfde basis/afronding als de snapshot.
    const baseCents = quote.priceCents;
    const legSurcharge = nightSurchargeCents(quote.singlePriceCents);
    let nightCents = 0;
    if (isNightTariff(req.departureAt)) nightCents += legSurcharge;
    if (quote.returnApplied && isNightTariff(req.returnDepartureAt)) nightCents += legSurcharge;
    return {
      kind: "priced",
      priceEuros: (baseCents + nightCents) / 100,
      currency: quote.currency,
      returnApplied: quote.returnApplied,
      airport: quote.airport,
      pricingSource: quote.source,
      lockedQuoteId: null,
    };
  }
  if (quote.reason === "capacity_exceeded") {
    return {
      kind: "error",
      status: 422,
      error: "capacity_exceeded",
      message: "Te veel passagiers of bagage voor deze voertuigklasse.",
    };
  }
  return { kind: "on_request", airport: quote.airport };
}
