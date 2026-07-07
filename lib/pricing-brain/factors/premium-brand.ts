import type { FactorProvider } from "../types";
import { round2 } from "../cost-model";

/** Merkopslag (vóór weging in de config). */
export const BRAND_UPLIFT_PCT = 0.07;

export const premiumBrandFactor: FactorProvider = {
  key: "premium_brand",
  stage: "additive",
  compute: (_ctx, subtotal) => ({
    amount: round2(BRAND_UPLIFT_PCT * subtotal),
    confidence: 1,
    explanation: "T4XI merkopslag (premium positionering)",
    dataStatus: "active",
  }),
};
