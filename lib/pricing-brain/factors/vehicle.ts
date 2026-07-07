import type { FactorProvider } from "../types";
import { round2 } from "../cost-model";

/**
 * Voertuigklasse-opslag = (multiplier − 1) × lopend subtotaal.
 * Voor de huidige klassen (executive-ev, business) is multiplier 1.0 → geen opslag.
 */
export const vehicleFactor: FactorProvider = {
  key: "vehicle",
  stage: "additive",
  compute: (ctx, subtotal) => {
    const mult = ctx.vehicleMultiplier ?? 1;
    return {
      amount: round2((mult - 1) * subtotal),
      confidence: 1,
      explanation: mult === 1 ? "Standaardklasse (×1.0)" : `Voertuigklasse ×${mult}`,
      dataStatus: "active",
    };
  },
};
