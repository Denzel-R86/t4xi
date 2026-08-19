// ─────────────────────────────────────────────────────────────────────────────
// Pure, IO-vrije koppeling van een OFFICIËLE PDOK-gemeentenaam aan een
// operationele standplaats (2026-08-18, pickup-aanrijmodel).
//
// Bewust uitsluitend op gemeente, nooit op woonplaats, postcode-bereik of
// losse trefwoorden: "Laren" (Noord-Holland, gemeente Laren) is daarmee al
// ondubbelzinnig te onderscheiden van de gelijknamige woonplaats "Laren" in
// gemeente Lochem (Gelderland) — PDOK levert voor die laatste een andere
// `gemeentenaam` ("Lochem"), dus een exacte match op gemeente maakt elke
// keyword-/fuzzy-heuristiek overbodig.
// ─────────────────────────────────────────────────────────────────────────────

/** Triviale normalisatie — geen fuzzy matching, alleen witruimte/hoofdletters. */
export function normalizeGemeenteNaam(value: string): string {
  return value.trim().toLocaleLowerCase("nl-NL");
}

/**
 * Zoekt de toegewezen standplaats-id voor een OFFICIËLE PDOK-gemeentenaam.
 * `null` = niet toegewezen ("unassigned") — de caller behandelt dat altijd
 * als "Offerte op aanvraag", NOOIT als een gok naar de dichtstbijzijnde
 * standplaats.
 */
export function resolveBaseIdForGemeente(
  gemeenteNaam: string,
  baseIdByGemeente: ReadonlyMap<string, string>
): string | null {
  return baseIdByGemeente.get(normalizeGemeenteNaam(gemeenteNaam)) ?? null;
}
