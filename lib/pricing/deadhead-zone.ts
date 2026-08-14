// ─────────────────────────────────────────────────────────────────────────────
// Pure, IO-vrije koppeling van een OFFICIËLE PDOK-woonplaatsnaam aan een
// deadhead-eligible-zone city_id (hotfix 2026-08-14, city-wide economische
// zones voor Eindhoven en Roermond — commercieel bevestigd).
//
// Bewust GEEN keyword-/substring-matching: de enige invoer is het exacte
// `woonplaatsnaam`-veld zoals PDOK dat teruggeeft voor het best-scorende
// document (nooit onze eigen tekstinterpretatie van het adres). "Losse
// trefwoorden blijven onvoldoende" — deze module doet dan ook geen `.includes()`
// op een adres, alleen een exacte (na triviale normalisatie) lookup in een
// server-side geladen allowlist-map.
// ─────────────────────────────────────────────────────────────────────────────

/** Triviale normalisatie — geen fuzzy matching, alleen witruimte/hoofdletters. */
export function normalizeOfficialWoonplaats(value: string): string {
  return value.trim().toLocaleLowerCase("nl-NL");
}

/**
 * Zoekt het city_id voor een OFFICIËLE PDOK-woonplaatsnaam in de server-side
 * geladen allowlist-map (city_id per actieve zone, sleutel = genormaliseerde
 * `label`-kolom van pricing_deadhead_eligible_zones — dus uitsluitend Eindhoven
 * en Roermond, nooit een derde plaats zonder nieuwe migratie/review).
 */
export function resolveZoneCityIdFromWoonplaats(
  officialWoonplaats: string,
  cityIdByOfficialWoonplaats: ReadonlyMap<string, string>
): string | null {
  return cityIdByOfficialWoonplaats.get(normalizeOfficialWoonplaats(officialWoonplaats)) ?? null;
}

/**
 * Individueel tegen PDOK geverifieerde (2026-08-14) postcode4-prefixen waarvan
 * de officiële woonplaats EXACT "Eindhoven" resp. "Roermond" is — GEEN
 * min-max-bereik (dat nam eerder Best/Geldrop/Nuenen/Veldhoven resp.
 * Herten/Montfort/Swalmen onterecht mee, zie de audit van 2026-08-12/13).
 *
 * Uitsluitend een FALLBACK: wordt alleen geraadpleegd wanneer de live
 * PDOK-woonplaatslookup zelf niet beschikbaar is (timeout/netwerkfout/leeg
 * antwoord) — de live lookup per volledig adres blijft de primaire, meest
 * precieze bron en dekt aanzienlijk meer dan deze startset. Uitbreiding van
 * deze set vereist dezelfde individuele PDOK-verificatie per prefix, nooit een
 * bereik.
 *
 * Bewust NIET uitputtend: dit is de startset die daadwerkelijk individueel
 * geverifieerd is tijdens deze hotfix (o.a. Eindhoven Airport/centrum/Strijp-S/
 * High Tech Campus/twee woonadressen; Designer Outlet/centrum/station/twee
 * woonadressen — zie het hotfix-rapport). Ontbreekt een prefix hier, dan valt
 * de fallback terug op "geen match" (fail-closed) — nooit op een gok.
 */
export const EINDHOVEN_POSTCODE4_FALLBACK: ReadonlySet<number> = new Set([
  5611, // Markt/Stationsplein/Neckerspoel (centrum) — PDOK-geverifieerd 2026-08-14
  5612, // Woenselse Markt (woonadres, Woensel) — PDOK-geverifieerd 2026-08-14
  5615, // Karel de Grotelaan (woonadres, Gestel) — PDOK-geverifieerd 2026-08-14
  5617, // Torenallee / Strijp-S — PDOK-geverifieerd 2026-08-14
  5656, // High Tech Campus — PDOK-geverifieerd 2026-08-14
  5657, // Eindhoven Airport (Luchthavenweg) — PDOK-geverifieerd 2026-08-12
]);

export const ROERMOND_POSTCODE4_FALLBACK: ReadonlySet<number> = new Set([
  6041, // Designer Outlet/Stadsweide, centrum/Godsweerderstraat, station/Stationsplein,
  //       Kapellerlaan en Minderbroederssingel (woonadressen) — PDOK-geverifieerd 2026-08-12/14.
  //       Bewust GEEN 6042–6071: die bevatten Herten/Montfort/Swalmen (aparte
  //       PDOK-woonplaatsen binnen dezelfde gemeente Roermond) — zie audit 2026-08-12.
]);

const FOUR_DIGIT_POSTCODE_RE = /\b([1-9]\d{3})\s?[A-Za-z]{2}\b/;

/** Vier-cijferige postcode-prefix uit een adres, of null. Puur, geen IO. */
export function extractPostcode4(address: string): number | null {
  const m = address.match(FOUR_DIGIT_POSTCODE_RE);
  return m ? Number(m[1]) : null;
}

/**
 * Fallback-only zone-lookup op basis van de individueel geverifieerde
 * postcode4-sets hierboven. Retourneert het city_id uit de allowlist-map als
 * de postcode4 herkend wordt, anders null (fail-closed — nooit een gok).
 */
export function resolveZoneCityIdFromPostcode4Fallback(
  address: string,
  cityIdByOfficialWoonplaats: ReadonlyMap<string, string>
): string | null {
  const pc4 = extractPostcode4(address);
  if (pc4 === null) return null;
  if (EINDHOVEN_POSTCODE4_FALLBACK.has(pc4)) {
    return resolveZoneCityIdFromWoonplaats("Eindhoven", cityIdByOfficialWoonplaats);
  }
  if (ROERMOND_POSTCODE4_FALLBACK.has(pc4)) {
    return resolveZoneCityIdFromWoonplaats("Roermond", cityIdByOfficialWoonplaats);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Betrouwbaarheidshardening (2026-08-14): een BREDE, uitsluitend DEFENSIEVE
// pre-filter. Bepaalt NOOIT of deadhead activeert — uitsluitend of een
// mislukte/onzekere zone-lookup (config/allowlist/PDOK allemaal onbeschikbaar,
// zelfs na retry) mag terugvallen op de basisprijs, of in plaats daarvan de
// hele offerte "onzeker" (fail-closed naar "Offerte op aanvraag") moet maken.
// Te breed classificeren hier is VEILIG: het leidt hoogstens tot vaker
// "Offerte op aanvraag", nooit tot een te lage bindende prijs. Daarom mag deze
// functie — in tegenstelling tot alle activeringslogica elders — wél op een
// brede postcode-honderdtallen-band en een letterlijke plaatsnaam in de tekst
// leunen: dat is hier geen "losse trefwoorden zijn genoeg om te activeren"
// (verboden), maar "losse aanwijzingen zijn genoeg om NIET te gokken" (vereist).
// ─────────────────────────────────────────────────────────────────────────────

/** Ruime band rond de bekende Eindhoven/Roermond-postcodes — uitsluitend voor de veiligheidsbeslissing hierboven. */
const PLAUSIBLE_ZONE_POSTCODE4_RANGES: ReadonlyArray<{ min: number; max: number }> = [
  { min: 5600, max: 5699 }, // Eindhoven en ruime omgeving
  { min: 6000, max: 6099 }, // Roermond en ruime omgeving
];

const PLAUSIBLE_ZONE_NAME_RE = /eindhoven|roermond/i;

/**
 * `dropoff` bekend (curated LocationRow) MET een echte stad (`city_id`
 * non-null): altijd `true` — een reeds-opgeloste locatie met een stad is per
 * definitie betrouwbaarder dan elke tekstheuristiek, en zonder de
 * allowlist-load kunnen we niet uitsluiten dat die stad Eindhoven/Roermond is.
 * `dropoff` bekend maar zonder stad (bv. Schiphol Airport, `city_id: null`):
 * altijd `false` — een zone bindt op stad, dus zo'n locatie kan structureel
 * nooit in een zone vallen, ongeacht welke config beschikbaar is.
 * `dropoff` onopgelost: brede postcode4-band OF plaatsnaam letterlijk in de
 * tekst.
 */
export function couldPlausiblyBeInZone(
  dropoff: { city_id: string | null } | null,
  dropoffRaw: string
): boolean {
  if (dropoff) return dropoff.city_id !== null;
  const pc4 = extractPostcode4(dropoffRaw);
  const inBroadRange = pc4 !== null && PLAUSIBLE_ZONE_POSTCODE4_RANGES.some((r) => pc4 >= r.min && pc4 <= r.max);
  return inBroadRange || PLAUSIBLE_ZONE_NAME_RE.test(dropoffRaw);
}

/**
 * Conservatieve ondergrens voor de veiligheidsbeslissing wanneer zelfs de
 * config (dus ook `minDistanceKm`) niet geladen kon worden — ruim onder elke
 * realistische configwaarde (default 80 km), zodat deze nooit een echt te
 * korte rit blokkeert, maar wél iedere rit meeneemt die de configdrempel zou
 * kunnen halen.
 */
export const PLAUSIBLE_ZONE_MIN_DISTANCE_KM_FLOOR = 50;
