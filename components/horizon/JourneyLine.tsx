import type { CSSProperties } from "react";
import type { JourneyState } from "@/lib/horizon/journey-line-state";
import {
  journeyLineLabel,
  journeyLineView,
  type JourneyOrientation,
  type JourneySize,
} from "@/lib/horizon/journey-line-view";
import "./journey-line.css";

/**
 * HORIZON v2 — JourneyLine (Experience 2.0 §4).
 *
 * A → B als één lijn met begin- en eindpunt. Server-renderbaar: geen hooks,
 * geen effecten; beweging zit volledig in `journey-line.css`.
 *
 * De aanroeper bepaalt `state` met de pure functies uit
 * `lib/horizon/journey-line-state.ts` (`journeyStateFor` → `journeyTransition`),
 * zodat `arrived` alleen volgt op een backend-bevestigde quote.
 *
 * Geadopteerd: hero-boekingszin (PR 2.1); overige toepassingen volgen per fase.
 */
export type JourneyLineProps = {
  /** Vertrekplaats, bv. "Almere Poort" (hoofdletters via CSS). */
  from?: string;
  /** Bestemming, bv. "Schiphol". */
  to?: string;
  /** Kleine regel onder de vertrekplaats, bv. "07:00". */
  fromMeta?: string;
  toMeta?: string;
  state: JourneyState;
  orientation?: JourneyOrientation;
  size?: JourneySize;
  /** `true` → `aria-hidden`; gebruik als dezelfde route al als tekst ernaast staat. */
  decorative?: boolean;
  /** Vertaalde toegankelijke naam; standaard "Route van X naar Y". */
  label?: string;
  className?: string;
};

export default function JourneyLine({
  from,
  to,
  fromMeta,
  toMeta,
  state,
  orientation = "horizontal",
  size = "inline",
  decorative = false,
  label,
  className = "",
}: JourneyLineProps) {
  const view = journeyLineView(state);
  const showText = size !== "micro";
  const a11y = decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": journeyLineLabel({ from, to, label }) } as const);

  return (
    <div
      {...a11y}
      data-state={state}
      className={`hz-jl hz-jl--${orientation} hz-jl--${size} ${className}`.trim()}
      style={{ "--jl-progress": view.progress } as CSSProperties}
    >
      {showText && (from || fromMeta) ? (
        <span className="hz-jl-end hz-jl-end--from">
          {from ? <span className="hz-jl-name">{from}</span> : null}
          {fromMeta ? <span className="hz-jl-meta">{fromMeta}</span> : null}
        </span>
      ) : null}
      <span className="hz-jl-track" aria-hidden="true">
        <span className="hz-jl-ghost" />
        <span className="hz-jl-rule" />
        <span className="hz-jl-dot hz-jl-dot--from" data-dot={view.origin} />
        <span className="hz-jl-dot hz-jl-dot--to" data-dot={view.destination} />
        {view.traveller ? <span className="hz-jl-run" /> : null}
      </span>
      {showText && (to || toMeta) ? (
        <span className="hz-jl-end hz-jl-end--to">
          {to ? <span className="hz-jl-name">{to}</span> : null}
          {toMeta ? <span className="hz-jl-meta">{toMeta}</span> : null}
        </span>
      ) : null}
    </div>
  );
}
