import type { FactorProvider } from "../types";
import { estimateCost, MIN_MARGIN, round2 } from "../cost-model";

/**
 * Floor-stage factor: berekent de kostenondergrens (kosten + minimummarge).
 * De engine tilt het subtotaal hiernaartoe als het eronder ligt (anders 0 bijdrage).
 */
export const costFloorFactor: FactorProvider = {
  key: "cost_floor",
  stage: "floor",
  compute: (ctx) => {
    const cost = estimateCost(ctx.distanceKm, ctx.estimatedDurationMin);
    const floor = round2(cost.total / (1 - MIN_MARGIN));
    return {
      amount: floor,
      confidence: 0.7,
      explanation: `Kostenondergrens (min. ${Math.round(MIN_MARGIN * 100)}% marge): €${floor.toFixed(2)}`,
      dataStatus: "estimated",
    };
  },
};
