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
