/**
 * Pricing Brain — Simulator (Stap 8e).
 *
 * Pure what-if engine: gegeven een set routes (prijs + kosten-drivers + het
 * bestaande brain-advies) berekent hij het effect van een scenario op prijs,
 * kosten en marge. Geen IO, geen DB, geen side effects, geen prijswijzigingen —
 * puur rekenwerk voor rapportage.
 *
 * Een scenario is een pure transformatie:
 *   - newPrice(route)  → de gesimuleerde prijs (null ⇒ prijs ongewijzigd)
 *   - costAssumptions  → aangepaste kostenbasis (bv. energie +20%)
 */

import type { CostAssumptions, ServiceType, RecommendationAction } from "./types";
import { estimateCost, round2, round3, DEFAULT_COST_ASSUMPTIONS } from "./cost-model";

/** Minimale route-input die de simulator nodig heeft (ontkoppeld van de DB). */
export type SimRouteInput = {
  pickupSlug: string;
  dropoffSlug: string;
  vehicleClassCode: string;
  serviceType: ServiceType;
  distanceKm: number;
  estimatedDurationMin: number;
  /** Huidige enkele-ritprijs. */
  price: number;
  /** Advies uit de Recommendation Engine (voor het "pas RAISE toe"-scenario). */
  recommendedAction: RecommendationAction;
  recommendedToPrice: number | null;
};

export type SimScenario = {
  key: string;
  label: string;
  /** Kostenbasis voor dit scenario (default = huidige aannames). */
  costAssumptions: CostAssumptions;
  /** Nieuwe prijs voor een route, of null als de prijs ongewijzigd blijft. */
  newPrice: (route: SimRouteInput) => number | null;
};

export type RouteSimResult = {
  pickupSlug: string;
  dropoffSlug: string;
  vehicleClassCode: string;
  serviceType: ServiceType;
  beforePrice: number;
  afterPrice: number;
  beforeCost: number;
  afterCost: number;
  beforeMargin: number;
  afterMargin: number;
  beforeMarginPct: number;
  afterMarginPct: number;
  changed: boolean;
  becameLossMaking: boolean;
};

export type SimReport = {
  scenarioKey: string;
  scenarioLabel: string;
  routesTotal: number;
  routesAffected: number;
  revenueBefore: number;
  revenueAfter: number;
  revenueDelta: number;
  revenueDeltaPct: number;
  marginBefore: number;
  marginAfter: number;
  marginDelta: number;
  avgMarginPctBefore: number;
  avgMarginPctAfter: number;
  lossMakingBefore: number;
  lossMakingAfter: number;
  becameLossMaking: RouteSimResult[];
  results: RouteSimResult[];
};

const pct = (part: number, whole: number): number => (whole > 0 ? round2((part / whole) * 100) : 0);

export function simulateRoute(route: SimRouteInput, scenario: SimScenario): RouteSimResult {
  const beforeCost = estimateCost(route.distanceKm, route.estimatedDurationMin).total;
  const afterCost = estimateCost(route.distanceKm, route.estimatedDurationMin, scenario.costAssumptions).total;

  const beforePrice = route.price;
  const proposed = scenario.newPrice(route);
  const afterPrice = proposed === null ? beforePrice : round2(proposed);

  const beforeMargin = round2(beforePrice - beforeCost);
  const afterMargin = round2(afterPrice - afterCost);

  return {
    pickupSlug: route.pickupSlug,
    dropoffSlug: route.dropoffSlug,
    vehicleClassCode: route.vehicleClassCode,
    serviceType: route.serviceType,
    beforePrice,
    afterPrice,
    beforeCost,
    afterCost,
    beforeMargin,
    afterMargin,
    beforeMarginPct: pct(beforeMargin, beforePrice),
    afterMarginPct: pct(afterMargin, afterPrice),
    changed: afterPrice !== beforePrice || afterCost !== beforeCost,
    becameLossMaking: beforeMargin >= 0 && afterMargin < 0,
  };
}

export function simulate(routes: SimRouteInput[], scenario: SimScenario): SimReport {
  const results = routes.map((r) => simulateRoute(r, scenario));

  const revenueBefore = round2(results.reduce((s, r) => s + r.beforePrice, 0));
  const revenueAfter = round2(results.reduce((s, r) => s + r.afterPrice, 0));
  const marginBefore = round2(results.reduce((s, r) => s + r.beforeMargin, 0));
  const marginAfter = round2(results.reduce((s, r) => s + r.afterMargin, 0));
  const n = results.length;

  return {
    scenarioKey: scenario.key,
    scenarioLabel: scenario.label,
    routesTotal: n,
    routesAffected: results.filter((r) => r.changed).length,
    revenueBefore,
    revenueAfter,
    revenueDelta: round2(revenueAfter - revenueBefore),
    revenueDeltaPct: pct(revenueAfter - revenueBefore, revenueBefore),
    marginBefore,
    marginAfter,
    marginDelta: round2(marginAfter - marginBefore),
    avgMarginPctBefore: n > 0 ? round2(results.reduce((s, r) => s + r.beforeMarginPct, 0) / n) : 0,
    avgMarginPctAfter: n > 0 ? round2(results.reduce((s, r) => s + r.afterMarginPct, 0) / n) : 0,
    lossMakingBefore: results.filter((r) => r.beforeMargin < 0).length,
    lossMakingAfter: results.filter((r) => r.afterMargin < 0).length,
    becameLossMaking: results.filter((r) => r.becameLossMaking),
    results,
  };
}

// ── Scenario builders (puur) ─────────────────────────────────────────────────

function scaleAssumptions(a: CostAssumptions, factor: number): CostAssumptions {
  return {
    fixedOverhead: round2(a.fixedOverhead * factor),
    costPerKm: round3(a.costPerKm * factor),
    costPerMinute: round3(a.costPerMinute * factor),
  };
}

/** Prijsverhoging met een percentage voor één service_type. */
export function scenarioServiceTypePct(service: ServiceType, percent: number): SimScenario {
  return {
    key: `pct_${service}_${percent}`,
    label: `Alle ${service}-routes ${percent >= 0 ? "+" : ""}${percent}%`,
    costAssumptions: DEFAULT_COST_ASSUMPTIONS,
    newPrice: (r) => (r.serviceType === service ? r.price * (1 + percent / 100) : null),
  };
}

/** Custom prijsverhoging per service_type. */
export function scenarioCustomByService(map: Partial<Record<ServiceType, number>>): SimScenario {
  const parts = Object.entries(map).map(([k, v]) => `${k} ${(v as number) >= 0 ? "+" : ""}${v}%`);
  return {
    key: "custom_by_service",
    label: `Custom per service_type (${parts.join(", ") || "geen"})`,
    costAssumptions: DEFAULT_COST_ASSUMPTIONS,
    newPrice: (r) => {
      const p = map[r.serviceType];
      return p === undefined ? null : r.price * (1 + p / 100);
    },
  };
}

/** Kostenstijging (bv. energie) met een percentage — prijs blijft gelijk. */
export function scenarioCostIncrease(percent: number): SimScenario {
  return {
    key: `cost_increase_${percent}`,
    label: `Energie-/kostenstijging +${percent}% (prijs ongewijzigd)`,
    costAssumptions: scaleAssumptions(DEFAULT_COST_ASSUMPTIONS, 1 + percent / 100),
    newPrice: () => null,
  };
}

/** Pas uitsluitend de RAISE/RAISE_URGENT-adviezen van de Brain toe. */
export function scenarioApplyRaises(): SimScenario {
  return {
    key: "apply_raises",
    label: "Alleen RAISE/RAISE_URGENT adviezen toepassen",
    costAssumptions: DEFAULT_COST_ASSUMPTIONS,
    newPrice: (r) =>
      (r.recommendedAction === "RAISE" || r.recommendedAction === "RAISE_URGENT") && r.recommendedToPrice !== null
        ? r.recommendedToPrice
        : null,
  };
}
