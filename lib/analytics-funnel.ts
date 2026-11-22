/**
 * Funnelmeting met lokale deduplicatie (meetplan Fase 6, herzien 2026-11-22).
 *
 * Regels:
 * - quote_requested: één keer per UNIEKE, daadwerkelijk gestarte prijsaanvraag
 *   per pagina. Een andere rit of gewijzigde prijsbepalende invoer telt opnieuw.
 * - quote_shown / quote_on_request: één keer per unieke aanvraag per pagina, en
 *   pas wanneer het resultaat zichtbaar is (de aanroeper bepaalt dat moment).
 * - booking_started: één keer per rit per browsersessie, over homepage,
 *   routezoeker en /boeken heen.
 * - payment_completed: één keer per bevestigde betaling per browsersessie.
 *
 * Deduplicatie gebeurt uitsluitend lokaal. De sleutels zijn korte hashes van de
 * ritinvoer of het boekingskenmerk en verlaten de browser nooit: ze gaan niet
 * naar GA4. Zonder actuele statistiektoestemming wordt niets verstuurd én niets
 * als "gemeld" gemarkeerd, zodat een later gegeven toestemming niets mist.
 *
 * BEPERKING: client-side deduplicatie is geen exactly-once-garantie over
 * verschillende tabbladen-sessies, apparaten of browsers heen. De echte telling
 * van boekingen en betalingen blijft de database (bookings, payment status).
 */

import { track, type AnalyticsProps } from "./analytics";

/** FNV-1a (32-bit) als hex — kort, deterministisch, alleen voor lokale sleutels. */
export function funnelKey(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

type FunnelWindow = Window & { __t4xiStatisticsConsent?: boolean };

function win(): FunnelWindow | null {
  return typeof window === "undefined" ? null : (window as FunnelWindow);
}

function hasStatisticsConsent(): boolean {
  return win()?.__t4xiStatisticsConsent === true;
}

function currentPath(): string {
  return win()?.location?.pathname ?? "";
}

// ── Per pagina (geheugen) ──────────────────────────────────────────────────
let pagePath: string | null = null;
const requestedKeys = new Set<string>();
const resultKeys = new Set<string>();

function syncPage(): void {
  const path = currentPath();
  if (path !== pagePath) {
    pagePath = path;
    requestedKeys.clear();
    resultKeys.clear();
  }
}

/** Een prijsaanvraag is daadwerkelijk gestart (na debounce, niet geannuleerd). */
export function reportQuoteRequested(rideKey: string): void {
  if (!hasStatisticsConsent()) return;
  syncPage();
  if (requestedKeys.has(rideKey)) return;
  requestedKeys.add(rideKey);
  track("quote_requested");
}

export type QuoteOutcome = {
  onRequest: boolean;
  airport: boolean;
  returnTrip: boolean;
  priceKind: "vaste_route" | "afstand" | "op_aanvraag" | "onbekend";
  night?: boolean;
  stops?: number;
};

/** Het resultaat van een aanvraag is zichtbaar geworden. */
export function reportQuoteResult(rideKey: string, outcome: QuoteOutcome): void {
  if (!hasStatisticsConsent()) return;
  syncPage();
  const key = `${rideKey}|${outcome.onRequest ? "r" : "s"}`;
  if (resultKeys.has(key)) return;
  resultKeys.add(key);
  const props: AnalyticsProps = {
    airport: outcome.airport,
    trip_type: outcome.returnTrip ? "retour" : "enkel",
    price_kind: outcome.onRequest ? "op_aanvraag" : outcome.priceKind,
  };
  if (!outcome.onRequest) props.night = Boolean(outcome.night);
  if (typeof outcome.stops === "number") props.stops = outcome.stops;
  track(outcome.onRequest ? "quote_on_request" : "quote_shown", props);
}

// ── Per browsersessie (sessionStorage, met geheugen als terugval) ─────────
const memoryFallback = new Map<string, Set<string>>();
const SESSION_LIMIT = 50;

function sessionSet(name: string): { has: (k: string) => boolean; add: (k: string) => void } {
  const storageKey = `t4xi_funnel_${name}`;
  const read = (): string[] => {
    try {
      const raw = win()?.sessionStorage?.getItem(storageKey);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [...(memoryFallback.get(storageKey) ?? [])];
    }
  };
  return {
    has: (k) => read().includes(k) || Boolean(memoryFallback.get(storageKey)?.has(k)),
    add: (k) => {
      const mem = memoryFallback.get(storageKey) ?? new Set<string>();
      mem.add(k);
      memoryFallback.set(storageKey, mem);
      try {
        const next = [...read().filter((x) => x !== k), k].slice(-SESSION_LIMIT);
        win()?.sessionStorage?.setItem(storageKey, JSON.stringify(next));
      } catch {
        // opslag geweigerd: het geheugen houdt de deduplicatie voor deze pagina vast
      }
    },
  };
}

/** Sleutel voor "dezelfde rit" over homepage, routezoeker en /boeken heen. */
export function bookingRideKey(ride: { pickup?: string | null; dropoff?: string | null; date?: string; time?: string }): string {
  return funnelKey(JSON.stringify([ride.pickup ?? "", ride.dropoff ?? "", ride.date ?? "", ride.time ?? ""]));
}

export function reportBookingStarted(rideKey: string, props?: AnalyticsProps): void {
  if (!hasStatisticsConsent()) return;
  const seen = sessionSet("booking_started");
  if (seen.has(rideKey)) return;
  seen.add(rideKey);
  track("booking_started", props);
}

export function reportPaymentCompleted(paymentKey: string, props: AnalyticsProps): void {
  if (!hasStatisticsConsent()) return;
  const seen = sessionSet("payment_completed");
  if (seen.has(paymentKey)) return;
  seen.add(paymentKey);
  track("payment_completed", props);
}

/** Alleen voor tests. */
export function resetFunnelForTests(): void {
  pagePath = null;
  requestedKeys.clear();
  resultKeys.clear();
  memoryFallback.clear();
}
