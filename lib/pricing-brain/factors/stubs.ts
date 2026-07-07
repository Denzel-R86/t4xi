import type { FactorProvider } from "../types";

/**
 * Stub-factoren: architectonisch aanwezig, maar zonder databron in v1.
 * Ze dragen NIETS bij (amount 0, confidence 0, dataStatus 'stub') en zijn
 * zichtbaar in de uitleg als "wacht op data". Zodra een bron er is, worden ze
 * een echte provider + confidence/weight in de config.
 */
export const STUB_FACTOR_KEYS = [
  "demand",
  "supply",
  "driver_availability",
  "traffic",
  "weather",
  "holiday",
  "event",
  "hist_acceptance",
  "hist_conversion",
  "hist_margin",
  "clv",
  "elasticity",
] as const;

export type StubFactorKey = (typeof STUB_FACTOR_KEYS)[number];

export const stubFactors: FactorProvider[] = STUB_FACTOR_KEYS.map((key) => ({
  key,
  stage: "additive",
  compute: () => ({
    amount: 0,
    confidence: 0,
    explanation: "Wacht op databron (v1 stub)",
    dataStatus: "stub",
  }),
}));
