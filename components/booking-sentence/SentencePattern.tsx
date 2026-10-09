"use client";

import "@/components/horizon/horizon.css";
import { Link } from "@/i18n/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Odometer, usePrefersReducedMotion } from "@/components/horizon/motion";
import { Stamp, Dash } from "@/components/horizon/stamp";
import { useAddressSuggestions, type AddressSuggestion } from "@/components/shared/AddressAutocomplete";
import { useRouteQuote } from "@/components/shared/useRouteQuote";
import { useHidesStickyCta } from "@/components/sections/sticky-cta-visibility";
import { isTextEntry, quoteOutcomeKey, shouldRevealResult } from "@/lib/hero/hero-visibility";
import { useTranslations } from "next-intl";
import { amsterdamDepartureIso } from "@/lib/pricing/departure-time";


/** De boekingszin óp de lijn: "Ik reis van ___ naar ___." — het antwoord is de
 *  vaste prijs uit de echte Pricing Engine. Confirm leidt naar de volledige
 *  boekingsflow mét de ingevulde adressen (deep-link — nooit opnieuw zoeken).
 *
 *  Suggesties en prijs komen uit de GEDEELDE bronnen (useAddressSuggestions,
 *  useRouteQuote): dit is dezelfde keten als het boekingsformulier, alleen in
 *  zin-presentatie. Vrije tekst blijft toegestaan. */
/** ISO-datum van vandaag (lokale tijd) — uitsluitend voor de `min`-grens van het HTML-datumveld (dat werkt alleen op dagniveau). */
function todayISO(): string {
  const d = new Date();
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}

/**
 * 2026-08-19 (audit-correctie): toetst het VOLLEDIGE vertrekmoment (datum +
 * tijd) in Europe/Amsterdam, niet alleen de datum. Hergebruikt uitsluitend
 * `amsterdamDepartureIso` (dezelfde helper als de server in
 * app/api/pricing/quote/route.ts en components/booking/BookingSection.tsx) —
 * geen tweede tijdzone-implementatie.
 */
function isFutureAmsterdamDeparture(date: string, time: string): boolean {
  const iso = amsterdamDepartureIso(date, time);
  return iso !== null && new Date(iso).getTime() >= Date.now();
}

const HERO_LUGGAGE = [
  { value: "geen-bagage", labelKey: "bagageGeen" },
  { value: "handbagage", labelKey: "bagageHand" },
  { value: "1-2-koffers", labelKey: "bagage12" },
  { value: "3-koffers", labelKey: "bagage3" },
  { value: "overleg", labelKey: "bagageOverleg" },
] as const;

export function SentencePattern({ confirmHref = "/boeken" }: { confirmHref?: string }) {
  const t = useTranslations("zin");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fromResolved, setFromResolved] = useState("");
  const [toResolved, setToResolved] = useState("");
  const [activeField, setActiveField] = useState<"from" | "to" | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  // 2026-08-19 (hotfix): datum, tijd en bagage zijn direct zichtbaar in de hero
  // (geen inklap-stap) en verplicht vóórdat er een prijs getoond of quote-API-
  // call gedaan wordt — zie components/shared/useRouteQuote.ts's `ready`-optie.
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [luggage, setLuggage] = useState("");

  // Eén gedeelde suggestiebron voor het actieve veld.
  const activeQuery = activeField === "from" ? from : activeField === "to" ? to : "";
  const { suggestions, clear } = useAddressSuggestions(activeQuery, activeField !== null);

  // Vrije tekst quoteert direct (bestaand gedrag), via de gedeelde quote-flow.
  const pickup = useMemo<AddressSuggestion | null>(
    () => {
      const label = fromResolved || from.trim();
      return label.length >= 3 ? { id: "hero-from", label, source: "free" } : null;
    },
    [from, fromResolved]
  );
  const dropoff = useMemo<AddressSuggestion | null>(
    () => {
      const label = toResolved || to.trim();
      return label.length >= 3 ? { id: "hero-to", label, source: "free" } : null;
    },
    [to, toResolved]
  );
  // Zelfde betekenis als de server-side check (volledig vertrekmoment, niet alleen de datum).
  const departureValid = Boolean(date) && Boolean(time) && isFutureAmsterdamDeparture(date, time);
  const addressesSet = Boolean(pickup && dropoff);
  const quoteReady = addressesSet && departureValid && Boolean(luggage);
  const quote = useRouteQuote(pickup, dropoff, { date, time, luggage, ready: quoteReady });
  const reducedMotion = usePrefersReducedMotion();

  // F-14: de zin draagt de boekingshandeling zelf. De mobiele StickyCta wijkt
  // alleen als de resultaatregel (prijs + "Bevestig") grotendeels in beeld is.
  const rootRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  useHidesStickyCta(resultRef);

  // F-14: op een smal scherm valt de uitkomst voor een nieuwe rit onder de vouw.
  // Dan schuift de pagina één keer precies genoeg om de resultaatregel te tonen
  // (zie shouldRevealResult). scrollIntoView verplaatst de focus niet. Bij
  // reduced motion springt de pagina zonder animatie: de positie is nodig om de
  // prijs te zien, de beweging niet.
  // De sleutel hoort bij de rit waarvoor de prijs is OPGEVRAAGD, niet bij de
  // huidige invoer: direct na een wijziging toont de hook nog één render lang de
  // oude uitkomst. Daarom onthouden we de rit op het moment dat de hook "loading"
  // meldt, en vormen we de sleutel pas als die aanvraag geland is.
  const pickupLabel = pickup?.label ?? "";
  const dropoffLabel = dropoff?.label ?? "";
  const requestedRide = useRef<{ pickup: string; dropoff: string; date: string; time: string; luggage: string } | null>(null);
  const lastHandledOutcome = useRef<string | null>(null);
  useEffect(() => {
    if (!quoteReady) {
      requestedRide.current = null;
      return;
    }
    if (quote.status === "loading") {
      requestedRide.current = { pickup: pickupLabel, dropoff: dropoffLabel, date, time, luggage };
      return;
    }
    const ride = requestedRide.current;
    const result = resultRef.current;
    const root = rootRef.current;
    if (!ride || !result || !root) return;
    const outcomeKey = quoteOutcomeKey({ status: quote.status, ...ride });
    if (outcomeKey === null) return;
    const r = result.getBoundingClientRect();
    const active = document.activeElement as HTMLElement | null;
    const reveal = shouldRevealResult({
      key: outcomeKey,
      lastHandledKey: lastHandledOutcome.current,
      resultTop: r.top,
      resultBottom: r.bottom,
      sentenceTop: root.getBoundingClientRect().top,
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      textEntryFocused: isTextEntry(
        active && {
          tagName: active.tagName,
          type: active.getAttribute("type"),
          role: active.getAttribute("role"),
          isContentEditable: active.isContentEditable,
        }
      ),
    });
    lastHandledOutcome.current = outcomeKey;
    if (reveal) result.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
  }, [quote.status, quoteReady, pickupLabel, dropoffLabel, date, time, luggage, reducedMotion]);

  const href =
    quoteReady && pickup && dropoff
      ? `/boeken?pickup=${encodeURIComponent(pickup.label)}&dropoff=${encodeURIComponent(dropoff.label)}&date=${date}&time=${time}&luggage=${encodeURIComponent(luggage)}`
      : pickup && dropoff
        ? `/boeken?pickup=${encodeURIComponent(pickup.label)}&dropoff=${encodeURIComponent(dropoff.label)}`
        : confirmHref;
  // Zolang adressen al bekend zijn maar datum/tijd/bagage nog niet compleet zijn,
  // is "Bevestig" bewust niet-navigeerbaar — de klant moet de zin eerst afmaken.
  function onConfirmClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (addressesSet && !quoteReady) e.preventDefault();
  }

  function choose(s: AddressSuggestion) {
    const shortLabel = s.label.split(",")[0]?.trim() || s.label;
    if (activeField === "from") {
      setFrom(shortLabel);
      setFromResolved(s.label);
    } else if (activeField === "to") {
      setTo(shortLabel);
      setToResolved(s.label);
    }
    clear();
    setActiveIndex(-1);
    setActiveField(null);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (suggestions.length === 0) return;
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
      clear();
      setActiveIndex(-1);
    }
  }

  const blank = (
    field: "from" | "to",
    value: string,
    set: (v: string) => void,
    clearResolved: () => void,
    placeholder: string,
    label: string
  ) => (
    <span className="hz-focus inline-block align-baseline md:relative">
      <input
        className="hz-blank font-display font-medium"
        style={{
          width: value.length > 0
            ? `${Math.max(4, value.length + 0.25)}ch`
            : `${placeholder.length + 1}ch`,
        }}
        value={value}
        onChange={(e) => {
          set(e.target.value);
          clearResolved();
          setActiveIndex(-1);
        }}
        onFocus={() => setActiveField(field)}
        onBlur={() => setTimeout(() => { setActiveField((f) => (f === field ? null : f)); clear(); }, 150)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={label}
        role="combobox"
        aria-expanded={activeField === field && suggestions.length > 0}
        aria-controls={`hero-${field}-listbox`}
        aria-autocomplete="list"
        aria-activedescendant={
          activeField === field && activeIndex >= 0 ? `hero-${field}-option-${activeIndex}` : undefined
        }
        autoComplete="off"
      />
      {activeField === field && suggestions.length > 0 && (
        <ul
          id={`hero-${field}-listbox`}
          role="listbox"
          className="absolute inset-x-0 z-30 mt-2 overflow-hidden rounded-field border border-line bg-card text-left shadow-card md:right-auto md:top-full md:w-max md:min-w-[280px] md:max-w-[90vw]"
        >
          {suggestions.map((s, i) => (
            <li key={s.id} id={`hero-${field}-option-${i}`} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s)}
                className={`block min-h-11 w-full px-4 py-3 text-left text-sm font-normal transition-colors ${
                  i === activeIndex ? "bg-accent text-white" : "text-ink hover:bg-fog"
                }`}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );

  return (
    <div ref={rootRef} className="border-t border-ink/30 pt-5">
      {/* Bewust een <div>, geen <p>: de invulvelden dragen een <ul>-listbox en
          een <ul> mag in HTML niet binnen een <p> (hydration-fout). */}
      {/* Onder md hangt de suggestielijst aan deze zin (F-15): volle zinsbreedte,
          verticaal direct onder de regel van het veld (statische positie, geen
          `top`), zodat hij op 375 niet buiten de viewport loopt. Vanaf md hangt
          hij weer aan het veld zelf. */}
      <div className="relative font-display text-[clamp(20px,2.6vw,30px)] font-light leading-[1.6] text-ink md:static">
        {t("voor")} {blank("from", from, setFrom, () => setFromResolved(""), t("phVertrek"), t("ariaVertrek"))} {t("tussen")}{" "}
        {blank("to", to, setTo, () => setToResolved(""), t("phBestemming"), t("ariaBestemming"))}.
      </div>
      <div className="mt-2 font-display text-[clamp(15px,1.7vw,20px)] font-light leading-[1.6] text-ink/75">
        {t("op")}{" "}
        <span className="hz-focus relative inline-block align-baseline">
          <input
            type="date"
            className="hz-blank font-display font-medium"
            style={{ width: "10.5ch" }}
            min={todayISO()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label={t("ariaDatum")}
          />
        </span>{" "}
        {t("om")}{" "}
        <span className="hz-focus relative inline-block align-baseline">
          <input
            type="time"
            className="hz-blank hz-time font-display font-medium"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-label={t("ariaTijd")}
          />
        </span>{" "}
        {t("met")}{" "}
        <span className="hz-focus relative inline-block align-baseline">
          <select
            className="hz-blank font-display font-medium"
            value={luggage}
            onChange={(e) => setLuggage(e.target.value)}
            aria-label={t("ariaBagage")}
          >
            <option value="" disabled>{t("kiesBagage")}</option>
            {HERO_LUGGAGE.map((l) => (
              <option key={l.value} value={l.value}>{t(l.labelKey)}</option>
            ))}
          </select>
        </span>
        .
      </div>
      <div
        ref={resultRef}
        className="mt-4 flex scroll-mb-4 flex-wrap items-baseline gap-x-7 gap-y-3"
        aria-live="polite"
        aria-busy={quote.status === "loading"}
      >
        <Stamp>
          {addressesSet && !quoteReady ? (
            <>{t("kiesDatumTijdBagage")}</>
          ) : quote.status === "ready" ? (
            <>
              {t("vastePrijs")}<Dash />
              <b className="font-semibold text-ink">
                €&nbsp;
                <Odometer value={quote.price} />
              </b>
              <Dash />
              {t("inclBtw")}
            </>
          ) : quote.status === "loading" ? (
            <>{t("berekenen")}</>
          ) : quote.status === "onrequest" ? (
            <>
              {t("opAanvraag")}<Dash />{t("opAanvraagNa")}
            </>
          ) : quote.status === "error" ? (
            quote.reason === "rate_limited" ? (
              <>{t("rateLimited")}<Dash />{t("rateLimitedNa")}</>
            ) : (
              <>{t("fout")}<Dash />{t("foutNa")}</>
            )
          ) : (
            <>
              {t("leeg")}<Dash />{t("leegNa")}
            </>
          )}
        </Stamp>
        <Link
          href={href}
          onClick={onConfirmClick}
          aria-disabled={addressesSet && !quoteReady}
          className={`hz-confirm-btn inline-flex min-h-11 items-center px-7 py-3 text-[12px] font-medium uppercase tracking-[0.14em] text-ink no-underline ${
            addressesSet && !quoteReady ? "cursor-not-allowed opacity-40" : ""
          }`}
        >
          <span>{t("bevestig")}</span>
        </Link>
      </div>
    </div>
  );
}
