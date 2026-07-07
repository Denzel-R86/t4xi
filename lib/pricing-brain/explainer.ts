/**
 * Pricing Brain — Explainer (Stap 8c).
 *
 * Zet een PriceDecision om in een volledig uitlegbare prijsopbouw:
 * base price → per-factor bijdragen (met confidence + data_status) →
 * recommended price + een korte rationale. Pure functie, geen IO.
 *
 * De zichtbare regels tellen exact op tot recommendedPrice: stub-factoren
 * dragen 0 bij en worden apart als `stubbedFactors` vermeld (transparant,
 * zonder de opbouw te vervuilen).
 */

import type { PriceDecision, PriceExplanation, PriceExplanationLine } from "./types";

const LABELS: Record<string, string> = {
  base: "Basistarief",
  distance: "Afstand",
  duration: "Reistijd",
  airport: "Luchthaventoeslag",
  vehicle: "Voertuigklasse",
  competitor: "Marktpositie",
  premium_brand: "Merkpremie",
  return_probability: "Retourkans",
  cost_floor: "Kostenondergrens",
  psychological: "Psychologische afronding",
};

const labelFor = (key: string): string => LABELS[key] ?? key;

export function explain(decision: PriceDecision): PriceExplanation {
  const lines: PriceExplanationLine[] = decision.breakdown
    .filter((b) => b.dataStatus !== "stub")
    .map((b) => ({
      factorKey: b.factorKey,
      label: labelFor(b.factorKey),
      amount: b.contribution,
      confidence: b.confidence,
      dataStatus: b.dataStatus,
    }));

  const stubbedFactors = decision.breakdown
    .filter((b) => b.dataStatus === "stub")
    .map((b) => b.factorKey);

  const drivers = [...lines]
    .filter((l) => l.amount !== 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 3)
    .map((l) => `${l.label} ${l.amount >= 0 ? "+" : "−"}${Math.abs(l.amount).toFixed(2)}`);

  const rationale =
    `Aanbevolen €${decision.recommendedPrice} ` +
    `(confidence ${Math.round(decision.overallConfidence * 100)}%). ` +
    `Grootste drijvers: ${drivers.join(", ")}.`;

  return {
    basePrice: decision.basePrice,
    lines,
    stubbedFactors,
    rawRecommendedPrice: decision.rawRecommendedPrice,
    recommendedPrice: decision.recommendedPrice,
    overallConfidence: decision.overallConfidence,
    rationale,
    currency: "EUR",
  };
}
