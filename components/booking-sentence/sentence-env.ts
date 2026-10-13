"use client";

import { useSyncExternalStore } from "react";
import { amsterdamDepartureIso } from "@/lib/pricing/departure-time";

/* Omgevingshulpen van de boekingszin (uit SentencePattern.tsx gehaald, PR 2.6). */

const DESKTOP_QUERY = "(min-width: 768px)";
function subscribeDesktop(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
/** Desktop-breedte (≥ 768px); server en eerste render: false (mobiel gedrag). */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false
  );
}

/** ISO-datum van vandaag (lokale tijd) — uitsluitend voor de `min`-grens van het HTML-datumveld (dat werkt alleen op dagniveau). */
export function todayISO(): string {
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
export function isFutureAmsterdamDeparture(date: string, time: string): boolean {
  const iso = amsterdamDepartureIso(date, time);
  return iso !== null && new Date(iso).getTime() >= Date.now();
}
