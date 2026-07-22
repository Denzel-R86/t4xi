/**
 * Pricing Brain Dashboard (Stap 8f) — gedeelde view-types.
 * Puur data, geen IO. Gedeeld tussen de server-loader en de client-UI.
 */

import type { PriceExplanation, RecommendationAction, SimRouteInput } from "@/lib/pricing-brain";

/** Eén volledig doorgerekende route, klaar voor weergave (serialiseerbaar). */
export type BrainRouteView = {
  id: string;
  pickupSlug: string;
  dropoffSlug: string;
  vehicleClassCode: string;
  serviceType: string;
  distanceKm: number;
  durationMin: number;
  currentPrice: number;
  currentReturnPrice: number | null;
  cost: number;
  marginEur: number;
  marginPct: number;
  recommendedPrice: number;
  psychologicalPrice: number;
  rawRecommendedPrice: number;
  overallConfidence: number;
  action: RecommendationAction;
  toPrice: number | null;
  expectedMarginPct: number | null;
  rationale: string;
  explanation: PriceExplanation;
  /** Input voor de client-side simulator (pure what-if). */
  sim: SimRouteInput;
};

export type BrainDashboardData = {
  /** false als de Supabase-config ontbreekt → UI toont een nette lege staat. */
  configured: boolean;
  generatedAt: string;
  routeCount: number;
  routes: BrainRouteView[];
};
