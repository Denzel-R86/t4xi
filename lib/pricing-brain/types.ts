/**
 * Pricing Brain — types (Stap 8b).
 * Pure datacontracten. Geen IO, geen Supabase, geen side effects.
 * Deze module leunt NIET op de bestaande pricing-engine (eenrichtings-grens).
 */

export type ServiceType =
  | "airport"
  | "intercity"
  | "day_trip"
  | "hotel_transfer"
  | "business_transfer"
  | "vip_transfer"
  | "hourly_chauffeur";

export type DataStatus = "active" | "estimated" | "stub";

/** Marktband (uit brain_market_observations of een schatting). */
export type MarketBand = {
  low: number;
  mid: number;
  high: number;
  /** true = placeholder/model, false = echt geobserveerd. */
  isEstimate: boolean;
};

/** Alle context die de Brain nodig heeft om een route te scoren. Puur data. */
export type RouteContext = {
  pickupSlug: string;
  dropoffSlug: string;
  vehicleClassCode: string;
  serviceType: ServiceType;
  distanceKm: number;
  estimatedDurationMin: number;
  /** Huidige verkoopprijs (all-in), voor vergelijking/advies. */
  currentPrice: number;
  currentReturnPrice: number | null;
  /** Optioneel — factoren degraderen netjes als deze ontbreken. */
  pickupIsAirport?: boolean;
  dropoffIsAirport?: boolean;
  vehicleMultiplier?: number;
  market?: MarketBand | null;
};

/** In welke fase van de pipeline een factor draait. */
export type FactorStage = "additive" | "floor" | "round";

/** Ruwe output van een factor, vóór config-weging. */
export type RawFactorOutput = {
  /** additive: €-bijdrage · floor/round: doelprijs. */
  amount: number;
  /** Eigen zekerheid van de factor, 0..1. */
  confidence: number;
  explanation: string;
  dataStatus: DataStatus;
};

/** Een factor provider: pure functie (context, lopend subtotaal) → ruwe output. */
export type FactorProvider = {
  key: string;
  stage: FactorStage;
  compute(ctx: RouteContext, subtotal: number): RawFactorOutput;
};

/** Config per factor (normaal uit brain_factor_config; hier als plain input). */
export type FactorConfig = {
  factorKey: string;
  weight: number;
  /** Cap op de confidence, 0..1. */
  maxConfidence: number;
  enabled: boolean;
  dataStatus: DataStatus;
};

/** Per-factor resultaat in de uitleg: de GEWOGEN €-bijdrage. */
export type FactorResult = {
  factorKey: string;
  contribution: number;
  confidence: number;
  explanation: string;
  dataStatus: DataStatus;
};

/** Uitkomst van de Decision Engine. */
export type PriceDecision = {
  basePrice: number;
  /** Eindresultaat (na floor + psychologische afronding). */
  recommendedPrice: number;
  /** Vóór psychologische afronding. */
  rawRecommendedPrice: number;
  psychologicalPrice: number;
  overallConfidence: number;
  breakdown: FactorResult[];
  currency: "EUR";
};

/** Kostenschatting. */
export type CostAssumptions = {
  fixedOverhead: number;
  costPerKm: number;
  costPerMinute: number;
};

export type CostEstimate = {
  total: number;
  fixedOverhead: number;
  distanceCost: number;
  timeCost: number;
  assumptions: CostAssumptions;
};

// ── Recommendation Engine ────────────────────────────────────────────────────

export type RecommendationAction =
  | "RAISE_URGENT"
  | "RAISE"
  | "LOWER"
  | "REPRICE_PSYCH"
  | "POSITION_PREMIUM"
  | "MANUAL_REVIEW"
  | "HOLD";

export type RecommendationThresholds = {
  /** Onder deze overall-confidence → MANUAL_REVIEW. */
  minConfidence: number;
  /** Onder deze marge (ratio) → RAISE. */
  lowMarginPct: number;
  /** Boven deze marge geldt een route als "gezond". */
  healthyMarginPct: number;
  /** Boven deze marge + boven de markt → LOWER. */
  highMarginPct: number;
  /** Minimale €-afwijking van de charm-prijs → REPRICE_PSYCH. */
  psychDelta: number;
};

export type Recommendation = {
  action: RecommendationAction;
  fromPrice: number;
  toPrice: number | null;
  fromReturnPrice: number | null;
  toReturnPrice: number | null;
  rationale: string;
  confidence: number;
  /** Huidige marge in procenten. */
  currentMarginPct: number;
  /** Verwachte marge bij toPrice, in procenten. */
  expectedMarginPct: number | null;
};

// ── Explainer ────────────────────────────────────────────────────────────────

export type PriceExplanationLine = {
  factorKey: string;
  label: string;
  amount: number;
  confidence: number;
  dataStatus: DataStatus;
};

export type PriceExplanation = {
  basePrice: number;
  lines: PriceExplanationLine[];
  /** Factoren die (nog) geen data hebben en 0 bijdragen. */
  stubbedFactors: string[];
  rawRecommendedPrice: number;
  recommendedPrice: number;
  overallConfidence: number;
  rationale: string;
  currency: "EUR";
};
