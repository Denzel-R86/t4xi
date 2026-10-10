import { formatDuration } from "@/lib/tarieven/route-finder";
import { validateHandoffRide, type HandoffRide } from "@/lib/booking-handoff";

/**
 * "UW RIT" in de RouteFinder (Experience 2.0 PR 2.7) — pure logica, los testbaar.
 *
 * 1. `rideBuildUp`: de prijsopbouw uitsluitend uit velden die de server teruggaf
 *    (`useRouteQuote` → `/api/pricing/quote`). Geen client-side prijslogica, geen
 *    afgeleide componenten: een veld dat de engine niet levert (0) wordt niet getoond.
 * 2. `routeFinderHandoff`: de rit voor de 2.3-handoff (`/boeken?h=1`). Het
 *    handoff-formaat kent alleen een enkele rit; een retour (of tussenstops) kan er
 *    niet in en valt dus terug op de bestaande publieke route (`null`).
 */

/** Serverbevestigde velden van een `ready`-quote die de opbouw mag tonen. */
export type ServerQuoteFields = {
  price: number;
  returnApplied: boolean;
  distanceKm: number;
  estimatedDurationMin: number;
};

export type BuildUpRow =
  | { kind: "fact"; labelKey: "factAfstand" | "factReistijd"; value: string; source: "distanceKm" | "estimatedDurationMin" }
  | { kind: "total"; labelKey: "vastEnkel" | "vastRetour"; amount: number; source: "price" };

export function rideBuildUp(q: ServerQuoteFields): BuildUpRow[] {
  const rows: BuildUpRow[] = [];
  if (Number.isFinite(q.distanceKm) && q.distanceKm > 0) {
    rows.push({ kind: "fact", labelKey: "factAfstand", value: `${q.distanceKm} km`, source: "distanceKm" });
  }
  const duration = formatDuration(q.estimatedDurationMin);
  if (duration) {
    rows.push({ kind: "fact", labelKey: "factReistijd", value: duration, source: "estimatedDurationMin" });
  }
  if (Number.isFinite(q.price) && q.price > 0) {
    rows.push({ kind: "total", labelKey: q.returnApplied ? "vastRetour" : "vastEnkel", amount: q.price, source: "price" });
  }
  return rows;
}

/** Rit voor de handoff, of `null` als die er niet in past (retour, tussenstops, ongeldig). */
export function routeFinderHandoff(input: {
  pickup: string | undefined;
  dropoff: string | undefined;
  date: string;
  time: string;
  passengers: number;
  luggage: string;
  returnTrip: boolean;
  hasStops: boolean;
  quoteId: string;
}): HandoffRide | null {
  if (input.returnTrip || input.hasStops) return null;
  return validateHandoffRide({
    pickup: input.pickup,
    dropoff: input.dropoff,
    date: input.date,
    time: input.time,
    persons: input.passengers,
    luggage: input.luggage,
    quoteId: input.quoteId,
  });
}
