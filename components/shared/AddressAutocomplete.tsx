"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * DE gedeelde adres-autocomplete — homepagehero, boekingsformulier en
 * tarievenpagina gebruiken exact dit component. Er mag geen tweede
 * implementatie naast bestaan (productieblokker 2, 2026-07-22).
 *
 * Bronnen: PDOK Locatieserver primair (adres + wijk + buurt + woonplaats,
 * zodat "Amsterdam Zuidas" en "Schiphol" ook als suggestie verschijnen),
 * Google Places (New) als fallback via /api/places (hotels en POI's zoals
 * "Hilton Schiphol"; de key blijft server-side).
 *
 * Vrije tekst blijft toegestaan: wie niets selecteert houdt zijn tekst, en de
 * centrale resolver (lib/pricing/location-aliases.ts) bepaalt server-side wat
 * die waard is. Dit component doet GEEN prijs- of locatielogica.
 */

export type AddressSuggestion = {
  id: string;
  label: string;
  /** "free" = niet gekozen uit een lijst (deep-link of losse tekst). */
  source: "pdok" | "google" | "free";
};

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

/** Label mét postcode: "Straat 10A, Amsterdam" + 1082PP → "Straat 10A, 1082PP Amsterdam". */
function pdokLabel(d: PdokDoc): string {
  if (d.type === "adres" && d.postcode && !d.weergavenaam.includes(d.postcode)) {
    const i = d.weergavenaam.lastIndexOf(", ");
    if (i > 0) return `${d.weergavenaam.slice(0, i)}, ${d.postcode} ${d.weergavenaam.slice(i + 2)}`;
  }
  return d.weergavenaam;
}

/**
 * DE gedeelde suggestie-bron (PDOK → Google-fallback), met debounce en abort.
 * AddressAutocomplete rendert hem als veld; SentencePattern (homepagehero)
 * rendert hem als zin-invulling. Presentaties verschillen, de bron nooit.
 */
export function useAddressSuggestions(query: string, enabled = true) {
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "empty">("idle");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(async (q: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("loading");
    try {
      // 1. PDOK primair (adres + wijk + buurt + woonplaats), incl. postcodeveld
      const pdokUrl = `${PDOK_FREE}?q=${encodeURIComponent(q)}&fq=${encodeURIComponent(PDOK_TYPES)}&rows=6&fl=${encodeURIComponent(PDOK_FIELDS)}`;
      const res = await fetch(pdokUrl, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        const docs: PdokDoc[] = data?.response?.docs ?? [];
        if (docs.length > 0) {
          setSuggestions(docs.map((d) => ({ id: d.id, label: pdokLabel(d), source: "pdok" as const })));
          setStatus("idle");
          return;
        }
      }
      // 2. Google-fallback (POI's, hotels)
      const gRes = await fetch(`/api/places?q=${encodeURIComponent(q)}`, { signal: controller.signal });
      if (gRes.ok) {
        const gData: AddressSuggestion[] = await gRes.json();
        setSuggestions(gData);
        setStatus(gData.length > 0 ? "idle" : "empty");
      } else {
        setSuggestions([]);
        setStatus("empty");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setSuggestions([]);
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!enabled || query.trim().length < 3) {
      setSuggestions([]);
      setStatus("idle");
      return;
    }
    debounceRef.current = setTimeout(() => search(query.trim()), 250);
    return () => clearTimeout(debounceRef.current);
  }, [query, enabled, search]);

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
        {status === "loading" && "Adressen zoeken…"}
        {status === "empty" && "Geen adressen gevonden. Controleer de spelling."}
        {status === "error" &&
          "Zoeken lukt even niet. Controleer je verbinding en probeer opnieuw."}
      </p>

      {openList && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-2 w-full overflow-hidden rounded-field border border-line bg-card shadow-card"
        >
          {suggestions.map((s, i) => (
            <li key={s.id} id={`${listId}-option-${i}`} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s)}
                className={`block w-full px-4 py-3 text-left text-sm transition-colors ${
                  i === activeIndex ? "bg-accent text-white" : "text-ink hover:bg-fog"
                }`}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
