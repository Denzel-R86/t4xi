// ─────────────────────────────────────────────────────────────────────────────
// Genormaliseerde geografische context van één kant van een rit (Phase 5.5).
// PUUR en IO-VRIJ: er wordt niets opgezocht, gegeocodeerd of bevraagd. Alles
// hieronder komt uit gegevens die de prijspijplijn AL heeft.
//
// AANLEIDING
//   Phase 5 liep vast op evenementen buiten de `public.locations`-vocabulaire
//   (Biddinghuizen, Landgraaf, Lichtenvoorde, Zandvoort). Die adressen hebben
//   geen catalogus-slug, maar het adres dat de klant kiest bevat wél een
//   postcode en een woonplaats: de adres-autocomplete stelt haar label samen
//   als "Straat 10A, 1234 AB Plaats". Die twee velden waren dus al aanwezig —
//   ze werden alleen nergens als STRUCTUUR doorgegeven.
//
// SERVER-SIDE AFGELEID, NOOIT CLIENT-AANGELEVERD
//   De context wordt op de server uit het ruwe adres afgeleid, niet als losse
//   velden door de browser meegestuurd. Daarmee blijft de prijs een pure
//   functie van precies de invoer die ook in `quoteFingerprint` zit: er
//   ontstaat geen nieuw veld waarmee een caller een toeslag zou kunnen
//   ontlopen of forceren, en het publieke API-contract verandert niet.
//
// FAIL-CLOSED
//   Elk veld is `null` zodra het niet ondubbelzinnig af te leiden is. Een
//   ontbrekend veld matcht nooit — nooit een gok naar de dichtstbijzijnde
//   plaats of postcode.
// ─────────────────────────────────────────────────────────────────────────────
import { placeOf, postcode4 } from "@/lib/pricing/location-aliases";

/**
 * Wat de prijslaag geografisch over één kant van een rit weet. Bewust GEEN
 * volledig adres, huisnummer of andere herleidbare gegevens: dit type reist
 * mee naar logging en snapshot-metadata.
 */
export type PricingLocationContext = {
  /**
   * Opgeloste locatie-slug uit de route. Let op: bij het afstandstarief valt
   * dit voor een onbekend adres terug op een geslugificeerde vrije tekst, die
   * per definitie nooit gelijk is aan een gecureerde catalogusslug — die
   * waarde matcht dus nooit, en dat is precies de bedoeling.
   */
  readonly locationSlug: string | null;
  /** Vier cijfers van de postcode, of null. */
  readonly postcode4: number | null;
  /** Genormaliseerde woonplaats uit het adreslabel, of null. */
  readonly locality: string | null;
  /**
   * Officiële PDOK-gemeente — UITSLUITEND wanneer die elders in de pijplijn al
   * is opgezocht (aanrijcomponent). Hier wordt nooit een lookup gedaan.
   */
  readonly gemeente: string | null;
};

export const EMPTY_LOCATION_CONTEXT: PricingLocationContext = {
  locationSlug: null,
  postcode4: null,
  locality: null,
  gemeente: null,
};

/** Triviale normalisatie — geen fuzzy matching, alleen witruimte/hoofdletters. */
export function normalizeLocality(value: string): string {
  return value.trim().toLocaleLowerCase("nl-NL").replace(/\s+/g, " ");
}

/**
 * Landnamen die adres-suggesties achteraan kunnen plakken (Google Places doet
 * dat standaard). Ze zeggen niets over de woonplaats en worden weggeknipt.
 */
const COUNTRY_SUFFIXES = new Set([
  "nederland",
  "netherlands",
  "the netherlands",
  "nl",
  "belgie",
  "belgië",
  "belgium",
  "belgique",
  "duitsland",
  "germany",
  "deutschland",
]);

/**
 * Woonplaats uit een vrij adresveld. De vorm van het label hangt af van WAT de
 * klant koos in de adres-autocomplete; beide PDOK-vormen zijn geverifieerd
 * tegen de live Locatieserver (2026-08-27):
 *
 *   type "adres"       → "Spijkweg 30A, 8256RJ Biddinghuizen"
 *                        → laatste segment, postcode eruit  → "biddinghuizen"
 *   type "woonplaats"  → "Biddinghuizen, Dronten, Flevoland"
 *                        → EERSTE segment (plaats, gemeente, provincie)
 *
 * Het onderscheid loopt via de cijfers: een straatadres bevat een huisnummer
 * en/of postcode, een kale plaatsnaam nooit. Zonder die regel zou een gekozen
 * woonplaats de PROVINCIE opleveren.
 *
 * Fail-closed: `null` zodra het resultaat leeg is, nog een cijfer bevat of
 * onwaarschijnlijk lang is. Een niet-herkende vorm levert geen match op en
 * dus geen toeslag — nooit een verkeerde.
 */
export function parseLocality(address: string | null | undefined): string | null {
  if (!address) return null;

  const segments = address
    .toLowerCase()
    .split(",")
    .map((part) => normalizeLocality(part))
    .filter((part) => part.length > 0);
  while (segments.length > 1 && COUNTRY_SUFFIXES.has(segments[segments.length - 1]!)) {
    segments.pop();
  }
  if (segments.length === 0) return null;

  // Geen enkel cijfer in het hele adres → dit is een plaatsaanduiding, niet een
  // straatadres. PDOK zet de woonplaats dan VOORAAN, gevolgd door gemeente en
  // provincie.
  const hasDigit = /\d/.test(segments.join(" "));
  const candidate = hasDigit
    ? normalizeLocality(placeOf(segments[segments.length - 1]!))
    : segments[0]!;

  if (!candidate) return null;
  if (/\d/.test(candidate)) return null;
  if (candidate.length > 40) return null;
  if (candidate.split(" ").length > 4) return null;
  return candidate;
}

/**
 * Bouwt de context voor één kant van een rit. `rawAddress` is de tekst zoals
 * de klant die koos; `locationSlug` en `gemeente` komen uit de al berekende
 * quote (route-resolutie resp. aanrijcomponent) en worden hier alleen
 * doorgegeven — nooit opnieuw bepaald.
 */
export function buildLocationContext(
  rawAddress: string | null | undefined,
  known: { locationSlug?: string | null; gemeente?: string | null } = {}
): PricingLocationContext {
  const address = rawAddress ?? "";
  return {
    locationSlug: known.locationSlug ?? null,
    postcode4: address ? postcode4(address) : null,
    locality: parseLocality(address),
    gemeente: known.gemeente ?? null,
  };
}
