/**
 * Pricing Brain v1 — publieke module-API (pure functies, geen IO).
 */

import type { FactorProvider, FactorConfig, DataStatus } from "./types";
import { baseFactor } from "./factors/base";
import { distanceFactor } from "./factors/distance";
import { durationFactor } from "./factors/duration";
import { airportFactor } from "./factors/airport";
import { vehicleFactor } from "./factors/vehicle";
import { competitorFactor } from "./factors/competitor";
import { premiumBrandFactor } from "./factors/premium-brand";
import { returnProbabilityFactor } from "./factors/return-probability";
import { costFloorFactor } from "./factors/cost-floor";
import { psychologicalFactor } from "./factors/psychological";
import { stubFactors, STUB_FACTOR_KEYS } from "./factors/stubs";

export * from "./types";
export {
  estimateCost,
  round2,
  round3,
  markup,
  DEFAULT_COST_ASSUMPTIONS,
  TARGET_MARGIN,
  MIN_MARGIN,
} from "./cost-model";
export { psychoRound } from "./factors/psychological";
export { decide } from "./decision-engine";

/**
 * Standaard providerlijst in pipeline-volgorde:
 * additive (fare → multiplier → nudges → stubs) → floor → round.
 */
export function buildDefaultProviders(): FactorProvider[] {
  return [
    baseFactor,
    distanceFactor,
    durationFactor,
    airportFactor,
    vehicleFactor,
    competitorFactor,
    premiumBrandFactor,
    returnProbabilityFactor,
    ...stubFactors,
    costFloorFactor,
    psychologicalFactor,
  ];
}

/**
 * Standaard factorconfig (spiegelt de brain_factor_config-seed voor de factoren
 * die in v1 een provider hebben). city/district uit de DB-seed hebben in 8b
 * bewust nog geen provider en staan hier daarom niet — zie openstaande keuzes.
 */
export const DEFAULT_FACTOR_CONFIG: FactorConfig[] = [
  { factorKey: "base", weight: 1.0, maxConfidence: 1.0, enabled: true, dataStatus: "active" },
  { factorKey: "distance", weight: 1.0, maxConfidence: 1.0, enabled: true, dataStatus: "active" },
  { factorKey: "duration", weight: 0.8, maxConfidence: 1.0, enabled: true, dataStatus: "active" },
  { factorKey: "airport", weight: 1.0, maxConfidence: 1.0, enabled: true, dataStatus: "active" },
  { factorKey: "vehicle", weight: 1.0, maxConfidence: 1.0, enabled: true, dataStatus: "active" },
  { factorKey: "cost_floor", weight: 1.0, maxConfidence: 0.7, enabled: true, dataStatus: "estimated" },
  { factorKey: "competitor", weight: 0.9, maxConfidence: 0.6, enabled: true, dataStatus: "estimated" },
  { factorKey: "premium_brand", weight: 0.5, maxConfidence: 1.0, enabled: true, dataStatus: "active" },
  { factorKey: "psychological", weight: 0.3, maxConfidence: 1.0, enabled: true, dataStatus: "active" },
  { factorKey: "return_probability", weight: 0.4, maxConfidence: 0.4, enabled: true, dataStatus: "estimated" },
  ...STUB_FACTOR_KEYS.map(
    (factorKey): FactorConfig => ({
      factorKey,
      weight: 0,
      maxConfidence: 0,
      enabled: true,
      dataStatus: "stub" as DataStatus,
    })
  ),
];
