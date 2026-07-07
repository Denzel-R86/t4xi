/**
 * Pricing Brain — cost model + gedeelde rate-card constanten (Stap 8b).
 * Pure functies. Alle bedragen in euro's, inclusief btw-niveau van de catalogus.
 *
 * De rate-card (base/distance/duration) is afgeleid van dit kostenmodel + een
 * doelmarge, zodat "prijs opbouwen" en "kosten dekken" hetzelfde model zijn.
 * De constanten zijn bewust expliciet en afstembaar (kalibratie = open keuze).
 */

import type { CostAssumptions, CostEstimate } from "./types";

/** Geschatte operationele kosten (premium EV-taxi, incl. dead-head/retour chauffeurstijd). */
export const DEFAULT_COST_ASSUMPTIONS: CostAssumptions = {
  fixedOverhead: 7,
  costPerKm: 0.42,
  costPerMinute: 0.72,
};

/** Doelmarge voor de rate-card markup (bepaalt base/distance/duration-tarieven). */
export const TARGET_MARGIN = 0.35;

/** Minimale marge die de cost-floor afdwingt. */
export const MIN_MARGIN = 0.2;

export const round2 = (x: number): number => Math.round(x * 100) / 100;
export const round3 = (x: number): number => Math.round(x * 1000) / 1000;

/** Markup-factor die kosten omzet naar een prijs met de gegeven doelmarge. */
export const markup = (margin: number = TARGET_MARGIN): number => 1 / (1 - margin);

/** Geschatte kostprijs van een enkele rit. */
export function estimateCost(
  distanceKm: number,
  durationMin: number,
  a: CostAssumptions = DEFAULT_COST_ASSUMPTIONS
): CostEstimate {
  const distanceCost = round2(distanceKm * a.costPerKm);
  const timeCost = round2(durationMin * a.costPerMinute);
  return {
    total: round2(a.fixedOverhead + distanceCost + timeCost),
    fixedOverhead: a.fixedOverhead,
    distanceCost,
    timeCost,
    assumptions: a,
  };
}
