import type { FactorProvider } from "../types";
import { DEFAULT_COST_ASSUMPTIONS, markup, round2 } from "../cost-model";

/** €/km met doelmarge. */
export const DISTANCE_RATE = DEFAULT_COST_ASSUMPTIONS.costPerKm * markup();

export const distanceFactor: FactorProvider = {
  key: "distance",
  stage: "additive",
  compute: (ctx) => ({
    amount: round2(ctx.distanceKm * DISTANCE_RATE),
    confidence: 1,
    explanation: `Afstand ${ctx.distanceKm} km × €${DISTANCE_RATE.toFixed(2)}/km`,
    dataStatus: "active",
  }),
};
