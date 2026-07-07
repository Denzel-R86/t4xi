import type { FactorProvider } from "../types";

/** Psychologische afronding → dichtstbijzijnde bedrag dat op 5 of 9 eindigt. */
export function psychoRound(x: number): number {
  const m = Math.round(x / 5) * 5;
  return m % 10 === 0 ? m - 1 : m;
}

/**
 * Round-stage factor: levert de charm-prijs voor het lopende subtotaal.
 * De engine zet de bijdrage om in (charm − subtotaal).
 */
export const psychologicalFactor: FactorProvider = {
  key: "psychological",
  stage: "round",
  compute: (_ctx, subtotal) => {
    const charm = psychoRound(subtotal);
    return {
      amount: charm,
      confidence: 1,
      explanation: `Psychologische afronding → €${charm}`,
      dataStatus: "active",
    };
  },
};
