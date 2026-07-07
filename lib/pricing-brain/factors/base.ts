import type { FactorProvider } from "../types";
import { DEFAULT_COST_ASSUMPTIONS, markup, round2 } from "../cost-model";

/** Vaste basiscomponent = overhead met doelmarge. */
export const BASE_FARE = round2(DEFAULT_COST_ASSUMPTIONS.fixedOverhead * markup());

export const baseFactor: FactorProvider = {
  key: "base",
  stage: "additive",
  compute: () => ({
    amount: BASE_FARE,
    confidence: 1,
    explanation: `Vaste basiscomponent €${BASE_FARE.toFixed(2)}`,
    dataStatus: "active",
  }),
};
