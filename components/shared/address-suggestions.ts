import { normalizeSearchValue, type LocalLocation } from "@/lib/pricing/local-locations";
import type { AddressSuggestion } from "@/components/shared/AddressAutocomplete";

/**
 * Pure presentatie- en volgordehulpen voor de gedeelde adres-autocomplete
 * (Experience 2.0, PR 2.2). Geen IO, geen prijs- of routelogica: de `label`
 * die het veld ingaat en naar de resolver gaat, blijft ongewijzigd.
 */

/** Type-label van een suggestie in de lijst (presentatie; geen prijs- of routelogica). */
export type SuggestionKind = "airport" | "station" | "destination" | "address";

export function suggestionKind(s: AddressSuggestion): SuggestionKind {
  if (s.source !== "local" || !s.location) return "address";
  if (s.location.type === "airport") return "airport";
  if (s.location.category === "station") return "station";
  return "destination";
}

/**
 * Titel + adresregel voor de suggestielijst. Lokale locaties tonen hun naam
 * (+ IATA) met het adres eronder; externe labels worden op de eerste komma
 * gesplitst ("Straat 10A" / "1082PP Amsterdam"). De `label` die het veld
 * ingaat verandert niet.
 */
export function suggestionParts(s: AddressSuggestion): { title: string; detail: string } {
  if (s.source === "local" && s.location) {
    const loc = s.location;
    const title = loc.iata ? `${loc.name} (${loc.iata})` : loc.name;
    // Stations dragen hun naam als `address` (ns-stations.ts): toon dan de
    // plaats, zodat de adresregel de titel niet herhaalt.
    const detail = loc.address !== loc.name ? loc.address : loc.city !== loc.name ? loc.city : "";
    return { title, detail };
  }
  const i = s.label.indexOf(", ");
  if (i <= 0) return { title: s.label, detail: "" };
  return { title: s.label.slice(0, i), detail: s.label.slice(i + 2) };
}

/** Generieke woorden die bij een luchthaven/station-zoekopdracht horen. */
const PLACE_KIND_TERMS = new Set(["airport", "luchthaven", "vliegveld", "station", "centraal", "cs"]);

/**
 * F-16: noemt de zoekterm een bekende luchthaven of station zelf ("Schiphol",
 * "schiphol airport", "Eindhoven Airport", "Utrecht Centraal")? Alleen dan
 * krijgt die locatie voorrang. Een specifieke adreszoekopdracht — met een
 * cijfer (huisnummer/postcode) of een woord dat niet in naam/aliassen/IATA
 * van de locatie staat ("Evert van de Beekstraat Schiphol") — houdt de
 * bestaande volgorde.
 */
export function queryNamesKnownPlace(query: string, loc: LocalLocation): boolean {
  if (/\d/.test(query)) return false;
  const tokens = normalizeSearchValue(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return false;
  const vocabulary = new Set(
    [loc.name, ...loc.aliases, loc.iata ?? ""].flatMap((v) => normalizeSearchValue(v).split(" ")).filter(Boolean)
  );
  return tokens.every((token) => vocabulary.has(token) || PLACE_KIND_TERMS.has(token));
}

/**
 * Zet luchthavens/stations die de zoekterm zelf noemt vóór alle andere
 * suggesties (stabiel: onderlinge volgorde blijft). Alle overige suggesties
 * houden exact hun bestaande volgorde.
 */
export function prioritizeKnownPlaces(query: string, suggestions: AddressSuggestion[]): AddressSuggestion[] {
  const isNamedPlace = (s: AddressSuggestion) => {
    const kind = suggestionKind(s);
    return (kind === "airport" || kind === "station") && !!s.location && queryNamesKnownPlace(query, s.location);
  };
  const named = suggestions.filter(isNamedPlace);
  if (named.length === 0) return suggestions;
  return [...named, ...suggestions.filter((s) => !isNamedPlace(s))];
}
