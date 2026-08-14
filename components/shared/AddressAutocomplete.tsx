"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  addressLabelFor,
  displayLabelFor,
  searchLocalLocations,
  type LocalLocation,
} from "@/lib/pricing/local-locations";

/**
 * DE gedeelde adres-autocomplete — homepagehero, boekingsformulier en
 * tarievenpagina gebruiken exact dit component. Er mag geen tweede
 * implementatie naast bestaan (productieblokker 2, 2026-07-22).
 *
 * Bronnen, in weergavevolgorde:
 * 1. Lokale dataset (lib/pricing/local-locations.ts) — vliegvelden + populaire
 *    bestemmingen, synchroon en zonder netwerk-call gematcht, dus altijd
 *    vóór de externe bronnen zichtbaar.
 * 2. PDOK Locatieserver (adres + wijk + buurt + woonplaats, zodat "Amsterdam
 *    Zuidas" en "Schiphol" ook als suggestie verschijnen).
 * 3. Google Places (New) als fallback via /api/places (hotels en POI's zoals
 *    "Hilton Schiphol"; de key blijft server-side).
 *
 * Vrije tekst blijft toegestaan: wie niets selecteert houdt zijn tekst, en de
 * centrale resolver (lib/pricing/location-aliases.ts) bepaalt server-side wat
 * die waard is. Dit component doet GEEN prijs- of locatielogica — ook een
 * lokale suggestie levert uiteindelijk gewoon een adrestekst-`label` op, exact
 * zoals een PDOK-suggestie dat doet, zodat de bestaande afstands-/route-/
 * prijsberekening ongewijzigd blijft werken.
 */

export type AddressSuggestion = {
  id: string;
  /** Adrestekst die het invoerveld ingaat en naar de resolver/Routes API gaat. */
  label: string;
  /** "free" = niet gekozen uit een lijst (deep-link of losse tekst). */
  source: "pdok" | "google" | "free" | "local";
  /** Alleen bij `source: "local"` — hoe de suggestie in de lijst wordt getoond. */
  displayLabel?: string;
  /** Alleen bij `source: "local"` — volledige lokale locatie (incl. coördinaten). */
  location?: LocalLocation;
};

const MIN_LOCAL_QUERY_LENGTH = 2;
const MIN_PDOK_QUERY_LENGTH = 3;

function toLocalSuggestion(loc: LocalLocation): AddressSuggestion {
  return {
    id: loc.id,
    label: addressLabelFor(loc),
    source: "local",
    displayLabel: displayLabelFor(loc),
    location: loc,
  };
}

/**
 * Het free-endpoint (niet suggest): dat levert postcode als apart veld, zodat
 * het label mét postcode kan worden samengesteld. Zonder postcode in het label
 * kan de resolver een adres alleen op stadsniveau prijzen, terwijl de
 * tarievenpagina de wijkprijs adverteert (E2E-bevinding 2026-07-22: "Gustav
 * Mahlerlaan 10A, Amsterdam" → €69 stad i.p.v. €50 Zuidas).
 */
const PDOK_FREE = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";
const PDOK_TYPES = "type:(adres OR wijk OR buurt OR woonplaats)";
const PDOK_FIELDS = "id,weergavenaam,postcode,type";

type PdokDoc = { id: string; weergavenaam: string; postcode?: string; type?: string };

const PUBLIC_TRANSIT_TERMS = new Set([
  "station",
  "stations",
  "centraal",
  "central",
  "cs",
  "treinstation",
  "metro",
  "halte",
  "terminal",
  "airport",
  "luchthaven",
]);

function normalizeForRanking(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("nl-NL")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Herkent OV-intentie op woorden, niet op plaatsnamen: werkt dus voor iedere stad. */
export function isPublicTransitQuery(query: string): boolean {
  return normalizeForRanking(query)
    .split(" ")
    .some((token) => PUBLIC_TRANSIT_TERMS.has(token));
}

/**
 * Exacte en volledige matches gaan vóór gedeeltelijke adresmatches. Een OV-boost
 * geldt alleen wanneer zowel query als suggestie een generieke OV-term bevatten.
 */
export function rankAddressSuggestions(
  query: string,
  suggestions: AddressSuggestion[]
): AddressSuggestion[] {
  const normalizedQuery = normalizeForRanking(query);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const transitQuery = isPublicTransitQuery(query);
  const seen = new Set<string>();

  return suggestions
    .map((suggestion, index) => {
      const label = normalizeForRanking(suggestion.label);
      const labelTokens = new Set(label.split(" ").filter(Boolean));
      const matchedTokens = queryTokens.filter((token) => labelTokens.has(token)).length;
      let score = matchedTokens * 100;
      if (queryTokens.length > 0 && matchedTokens === queryTokens.length) score += 1_000;
      if (label === normalizedQuery) score += 10_000;
      else if (label.startsWith(`${normalizedQuery} `)) score += 5_000;
      if (transitQuery && Array.from(labelTokens).some((token) => PUBLIC_TRANSIT_TERMS.has(token))) {
        score += 500;
      }
      return { suggestion, label, score, index };
    })
    .filter((item) => {
      if (seen.has(item.label)) return false;
      seen.add(item.label);
      return true;
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ suggestion }) => suggestion);
}

async function googleSuggestions(query: string, signal: AbortSignal): Promise<AddressSuggestion[]> {
  try {
    const response = await fetch(`/api/places?q=${encodeURIComponent(query)}`, { signal });
    if (!response.ok) return [];
    const data: unknown = await response.json();
    return Array.isArray(data) ? (data as AddressSuggestion[]) : [];
  } catch {
    return [];
  }
}

/** Label mét postcode: "Straat 10A, Amsterdam" + 1082PP → "Straat 10A, 1082PP Amsterdam". */
function pdokLabel(d: PdokDoc): string {
  if (d.type === "adres" && d.postcode && !d.weergavenaam.includes(d.postcode)) {
    const i = d.weergavenaam.lastIndexOf(", ");
    if (i > 0) return `${d.weergavenaam.slice(0, i)}, ${d.postcode} ${d.weergavenaam.slice(i + 2)}`;
  }
  return d.weergavenaam;
}

/**
 * Filtert externe (PDOK/Google) suggesties die al door een lokale suggestie
 * gedekt worden — voorkomt dubbele resultaten als PDOK hetzelfde adres of
 * dezelfde woonplaats teruggeeft als onze lokale dataset.
 */
export function dedupeAgainstLocal(
  externalSuggestions: AddressSuggestion[],
  localSuggestions: AddressSuggestion[]
): AddressSuggestion[] {
  const localKeys = new Set(
    localSuggestions.flatMap((s) => [
      normalizeForRanking(s.label),
      s.location ? normalizeForRanking(s.location.name) : null,
    ].filter((v): v is string => Boolean(v)))
  );
  return externalSuggestions.filter((s) => !localKeys.has(normalizeForRanking(s.label)));
}

/**
 * DE gedeelde suggestie-bron (lokale dataset → PDOK → Google-fallback), met
 * debounce en abort voor de externe bronnen. AddressAutocomplete rendert hem
 * als veld; SentencePattern (homepagehero) rendert hem als zin-invulling.
 * Presentaties verschillen, de bron nooit.
 */
export function useAddressSuggestions(query: string, enabled = true) {
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "empty">("idle");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  // Lokale matches zijn synchroon en zonder netwerk-call — nooit gedebouncet,
  // altijd meteen zichtbaar (eis: lokale resultaten vóór PDOK, direct getoond).
  const localMatches = useMemo(() => {
    if (!enabled) return [];
    const trimmed = query.trim();
    if (trimmed.length < MIN_LOCAL_QUERY_LENGTH) return [];
    return searchLocalLocations(trimmed).map(toLocalSuggestion);
  }, [query, enabled]);

  const search = useCallback(async (q: string, local: AddressSuggestion[]) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("loading");
    try {
      // Bij OV-intentie halen we de POI-bron parallel op. PDOK is sterk in adressen,
      // maar levert stationsnamen niet consequent; alleen als PDOK leeg is wachten
      // zou een exacte match als "Amsterdam Centraal" daardoor onzichtbaar maken.
      const googlePromise = isPublicTransitQuery(q)
        ? googleSuggestions(q, controller.signal)
        : null;

      // 1. PDOK primair (adres + wijk + buurt + woonplaats), incl. postcodeveld
      const pdokUrl = `${PDOK_FREE}?q=${encodeURIComponent(q)}&fq=${encodeURIComponent(PDOK_TYPES)}&rows=6&fl=${encodeURIComponent(PDOK_FIELDS)}`;
      const res = await fetch(pdokUrl, { signal: controller.signal });
      let pdokSuggestions: AddressSuggestion[] = [];
      if (res.ok) {
        const data = await res.json();
        const docs: PdokDoc[] = data?.response?.docs ?? [];
        pdokSuggestions = docs.map((d) => ({ id: d.id, label: pdokLabel(d), source: "pdok" as const }));
        if (pdokSuggestions.length > 0 && !googlePromise) {
          const ranked = dedupeAgainstLocal(rankAddressSuggestions(q, pdokSuggestions), local);
          setSuggestions([...local, ...ranked]);
          setStatus("idle");
          return;
        }
      }
      // 2. Google-fallback voor lege PDOK-resultaten; bij OV-intentie samenvoegen
      // en generiek op exacte/tokendekking rangschikken.
      const google = await (googlePromise ?? googleSuggestions(q, controller.signal));
      const ranked = dedupeAgainstLocal(
        rankAddressSuggestions(q, [...pdokSuggestions, ...google]),
        local
      ).slice(0, 6);
      const combined = [...local, ...ranked];
      setSuggestions(combined);
      setStatus(combined.length > 0 ? "idle" : "empty");
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setSuggestions(local);
        setStatus(local.length > 0 ? "idle" : "error");
      }
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!enabled) {
      setSuggestions([]);
      setStatus("idle");
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length < MIN_PDOK_QUERY_LENGTH) {
      // Onder de PDOK-drempel: alléén lokale resultaten, geen netwerk-call.
      setSuggestions(localMatches);
      setStatus("idle");
      return;
    }
    debounceRef.current = setTimeout(() => search(trimmed, localMatches), 250);
    return () => clearTimeout(debounceRef.current);
  }, [query, enabled, search, localMatches]);

  const clear = useCallback(() => {
    setSuggestions([]);
    setStatus("idle");
  }, []);

  return { status, suggestions, clear };
}

export default function AddressAutocomplete({
  label,
  placeholder,
  onSelect,
  onTextChange,
  initialValue,
}: {
  label: string;
  placeholder: string;
  /** null = eerdere selectie is ongeldig geworden (gebruiker wijzigde de tekst) */
  onSelect: (s: AddressSuggestion | null) => void;
  /** Elke tekstwijziging — voor callers die vrije invoer willen meenemen. */
  onTextChange?: (text: string) => void;
  /** Vooraf ingevuld adres (deep-link). Telt direct als selectie ("free"). */
  initialValue?: string;
}) {
  const [query, setQuery] = useState(initialValue ?? "");
  const [hasSelection, setHasSelection] = useState(Boolean(initialValue));
  // Pas zoeken nadat de gebruiker zelf typt — nooit voor de deep-link-prefill.
  const [dirty, setDirty] = useState(false);
  const [openList, setOpenList] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = `${label.toLowerCase().replace(/\s/g, "-")}-listbox`;
  const t = useTranslations("autocomplete");

  const { status, suggestions, clear } = useAddressSuggestions(query, dirty);

  useEffect(() => {
    setOpenList(suggestions.length > 0);
    setActiveIndex(-1);
  }, [suggestions]);

  // Deep-link-prefill telt als volwaardige invoer: de resolver server-side
  // bepaalt de prijs, precies zoals bij handmatig getypte vrije tekst.
  const notifiedInitial = useRef(false);
  useEffect(() => {
    if (initialValue && !notifiedInitial.current) {
      notifiedInitial.current = true;
      onSelect({ id: "deeplink", label: initialValue, source: "free" });
    }
  }, [initialValue, onSelect]);

  function choose(s: AddressSuggestion) {
    setQuery(s.label);
    setDirty(false);
    clear();
    setOpenList(false);
    setActiveIndex(-1);
    setHasSelection(true);
    onSelect(s);
    onTextChange?.(s.label);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!openList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      choose(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpenList(false);
    }
  }

  return (
    <div className="relative">
      <label className="block text-xs font-bold text-secondary">
        {label}
        <input
          type="text"
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setDirty(true);
            onTextChange?.(e.target.value);
            if (hasSelection) {
              setHasSelection(false);
              onSelect(null); // eerdere selectie is niet meer geldig
            }
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setOpenList(false), 150)}
          role="combobox"
          aria-expanded={openList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
          className="mt-1.5 min-h-[52px] w-full rounded-field border border-[rgba(31,39,48,0.14)] bg-field px-4 text-[15px] font-medium text-ink placeholder:font-normal placeholder:text-stone focus:border-accent focus:bg-white focus:shadow-[0_0_0_4px_rgba(40,49,59,0.10)] focus:outline-none"
        />
      </label>

      <p className="mt-1 min-h-[1rem] text-xs text-secondary" aria-live="polite">
        {status === "loading" && t("zoeken")}
        {status === "empty" && t("leeg")}
        {status === "error" && t("fout")}
      </p>

      {/* Skeleton tijdens de eerste zoekopdracht: premium laadgevoel i.p.v. een
          lege sprong. Alleen als er nog geen (verouderde) lijst staat, zodat de
          skeleton nooit over echte suggesties valt. De aria-live <p> hierboven
          doet de schermlezer-aankondiging; de skeleton is puur visueel. */}
      {status === "loading" && !openList && (
        <div
          className="absolute z-20 mt-2 w-full overflow-hidden rounded-field border border-line bg-card shadow-card"
          aria-hidden="true"
        >
          {[68, 52, 60].map((w, i) => (
            <div key={i} className="px-4 py-3">
              <span
                className="block h-3.5 animate-pulse rounded bg-line motion-reduce:animate-none"
                style={{ width: `${w}%` }}
              />
            </div>
          ))}
        </div>
      )}

      {openList && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-2 w-full overflow-hidden rounded-field border border-line bg-card shadow-card"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-option-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => choose(s)}
              className={`cursor-pointer px-4 py-3 text-left text-sm transition-colors ${
                i === activeIndex ? "bg-accent text-white" : "text-ink hover:bg-fog"
              }`}
            >
              {s.displayLabel ? (
                <span className="block">
                  <span className="block font-medium">{s.displayLabel}</span>
                  <span className={`block text-xs ${i === activeIndex ? "text-white/80" : "text-secondary"}`}>
                    {s.location?.address}
                  </span>
                </span>
              ) : (
                s.label
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
