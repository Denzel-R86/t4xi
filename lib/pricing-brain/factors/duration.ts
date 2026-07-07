import type { FactorProvider } from "../types";
import { DEFAULT_COST_ASSUMPTIONS, markup, round2 } from "../cost-model";

/** €/min met doelmarge (incl. retour chauffeurstijd). */
export const DURATION_RATE = DEFAULT_COST_ASSUMPTIONS.costPerMinute * markup();

export const durationFactor: FactorProvider = {
  key: "duration",
  stage: "additive",
  compute: (ctx) => ({
    amount: round2(ctx.estimatedDurationMin * DURATION_RATE),
    confidence: 1,
    explanation: `Reistijd ${ctx.estimatedDurationMin} min × €${DURATION_RATE.toFixed(2)}/min`,
    dataStatus: "active",
  }),
};
