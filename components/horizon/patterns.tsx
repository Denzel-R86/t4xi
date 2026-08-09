"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HORIZON DESIGN LANGUAGE v1 — patronen (de grondwet)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Eén idee: één doorgetrokken horizonlijn draagt elke pagina.
 * Het verhaal staat erboven, de handeling ligt erop, het bewijs staat eronder —
 * zoals de letters van het woordmerk op de weg staan.
 *
 * PATTERN-FIRST. Dit bestand bevat patronen, geen paginacomponenten. Pagina's
 * (homepage, booking, pricing, dashboard, account) COMPONEREN deze patronen;
 * een patroon weet niets van de pagina waarop het staat.
 *
 *   HorizonSpine     — de ruggengraat: de lijn + het Travel-accent (de rit)
 *   Viewport         — een betekenis-dragend beeldvlak met een ritme-slag
 *   NarrativePattern — een tweestemmig statement boven de lijn
 *   SentencePattern  — de handeling als zin: "Ik reis van ___ naar ___"
 *   LedgerPattern    — het grootboek: gegraveerde zekerheden (GEEN pricing
 *                      table: geen kolomkoppen, geen raster, geen knopkolom —
 *                      elke regel is een frase met een feit)
 *   EditorialFigure  — beeld als technische tekening met maatannotaties
 *   VowsPattern      — genummerde beloftes als volle regels (geen kaarten)
 *   ProofPattern     — een citaat óp de lijn + gegraveerd bewijs
 *   Breath           — de adem tussen twee statements (stilte is het patroon)
 *
 * VERTICAAL RITME. Een pagina is geen stapel secties maar een tempo:
 * Stilte → Statement → Adem → Bewijs → Adem → Handeling. Viewports heten naar
 * hun betekenis (Arrival, Recognition, Certainty, Journey, Proof, Invitation) —
 * nooit naar hun inhoud (hero, fleet, reviews).
 *
 * MOTION. Uitsluitend via de Motion Engine (motion.tsx): Reveal, Travel,
 * Guide, Focus, Confirm. Nieuwe animaties bestaan niet.
 *
 * STOP CONDITIONS — stop onmiddellijk en ontwerp opnieuw zodra ontstaat:
 *   · een component dat op een SaaS-template lijkt
 *   · een sectie die op een standaard landingpage lijkt
 *   · een card-grid · een pricing table · een testimonial slider
 *   · een FAQ-accordion · een hero met headline + subheadline + CTA
 *   · glassmorphism · een Apple-kopie · een Blacklane-kopie
 *
 * Het doel is niet een mooiere pagina. Het doel is een taal waarvan iedere
 * toekomstige pagina vanzelf T4XI wordt.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import "./horizon.css";
import { Link } from "@/i18n/navigation";
import Image, { type StaticImageData } from "next/image";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Reveal, Odometer, usePrefersReducedMotion } from "./motion";
import { useAddressSuggestions, type AddressSuggestion } from "@/components/shared/AddressAutocomplete";
import { useRouteQuote } from "@/components/shared/useRouteQuote";
import { useTranslations } from "next-intl";

/* ── de ruggengraat ─────────────────────────────────────────────────────── */

/** De horizonlijn: tekent in bij aankomst (Travel), en draagt het Travel-accent
 *  — een klein segment dat met de scroll langs de lijn reist (de rit van de
 *  pagina zelf; het enige narratieve accent, nooit leidend). */
export function HorizonSpine() {
  const tick = useRef<HTMLSpanElement>(null);
  const reduced = usePrefersReducedMotion();
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const total = document.documentElement.scrollHeight - innerHeight;
        const p = total > 0 ? Math.min(1, Math.max(0, scrollY / total)) : 0;
        if (tick.current) {
          tick.current.style.transform = `translateX(${8 + p * 84}vw)`;
        }
      });
    };
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    return () => {
      removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return (
    <div className={`hz-spine${drawn ? " hz-travel-drawn" : ""}`} aria-hidden="true">
      <span ref={tick} className="hz-travel-tick" />
    </div>
  );
}

/* ── viewport & ritme ───────────────────────────────────────────────────── */

type Meaning = "arrival" | "recognition" | "certainty" | "journey" | "proof" | "invitation";

/** Een betekenis-dragend beeldvlak. `above` eindigt op de lijn, `onLine` ligt
 *  erop, `below` staat eronder. Ritme-slag: statement = volle viewport. */
export function Viewport({
  meaning,
  label,
  id,
  above,
  onLine,
  below,
  first = false,
  compact = false,
}: {
  meaning: Meaning;
  /** Toegankelijke naam van het beeldvlak (aria-label). */
  label: string;
  id?: string;
  above: ReactNode;
  onLine?: ReactNode;
  below?: ReactNode;
  /** Eerste viewport van de pagina: compenseert de vaste header zodat de
   *  naad bij aankomst exact op de spine ligt. */
  first?: boolean;
  /** Compacte afsluitende sectie zonder een geforceerde volledige schermhoogte. */
  compact?: boolean;
}) {
  return (
    <section
      id={id}
      data-viewport={meaning}
      aria-label={label}
      className={`relative grid px-[5vw]${compact ? "" : " min-h-[100svh]"}`}
      style={{
        gridTemplateRows: compact
          ? "auto auto auto"
          : `minmax(calc(var(--hz-y) - ${first ? 68 : 0}px), auto) auto minmax(0, 1fr)`,
      }}
    >
      <div className={`flex flex-col justify-end pb-9 ${compact ? "pt-16 md:pt-20" : "pt-24"}`}>{above}</div>
      <div>{onLine}</div>
      <div className={`${compact ? "pb-12 md:pb-16" : "pb-16"} pt-9`}>{below}</div>
    </section>
  );
}

/** De adem tussen twee statements. Stilte is het patroon — geen inhoud. */
export function Breath() {
  return <div aria-hidden="true" className="h-[22svh]" />;
}

/* ── narrative ──────────────────────────────────────────────────────────── */

/** Tweestemmig statement boven de lijn: een kicker met kastlijntje en een
 *  compositie van draagstem (ink) en echostem (stone). Geen subheadline. */
export function NarrativePattern({
  kicker,
  voice,
  echo,
  note,
  as: Tag = "h2",
}: {
  kicker: string;
  voice: string;
  echo?: string;
  /** Stille steunregel (max één, klein, secundair). */
  note?: string;
  as?: "h1" | "h2";
}) {
  return (
    <div>
      <Reveal>
        <p className="flex items-center gap-3.5 text-[11px] font-medium uppercase tracking-[0.16em] text-secondary">
          <span aria-hidden="true" className="h-px w-8 bg-ink" />
          {kicker}
        </p>
      </Reveal>
      <Reveal delay={1}>
        <Tag className="mt-6 font-display text-[clamp(44px,7.6vw,108px)] font-extrabold leading-[0.98] tracking-[-0.03em] text-ink">
          {voice}
          {echo && (
            <>
              <br />
              <span className="font-light text-stone">{echo}</span>
            </>
          )}
        </Tag>
      </Reveal>
      {note && (
        <Reveal delay={2}>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-secondary">{note}</p>
        </Reveal>
      )}
    </div>
  );
}

/** Gegraveerde regel in de merkcode-opmaak (tijdstempel / feitregel). */
export function Stamp({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={`text-[11px] font-medium uppercase tracking-[0.14em] text-secondary [font-variant-numeric:tabular-nums] ${className}`}
    >
      {children}
    </p>
  );
}

/** Het kastlijntje in een Stamp. */
export function Dash() {
  return (
    <span aria-hidden="true" className="px-2 text-stone">
      —
    </span>
  );
}

/* ── sentence: de handeling als zin ─────────────────────────────────────── */

/** De boekingszin óp de lijn: "Ik reis van ___ naar ___." — het antwoord is de
 *  vaste prijs uit de echte Pricing Engine. Confirm leidt naar de volledige
 *  boekingsflow mét de ingevulde adressen (deep-link — nooit opnieuw zoeken).
 *
 *  Suggesties en prijs komen uit de GEDEELDE bronnen (useAddressSuggestions,
 *  useRouteQuote): dit is dezelfde keten als het boekingsformulier, alleen in
 *  zin-presentatie. Vrije tekst blijft toegestaan. */
export function SentencePattern({ confirmHref = "/boeken" }: { confirmHref?: string }) {
  const t = useTranslations("zin");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fromResolved, setFromResolved] = useState("");
  const [toResolved, setToResolved] = useState("");
  const [activeField, setActiveField] = useState<"from" | "to" | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

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
  const quote = useRouteQuote(pickup, dropoff);

  const href =
    pickup && dropoff
      ? `/boeken?pickup=${encodeURIComponent(pickup.label)}&dropoff=${encodeURIComponent(dropoff.label)}`
      : confirmHref;

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
    <span className="hz-focus relative inline-block align-baseline">
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
          className="absolute left-0 top-full z-30 mt-2 w-max min-w-[280px] max-w-[90vw] overflow-hidden rounded-field border border-line bg-card text-left shadow-card"
        >
          {suggestions.map((s, i) => (
            <li key={s.id} id={`hero-${field}-option-${i}`} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s)}
                className={`block w-full px-4 py-3 text-left text-sm font-normal transition-colors ${
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
    <div className="border-t border-ink/30 pt-5">
      {/* Bewust een <div>, geen <p>: de invulvelden dragen een <ul>-listbox en
          een <ul> mag in HTML niet binnen een <p> (hydration-fout). */}
      <div className="font-display text-[clamp(20px,2.6vw,30px)] font-light leading-[1.6] text-ink">
        {t("voor")} {blank("from", from, setFrom, () => setFromResolved(""), t("phVertrek"), t("ariaVertrek"))} {t("tussen")}{" "}
        {blank("to", to, setTo, () => setToResolved(""), t("phBestemming"), t("ariaBestemming"))}.
      </div>
      <div
        className="mt-4 flex flex-wrap items-baseline gap-x-7 gap-y-3"
        aria-live="polite"
        aria-busy={quote.status === "loading"}
      >
        <Stamp>
          {quote.status === "ready" ? (
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
            <>{t("fout")}<Dash />{t("foutNa")}</>
          ) : (
            <>
              {t("leeg")}<Dash />{t("leegNa")}
            </>
          )}
        </Stamp>
        <Link
          href={href}
          className="hz-confirm-btn px-7 py-3 text-[12px] font-medium uppercase tracking-[0.14em] text-ink no-underline"
        >
          <span>{t("bevestig")}</span>
        </Link>
      </div>
    </div>
  );
}

/* ── ledger: gegraveerde zekerheden ─────────────────────────────────────── */

export type LedgerEntry = {
  phrase: string;
  detail?: string;
  fact: number | string;
  factNote?: string;
  href?: string;
};

/** Het grootboek. GEEN tabel: geen kolomkoppen, geen raster, geen knopkolom.
 *  Elke regel is een frase met een feit, gescheiden door hairlines; hover
 *  onthult de handeling (Guide). */
export function LedgerPattern({
  entries,
  closing,
  actionLabel,
}: {
  entries: LedgerEntry[];
  closing?: ReactNode;
  actionLabel: string;
}) {
  return (
    <div>
      <ul className="list-none">
        {entries.map((e) => {
          const inner = (
            <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-6">
              <span className="font-display text-[clamp(18px,2.3vw,26px)] font-medium text-ink">
                {e.phrase}
              </span>
              {e.detail && <span className="text-sm text-secondary">{e.detail}</span>}
              <span className="ml-auto flex items-baseline gap-3">
                <span className="hz-arrow text-[11px] font-medium uppercase tracking-[0.14em] text-secondary">
                  {actionLabel} →
                </span>
                <span className="font-display text-[clamp(19px,2.3vw,26px)] font-bold text-ink [font-variant-numeric:tabular-nums]">
                  {typeof e.fact === "number" ? <>€&nbsp;{e.fact}</> : e.fact}
                </span>
                {e.factNote && <span className="text-xs uppercase tracking-[0.1em] text-stone">{e.factNote}</span>}
              </span>
            </span>
          );
          return (
            <li key={e.phrase} className="hz-ledger-entry">
              {e.href ? (
                <Link href={e.href} className="hz-guide-line hz-guide-arrow block no-underline">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
      {closing && <div className="pt-5">{closing}</div>}
    </div>
  );
}

/* ── editorial figure: beeld als technische tekening ────────────────────── */

export function EditorialFigure({
  src,
  alt,
  annotations,
  specs,
  aspect = "aspect-[16/9] md:aspect-[21/9]",
}: {
  /** string = losse pad (geen blur); StaticImageData = static import (blur). */
  src: string | StaticImageData;
  alt: string;
  annotations?: { text: string; side: "left" | "right"; top: string }[];
  specs?: { k: string; v: string }[];
  /** Tailwind aspect-ratio classes. Default past bij een full-width figuur. */
  aspect?: string;
}) {
  return (
    <figure>
      <div className={`hz-frame ${aspect}`}>
        <Image src={src} alt={alt} fill sizes="90vw" placeholder={typeof src === "object" ? "blur" : "empty"} className="object-cover saturate-[0.9] contrast-[0.96]" />
        {annotations && annotations.length > 0 && <span className="hz-frame-wash" aria-hidden="true" />}
        {annotations?.map((a) => (
          <span
            key={a.text}
            className={`hz-dim hidden w-[26%] text-[10px] font-medium uppercase tracking-[0.14em] text-secondary md:block ${
              a.side === "left" ? "left-[5%]" : "right-[5%] text-right"
            }`}
            style={{ top: a.top }}
          >
            <i aria-hidden="true" />
            {a.text}
          </span>
        ))}
      </div>
      {specs && (
        <figcaption className="flex flex-wrap border-t border-ink/30">
          {specs.map((s) => (
            <span key={s.k} className="min-w-[42%] flex-1 border-r border-ink/10 py-4 pr-6 last:border-r-0 md:min-w-0">
              <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-stone">{s.k}</span>
              <span className="mt-1 block font-display text-[clamp(15px,1.7vw,20px)] font-bold text-ink [font-variant-numeric:tabular-nums]">
                {s.v}
              </span>
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}

/* ── vows: beloftes als volle regels ────────────────────────────────────── */

export function VowsPattern({ vows }: { vows: { title: string; text: string }[] }) {
  return (
    <div>
      {vows.map((v, i) => (
        <Reveal key={v.title} delay={(Math.min(i, 3) as 0 | 1 | 2 | 3) || 0}>
          <div className="grid grid-cols-[56px_1fr] items-baseline gap-6 border-t border-ink/10 py-8 last:border-b md:grid-cols-[90px_1fr_minmax(0,300px)]">
            <span className="text-[15px] font-light text-stone [font-variant-numeric:tabular-nums]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="font-display text-[clamp(21px,3vw,36px)] font-bold leading-[1.12] tracking-[-0.02em] text-ink">
              {v.title}
            </span>
            <span className="col-start-2 text-sm leading-relaxed text-secondary md:col-start-3 md:text-right">
              {v.text}
            </span>
          </div>
        </Reveal>
      ))}
    </div>
  );
}

/* ── proof: citaat op de lijn ───────────────────────────────────────────── */

export function ProofPattern({
  quote,
  accent,
  stamp,
}: {
  quote: string;
  accent: string;
  stamp: ReactNode;
}) {
  return (
    <div>
      <Reveal>
        <blockquote className="max-w-4xl font-display text-[clamp(28px,4.6vw,60px)] font-light leading-[1.12] tracking-[-0.02em] text-ink">
          “{quote} <b className="font-extrabold">{accent}</b>”
        </blockquote>
      </Reveal>
      <Reveal delay={1}>
        <div className="mt-7">{stamp}</div>
      </Reveal>
    </div>
  );
}
