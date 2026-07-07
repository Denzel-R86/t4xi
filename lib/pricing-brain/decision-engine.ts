import type {
  RouteContext,
  FactorProvider,
  FactorConfig,
  FactorResult,
  PriceDecision,
} from "./types";
import { round2, round3 } from "./cost-model";
import { psychoRound } from "./factors/psychological";

const DISABLED: FactorConfig = {
  factorKey: "",
  weight: 0,
  maxConfidence: 0,
  enabled: false,
  dataStatus: "stub",
};

/**
 * Aggregeert factoren tot een aanbevolen prijs.
 *
 * Pipeline (bewuste volgorde):
 *   1. additive — bouwt het subtotaal op; gewogen bijdrage = weight·amount·min(conf,cap)
 *   2. floor    — tilt het subtotaal naar de kostenondergrens indien lager
 *   3. round    — psychologische afronding
 *
 * De breakdown-bijdragen tellen exact op tot recommendedPrice (zelf-consistent).
 * Stubs (weight 0 / confidence 0) dragen niets bij en beïnvloeden de confidence niet.
 */
export function decide(
  ctx: RouteContext,
  providers: FactorProvider[],
  config: FactorConfig[]
): PriceDecision {
  const cfgMap = new Map(config.map((c) => [c.factorKey, c]));
  const cfgFor = (key: string): FactorConfig => cfgMap.get(key) ?? DISABLED;
  const byStage = (stage: FactorProvider["stage"]) =>
    providers.filter((p) => p.stage === stage);

  const breakdown: FactorResult[] = [];
  let subtotal = 0;
  let basePrice = 0;

  // 1. additive
  for (const p of byStage("additive")) {
    const cfg = cfgFor(p.key);
    const raw = p.compute(ctx, subtotal);
    const effConfidence = Math.min(raw.confidence, cfg.maxConfidence);
    const contribution = cfg.enabled ? round2(cfg.weight * raw.amount * effConfidence) : 0;
    subtotal = round2(subtotal + contribution);
    if (p.key === "base") basePrice = contribution;
    breakdown.push({
      factorKey: p.key,
      contribution,
      confidence: effConfidence,
      explanation: raw.explanation,
      dataStatus: raw.dataStatus,
    });
  }

  // 2. floor (constraint: geen weging op de magnitude — bindt of niet)
  for (const p of byStage("floor")) {
    const cfg = cfgFor(p.key);
    const raw = p.compute(ctx, subtotal);
    const floorTarget = cfg.enabled ? raw.amount : 0;
    const contribution = round2(Math.max(0, floorTarget - subtotal));
    subtotal = round2(subtotal + contribution);
    breakdown.push({
      factorKey: p.key,
      contribution,
      confidence: Math.min(raw.confidence, cfg.maxConfidence),
      explanation: raw.explanation,
      dataStatus: raw.dataStatus,
    });
  }

  const rawRecommendedPrice = subtotal;

  // 3. round (transform: charm-prijs)
  for (const p of byStage("round")) {
    const cfg = cfgFor(p.key);
    const raw = p.compute(ctx, subtotal);
    const target = cfg.enabled ? raw.amount : subtotal;
    const contribution = round2(target - subtotal);
    subtotal = round2(subtotal + contribution);
    breakdown.push({
      factorKey: p.key,
      contribution,
      confidence: Math.min(raw.confidence, cfg.maxConfidence),
      explanation: raw.explanation,
      dataStatus: raw.dataStatus,
    });
  }

  const recommendedPrice = subtotal;

  // Overall confidence: gewogen gemiddelde over enabled factoren met weight > 0.
  // Stubs (weight 0) vallen buiten de noemer en tellen dus niet mee.
  let weightSum = 0;
  let weightedConfidence = 0;
  for (const b of breakdown) {
    const cfg = cfgFor(b.factorKey);
    if (!cfg.enabled || cfg.weight <= 0) continue;
    weightSum += cfg.weight;
    weightedConfidence += cfg.weight * b.confidence;
  }
  const overallConfidence = weightSum > 0 ? round3(weightedConfidence / weightSum) : 0;

  return {
    basePrice,
    recommendedPrice,
    rawRecommendedPrice,
    psychologicalPrice: psychoRound(rawRecommendedPrice),
    overallConfidence,
    breakdown,
    currency: "EUR",
  };
}
