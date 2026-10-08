/**
 * JourneyLine — pure toestandslogica (Experience 2.0 §4).
 *
 * Twee functies, allebei zonder React/DOM zodat ze los testbaar zijn:
 *
 *   journeyStateFor(quote, pickup, dropoff)  → de *rusttoestand* die bij de
 *     huidige invoer hoort: empty | origin | route | arrived.
 *   journeyTransition(previous, next, opts)  → wat er nu getekend wordt; alleen
 *     de stap naar `arrived` kan `travelling` (600ms reizend punt) opleveren.
 *
 * Harde regel uit §4: `arrived` bestaat uitsluitend bij een backend-bevestigde
 * quote (`status: "ready"` mét quote-lock `quoteId`). Geen client-side prijs- of
 * statuslogica: deze functie leest alleen wat `useRouteQuote` al heeft beslist.
 */

export const JOURNEY_STATES = ["empty", "origin", "route", "travelling", "arrived"] as const;
export type JourneyState = (typeof JOURNEY_STATES)[number];

/** Toestanden waarin de lijn tot rust komt (alles behalve de overgang). */
export type JourneyRestState = Exclude<JourneyState, "travelling">;

/**
 * Minimale vorm van de `Quote`-union uit `components/shared/useRouteQuote.ts`.
 * Structureel getypt zodat `lib/` niet van een client-module afhangt; elke
 * `Quote` is hieraan toewijsbaar (vastgelegd in de test).
 */
export type JourneyQuote =
  | { status: "idle" | "loading" | "error" | "onrequest" }
  | { status: "ready"; quoteId: string };

/** Een gekozen adres; alleen aanwezigheid telt, de inhoud niet. */
export type JourneyEndpoint = object | null | undefined;

function isConfirmedQuote(quote: JourneyQuote | null | undefined): boolean {
  return quote?.status === "ready" && typeof quote.quoteId === "string" && quote.quoteId.trim() !== "";
}

/**
 * Rusttoestand voor de huidige invoer.
 *
 * - geen vertrek en geen bestemming → `empty`
 * - precies één van beide gekozen   → `origin` (lijn half, open einde)
 * - beide gekozen, geen bevestigde quote (idle/loading/error/onrequest) → `route`
 * - beide gekozen + bevestigde quote (`ready` met `quoteId`) → `arrived`
 *
 * Een (verouderde) `ready`-quote zonder twee adressen telt niet: de adressen
 * zijn leidend, zodat een gewist veld de lijn direct terugzet.
 */
export function journeyStateFor(
  quote: JourneyQuote | null | undefined,
  pickup: JourneyEndpoint,
  dropoff: JourneyEndpoint,
): JourneyRestState {
  const hasPickup = pickup != null;
  const hasDropoff = dropoff != null;
  if (!hasPickup && !hasDropoff) return "empty";
  if (!hasPickup || !hasDropoff) return "origin";
  return isConfirmedQuote(quote) ? "arrived" : "route";
}

/**
 * Welke toestand nu getekend wordt, gegeven de vorige getekende toestand.
 *
 * - Alleen de stap van een niet-aangekomen toestand naar `arrived` speelt de
 *   reis af (`travelling`); de CSS eindigt die animatie zelf in de
 *   `arrived`-weergave, dus er is geen timer nodig.
 * - `reducedMotion` → direct de eindstaat, nooit `travelling`.
 * - Al onderweg en nog steeds `arrived` → blijft `travelling`: de animatie is
 *   eenmalig en eindigt visueel als `arrived`; terugspringen naar `arrived` zou
 *   een lopende reis afkappen. Al `arrived` → blijft `arrived` (geen herhaling).
 * - Elke andere stap (ook terug van `arrived` naar `route`) is direct.
 */
export function journeyTransition(
  previous: JourneyState | null | undefined,
  next: JourneyRestState,
  opts: { reducedMotion: boolean },
): JourneyState {
  if (next !== "arrived") return next;
  if (opts.reducedMotion) return "arrived";
  if (previous === "travelling") return "travelling";
  if (previous === "arrived") return "arrived";
  // Eerste render die meteen `arrived` is (bv. server-render of herstelde
  // handoff): geen theater, gewoon de eindstaat.
  if (previous == null) return "arrived";
  return "travelling";
}
