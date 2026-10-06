/**
 * Pure beslislogica voor de hero-boekingszin op mobiel (H-1, F-14).
 * Geen DOM, geen React: de componenten meten, deze functies beslissen.
 */

/** Vanaf deze zichtbare fractie telt de resultaatregel (prijs + "Bevestig") als "in beeld". */
export const STICKY_CTA_RESULT_RATIO = 0.75;
/** Drempels voor de IntersectionObserver op de resultaatregel. */
export const STICKY_CTA_THRESHOLDS = [0, STICKY_CTA_RESULT_RATIO, 1];

export type StickyCtaHiderState = {
  /** Zichtbare fractie (0–1) van de resultaatregel met de hero-CTA. */
  resultRatio: number;
  /** Focus staat ergens binnen de boekingszin. */
  focusWithin: boolean;
};

/**
 * De StickyCta wijkt alleen als de hero-boekingsactie zichtbaar én bruikbaar is:
 * de resultaatregel staat grotendeels in beeld, of de klant is de zin aan het
 * invullen. Een zin die alleen met een randje in beeld staat, telt niet.
 */
export function shouldHideStickyCta(state: StickyCtaHiderState): boolean {
  return state.focusWithin || state.resultRatio >= STICKY_CTA_RESULT_RATIO;
}

/** Wijkt de balk voor minstens één aangemelde zin? Zonder zinnen: nooit. */
export function anyHidesStickyCta(states: Iterable<StickyCtaHiderState>): boolean {
  for (const s of states) if (shouldHideStickyCta(s)) return true;
  return false;
}

export type QuoteOutcome = {
  status: "idle" | "loading" | "ready" | "onrequest" | "error";
  price?: number | null;
  pickup: string;
  dropoff: string;
  date: string;
  time: string;
  luggage: string;
};

/**
 * Sleutel van een geland quote-resultaat. Gelijke sleutel = zelfde uitkomst voor
 * dezelfde rit, dus niets nieuws om te tonen. Null zolang er geen uitkomst is.
 */
export function quoteOutcomeKey(o: QuoteOutcome): string | null {
  if (o.status !== "ready" && o.status !== "onrequest" && o.status !== "error") return null;
  const price = o.status === "ready" ? String(o.price ?? "") : "";
  return JSON.stringify([o.status, price, o.pickup, o.dropoff, o.date, o.time, o.luggage]);
}

/** Minimale vorm van het element met focus (testbaar zonder DOM). */
export type FocusedElementLike = {
  tagName: string;
  type?: string | null;
  role?: string | null;
  isContentEditable?: boolean;
} | null;

const TEXT_INPUT_TYPES = new Set(["", "text", "search", "email", "tel", "url", "number", "password"]);

/** Typt de klant op dit moment tekst (toetsenbord open op mobiel)? */
export function isTextEntry(el: FocusedElementLike): boolean {
  if (!el) return false;
  if (el.role === "combobox" || el.isContentEditable) return true;
  const tag = el.tagName.toUpperCase();
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") return TEXT_INPUT_TYPES.has((el.type ?? "").toLowerCase());
  return false;
}

export type RevealInput = {
  /** quoteOutcomeKey van de huidige uitkomst. */
  key: string | null;
  /** Laatste sleutel die al beoordeeld is (wel of niet gescrold). */
  lastHandledKey: string | null;
  /** getBoundingClientRect() van de resultaatregel. */
  resultTop: number;
  resultBottom: number;
  /** getBoundingClientRect().top van de hele zin. */
  sentenceTop: number;
  viewportHeight: number;
  textEntryFocused: boolean;
};

/**
 * Scrollen we de resultaatregel in beeld? Alleen bij een NIEUWE uitkomst die
 * onder de vouw landt, terwijl de bovenkant van de zin nog in beeld is (de klant
 * is hier bezig, niet elders op de pagina) en er niet in een tekstveld getypt
 * wordt. De aanroeper markeert elke beoordeelde sleutel als afgehandeld: zo is
 * er hoogstens één scroll per uitkomst en geen herhaald verspringen.
 */
export function shouldRevealResult(i: RevealInput): boolean {
  if (i.key === null || i.key === i.lastHandledKey) return false;
  if (i.textEntryFocused) return false;
  const sentenceTopInView = i.sentenceTop >= 0 && i.sentenceTop < i.viewportHeight;
  const belowFold = i.resultBottom > i.viewportHeight;
  return sentenceTopInView && belowFold;
}
