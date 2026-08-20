"use client";

/**
 * HORIZON DESIGN LANGUAGE v1 — Motion Engine.
 *
 * Alle beweging op de site komt uit dít systeem en is één van vijf werkwoorden:
 *
 *   Reveal  — content stijgt óp naar de lijn (enter-on-scroll)
 *   Travel  — iets beweegt langs/over de horizon (ambient; zie HorizonSpine)
 *   Guide   — richting bij hover/focus (CSS: .hz-guide-*)
 *   Focus   — aandacht bij interactie (CSS: .hz-focus)
 *   Confirm — een voltooide handeling bevestigt zich (Odometer, .hz-confirm-btn)
 *
 * Eén easing (chauffeur-curve), drie tempo's (immediate/composed/cinematic) —
 * vastgelegd in horizon.css. Een animatie die geen werkwoord is, bestaat niet.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatEuroAmount } from "@/lib/format/currency";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** REVEAL — kinderen stijgen naar de lijn zodra ze in beeld komen. */
export function Reveal({
  children,
  delay = 0,
  className = "",
  immediate = false,
}: {
  children: ReactNode;
  /** 0..3 — trapsgewijze vertraging binnen één compositie. */
  delay?: 0 | 1 | 2 | 3;
  className?: string;
  /**
   * Laat content direct zichtbaar starten. Bedoeld voor inhoud boven de vouw:
   * die mag niet op hydratatie of IntersectionObserver wachten voordat de
   * bezoeker iets ziet.
   */
  immediate?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (immediate) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("hz-in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.18 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [immediate]);
  const d = delay > 0 ? ` hz-d${delay}` : "";
  if (immediate) {
    return <div className={className}>{children}</div>;
  }
  return (
    <div ref={ref} className={`hz-reveal${d} ${className}`}>
      {children}
    </div>
  );
}

/**
 * CONFIRM — cijfers rollen naar hun waarde (odometer).
 *
 * 2026-08-19 (hotfix): `value` mag sinds het pickup-aanrijmodel een niet-hele-
 * euro-bedrag zijn (bv. 95,80 i.p.v. altijd een geheel getal). De oude
 * implementatie deed `String(value).split("")` en behandelde ELK teken —ook de
 * "."— als rollende cijferkolom: `Number(".")` is `NaN`, dus die kolom bleef op
 * stand "0" hangen. Zichtbaar resultaat: "95,8" werd "9508" (de "." verdween
 * spoorloos, alsof hij een extra cijfer was). Nu via de centrale
 * `formatEuroAmount()` (twee decimalen, komma) geformatteerd; uitsluitend
 * 0-9-tekens krijgen nog de rollende behandeling, "," en eventuele spaties
 * worden als statische tekens getoond.
 */
export function Odometer({ value, className = "" }: { value: number | null; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const [live, setLive] = useState(false);
  const formatted = value === null ? null : formatEuroAmount(value);
  const chars = formatted === null ? [] : formatted.split("");
  useEffect(() => {
    // eerst op 0-stand renderen, dan (één frame later) naar de waarde rollen
    setLive(false);
    if (value === null || reduced) {
      setLive(true);
      return;
    }
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setLive(true)));
    return () => cancelAnimationFrame(t);
  }, [value, reduced]);

  if (formatted === null) return <span className={className}>—</span>;
  return (
    <span className={`hz-confirm-roll${live ? " hz-live" : ""} ${className}`} aria-label={formatted}>
      {chars.map((ch, i) =>
        /[0-9]/.test(ch) ? (
          <span
            key={`${i}-${chars.length}`}
            className="hz-col"
            aria-hidden="true"
            style={{ transform: live ? `translateY(-${Number(ch) * 1.15}em)` : "translateY(0)" }}
          >
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </span>
        ) : (
          <span key={`${i}-static`} aria-hidden="true">
            {ch}
          </span>
        )
      )}
    </span>
  );
}
