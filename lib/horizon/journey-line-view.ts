/**
 * JourneyLine — weergavemodel (Experience 2.0 §4).
 *
 * Vertaalt een toestand naar wat er getekend en voorgelezen wordt. De component
 * (`components/horizon/JourneyLine.tsx`) zet dit 1-op-1 om naar markup; de CSS
 * (`journey-line.css`) schildert alleen. Zo zit alle beslislogica hier, testbaar.
 */

import type { JourneyState } from "./journey-line-state";

export type JourneyOrientation = "horizontal" | "vertical";
export type JourneySize = "micro" | "inline" | "display";

/** `open` = ○, `filled` = ●, `arriving` = ○ dat aan het eind van de reis ● wordt. */
export type JourneyDot = "open" | "filled" | "arriving";

export type JourneyLineView = {
  /** Lijnlengte als fractie; de CSS gebruikt `scaleX`/`scaleY`, nooit `width`. */
  progress: 0 | 0.5 | 1;
  origin: JourneyDot;
  destination: JourneyDot;
  /** Of het 6px-punt de lijn aflegt (alleen `travelling`). */
  traveller: boolean;
};

const VIEWS: Record<JourneyState, JourneyLineView> = {
  empty: { progress: 0, origin: "open", destination: "open", traveller: false },
  origin: { progress: 0.5, origin: "filled", destination: "open", traveller: false },
  route: { progress: 1, origin: "filled", destination: "open", traveller: false },
  travelling: { progress: 1, origin: "filled", destination: "arriving", traveller: true },
  arrived: { progress: 1, origin: "filled", destination: "filled", traveller: false },
};

export function journeyLineView(state: JourneyState): JourneyLineView {
  return VIEWS[state];
}

function clean(value: string | undefined): string | undefined {
  const v = value?.replace(/\s+/g, " ").trim();
  return v ? v : undefined;
}

/**
 * Toegankelijke naam voor `role="img"`. `label` (al vertaald door de aanroeper)
 * gaat altijd voor; anders een Nederlandse standaard op basis van de plaatsen.
 */
export function journeyLineLabel(input: { from?: string; to?: string; label?: string }): string {
  const label = clean(input.label);
  if (label) return label;
  const from = clean(input.from);
  const to = clean(input.to);
  if (from && to) return `Route van ${from} naar ${to}`;
  if (from) return `Route vanaf ${from}`;
  if (to) return `Route naar ${to}`;
  return "Route nog niet gekozen";
}
