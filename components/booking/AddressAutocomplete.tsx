"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Adres-autocomplete — PDOK BAG primary, Google Places (New) fallback
 * via /api/places server route (key blijft server-side).
 */

export type AddressSuggestion = {
  id: string;
  label: string;
  source: "pdok" | "google";
};

const PDOK_SUGGEST =
  "https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest";

export default function AddressAutocomplete({
  label,
  placeholder,
  onSelect,
}: {
  label: string;
  placeholder: string;
  /** null = eerdere selectie is ongeldig geworden (gebruiker wijzigde de tekst) */
  onSelect: (s: AddressSuggestion | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [hasSelection, setHasSelection] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "empty">("idle");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [openList, setOpenList] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController | null>(null);
  const listId = `${label.toLowerCase().replace(/\s/g, "-")}-listbox`;

  const search = useCallback(async (q: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("loading");
    try {
      // 1. PDOK primary
      const pdokUrl = `${PDOK_SUGGEST}?q=${encodeURIComponent(q)}&fq=type:adres&rows=6`;
      const res = await fetch(pdokUrl, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        const docs: { id: string; weergavenaam: string }[] =
          data?.response?.docs ?? [];
        if (docs.length > 0) {
          setSuggestions(
            docs.map((d) => ({ id: d.id, label: d.weergavenaam, source: "pdok" }))
          );
          setOpenList(true);
          setStatus("idle");
          return;
        }
      }

      // 2. Google fallback
      const gRes = await fetch(`/api/places?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      });
      if (gRes.ok) {
        const gData: AddressSuggestion[] = await gRes.json();
        setSuggestions(gData);
        setOpenList(gData.length > 0);
        setStatus(gData.length > 0 ? "idle" : "empty");
      } else {
        setSuggestions([]);
        setStatus("empty");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setSuggestions([]);
        setOpenList(false);
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.trim().length < 3) {
      setSuggestions([]);
      setOpenList(false);
      return;
    }
    debounceRef.current = setTimeout(() => search(query.trim()), 250);
    return () => clearTimeout(debounceRef.current);
  }, [query, search]);

  function choose(s: AddressSuggestion) {
    setQuery(s.label);
    setOpenList(false);
    setActiveIndex(-1);
    setHasSelection(true);
    onSelect(s);
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
          aria-activedescendant={
            activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
          }
          className="mt-1.5 min-h-[52px] w-full rounded-field border border-[rgba(31,39,48,0.14)] bg-field px-4 text-[15px] font-medium text-ink placeholder:font-normal placeholder:text-stone focus:border-accent focus:bg-white focus:shadow-[0_0_0_4px_rgba(40,49,59,0.10)] focus:outline-none"
        />
      </label>

      <p className="mt-1 min-h-[1rem] text-xs text-secondary" aria-live="polite">
        {status === "loading" && "Adressen zoeken\u2026"}
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
            <li
              key={s.id}
              id={`${listId}-option-${i}`}
              role="option"
              aria-selected={i === activeIndex}
            >
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s)}
                className={`block w-full px-4 py-3 text-left text-sm transition-colors ${
                  i === activeIndex
                    ? "bg-accent text-white"
                    : "text-ink hover:bg-fog"
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
