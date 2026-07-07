/**
 * Pricing Brain — Recommendation Engine (Stap 8c).
 *
 * Vertaalt een PriceDecision + route-context naar een strategisch ADVIES
 * (geen prijs, maar een actie + onderbouwing). Pure functie, geen IO.
 *
 * De eerste passende regel wint (volgorde = prioriteit): verlies gaat vóór
 * lage-confidence, die gaat vóór marge, markt, en psychologie.
 */

import type {
  RouteContext,
  PriceDecision,
  Recommendation,
  RecommendationAction,
  RecommendationThresholds,
} from "./types";
import { estimateCost, TARGET_MARGIN, markup, round2 } from "./cost-model";
import { psychoRound } from "./factors/psychological";

/** Retourfactor (consistent met het bestaande retourmodel). */
export const RETURN_MULTIPLIER = 1.8;

export const DEFAULT_THRESHOLDS: RecommendationThresholds = {
  minConfidence: 0.5,
  lowMarginPct: 0.15,
  healthyMarginPct: 0.3,
  highMarginPct: 0.55,
  psychDelta: 3,
};

export function recommend(
  ctx: RouteContext,
  decision: PriceDecision,
  thresholds: RecommendationThresholds = DEFAULT_THRESHOLDS
): Recommendation {
  const cost = estimateCost(ctx.distanceKm, ctx.estimatedDurationMin);
  const current = ctx.currentPrice;
  const marginRatio = current > 0 ? (current - cost.total) / current : 0;
  const currentMarginPct = round2(marginRatio * 100);
  const psychTarget = psychoRound(current);
  const psychDelta = Math.abs(current - psychTarget);
  const recommended = decision.recommendedPrice;
  const conf = decision.overallConfidence;
  const market = ctx.market;
  /** Doelprijs op basis van kosten + doelmarge, psychologisch afgerond. */
  const targetMarginPrice = psychoRound(cost.total * markup(TARGET_MARGIN));

  let action: RecommendationAction;
  let toPrice: number | null;
  let rationale: string;

  if (marginRatio < 0) {
    action = "RAISE_URGENT";
    toPrice = Math.max(recommended, targetMarginPrice);
    rationale = `Verliesgevend: marge ${currentMarginPct}% (kosten €${cost.total.toFixed(2)} > prijs €${current}). Verhoog naar €${toPrice}.`;
  } else if (conf < thresholds.minConfidence) {
    action = "MANUAL_REVIEW";
    toPrice = null;
    rationale = `Lage confidence (${conf}); onvoldoende basis voor een automatisch prijsadvies. Handmatig beoordelen.`;
  } else if (marginRatio < thresholds.lowMarginPct) {
    action = "RAISE";
    toPrice = recommended > current ? recommended : targetMarginPrice;
    rationale = `Dunne marge ${currentMarginPct}% (< ${Math.round(thresholds.lowMarginPct * 100)}%). Verhoog naar €${toPrice}.`;
  } else if (market && current < market.low && marginRatio < thresholds.healthyMarginPct) {
    action = "RAISE";
    toPrice = Math.max(recommended, market.low);
    rationale = `Onder marktondergrens (€${market.low}) met matige marge ${currentMarginPct}%. Verhoog naar €${toPrice}.`;
  } else if (market && current < market.low) {
    action = "POSITION_PREMIUM";
    toPrice = Math.max(recommended, market.low);
    rationale = `Onder de markt (€${market.low}) terwijl de marge gezond is (${currentMarginPct}%). Premium positionering onvoldoende — overweeg €${toPrice}.`;
  } else if (market && current > market.high && marginRatio > thresholds.highMarginPct) {
    action = "LOWER";
    toPrice = recommended < current ? recommended : market.high;
    rationale = `Boven marktbovengrens (€${market.high}) met hoge marge ${currentMarginPct}%. Overweeg verlagen naar €${toPrice}.`;
  } else if (psychDelta >= thresholds.psychDelta) {
    action = "REPRICE_PSYCH";
    toPrice = psychTarget;
    rationale = `Prijs €${current} is geen charm-prijs. €${psychTarget} converteert psychologisch beter.`;
  } else {
    action = "HOLD";
    toPrice = null;
    rationale = `Marge ${currentMarginPct}% gezond, marktconform en charm-geprijsd. Geen actie.`;
  }

  const toReturnPrice = toPrice !== null ? Math.round(toPrice * RETURN_MULTIPLIER) : null;
  const expectedMarginPct =
    toPrice !== null && toPrice > 0 ? round2(((toPrice - cost.total) / toPrice) * 100) : null;

  return {
    action,
    fromPrice: current,
    toPrice,
    fromReturnPrice: ctx.currentReturnPrice,
    toReturnPrice,
    rationale,
    confidence: conf,
    currentMarginPct,
    expectedMarginPct,
  };
}
