/**
 * Pricing Brain Dashboard (Stap 8f) — pure afgeleide metrics.
 * Geen IO, geen nieuwe businesslogica: alleen aggregatie/sortering van de
 * al door de Brain doorgerekende routes voor de Overview/Metrics-panelen.
 */

import type { RecommendationAction } from "@/lib/pricing-brain";
import type { BrainRouteView } from "./types";

export const ACTION_ORDER: RecommendationAction[] = [
  "RAISE_URGENT",
  "RAISE",
  "LOWER",
  "REPRICE_PSYCH",
  "POSITION_PREMIUM",
  "MANUAL_REVIEW",
  "HOLD",
];

export type BrainOverview = {
  routeCount: number;
  avgMarginPct: number;
  avgConfidence: number;
  lossMakingCount: number;
  counts: Record<RecommendationAction, number>;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export function buildOverview(routes: BrainRouteView[]): BrainOverview {
  const counts = ACTION_ORDER.reduce(
    (acc, a) => ({ ...acc, [a]: 0 }),
    {} as Record<RecommendationAction, number>
  );
  let marginSum = 0;
  let confSum = 0;
  let loss = 0;
  for (const r of routes) {
    counts[r.action] += 1;
    marginSum += r.marginPct;
    confSum += r.overallConfidence;
    if (r.marginEur < 0) loss += 1;
  }
  const n = routes.length;
  return {
    routeCount: n,
    avgMarginPct: n > 0 ? round2(marginSum / n) : 0,
    avgConfidence: n > 0 ? round3(confSum / n) : 0,
    lossMakingCount: loss,
    counts,
  };
}

/** Grootste opwaartse kans: aanbevolen prijs boven de huidige prijs. */
export function topOpportunities(routes: BrainRouteView[], n: number): BrainRouteView[] {
  return [...routes]
    .filter((r) => r.recommendedPrice > r.currentPrice)
    .sort((a, b) => b.recommendedPrice - b.currentPrice - (a.recommendedPrice - a.currentPrice))
    .slice(0, n);
}

/** Grootste risico: laagste marge (verliesgevend eerst). */
export function topRisks(routes: BrainRouteView[], n: number): BrainRouteView[] {
  return [...routes].sort((a, b) => a.marginPct - b.marginPct).slice(0, n);
}

export function highestMargins(routes: BrainRouteView[], n: number): BrainRouteView[] {
  return [...routes].sort((a, b) => b.marginPct - a.marginPct).slice(0, n);
}

export function lowestMargins(routes: BrainRouteView[], n: number): BrainRouteView[] {
  return [...routes].sort((a, b) => a.marginPct - b.marginPct).slice(0, n);
}
