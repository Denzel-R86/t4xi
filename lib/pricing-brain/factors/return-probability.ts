import type { FactorProvider } from "../types";

/**
 * Retourkans-heuristiek per service_type. In v1 GEEN correctie op de enkele-
 * ritprijs (de retourprijs wordt apart bepaald); alleen informatief, met lage
 * confidence tot er echte boekingsdata is.
 */
export const returnProbabilityFactor: FactorProvider = {
  key: "return_probability",
  stage: "additive",
  compute: (ctx) => {
    const likely =
      ctx.serviceType === "airport"
        ? "hoog"
        : ctx.serviceType === "intercity"
          ? "middel"
          : "laag";
    return {
      amount: 0,
      confidence: 0.4,
      explanation: `Retourkans ${likely} — geen enkele-ritcorrectie (v1)`,
      dataStatus: "estimated",
    };
  },
};
