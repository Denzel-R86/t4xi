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
}: {
  children: ReactNode;
  /** 0..3 — trapsgewijze vertraging binnen één compositie. */
  delay?: 0 | 1 | 2 | 3;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
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
  }, []);
  const d = delay > 0 ? ` hz-d${delay}` : "";
  return (
    <div ref={ref} className={`hz-reveal${d} ${className}`}>
      {children}
    </div>
  );
}

/** CONFIRM — cijfers rollen naar hun waarde (odometer). */
export function Odometer({ value, className = "" }: { value: number | null; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const [live, setLive] = useState(false);
  const digits = value === null ? [] : String(value).split("");
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

  if (value === null) return <span className={className}>—</span>;
  return (
    <span className={`hz-confirm-roll${live ? " hz-live" : ""} ${className}`} aria-label={String(value)}>
      {digits.map((ch, i) => (
        <span
          key={`${i}-${digits.length}`}
          className="hz-col"
          aria-hidden="true"
          style={{ transform: live ? `translateY(-${Number(ch) * 1.15}em)` : "translateY(0)" }}
        >
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </span>
      ))}
    </span>
  );
}
