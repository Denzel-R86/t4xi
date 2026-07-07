import type { FactorProvider } from "../types";
import { round2 } from "../cost-model";

/** Hoe ver we het subtotaal richting de marktmid duwen (0..1). */
export const COMPETITOR_NUDGE = 0.5;

/**
 * Nudge richting de geobserveerde marktmid. Zonder marktdata: 0 bijdrage,
 * lage confidence (het model "weet" dan niets over de markt).
 */
export const competitorFactor: FactorProvider = {
  key: "competitor",
  stage: "additive",
  compute: (ctx, subtotal) => {
    const m = ctx.market;
    if (!m) {
      return {
        amount: 0,
        confidence: 0.3,
        explanation: "Geen marktobservatie beschikbaar",
        dataStatus: "estimated",
      };
    }
    return {
      amount: round2(COMPETITOR_NUDGE * (m.mid - subtotal)),
      confidence: m.isEstimate ? 0.6 : 0.9,
      explanation: `Nudge richting marktmid €${m.mid}${m.isEstimate ? " (schatting)" : ""}`,
      dataStatus: m.isEstimate ? "estimated" : "active",
    };
  },
};
