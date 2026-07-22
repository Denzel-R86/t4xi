/**
 * Pricing Brain Dashboard (Stap 8f) — server-only data loader.
 *
 * READ-ONLY: leest de actieve routecatalogus via de bestaande anon read-client
 * (RLS staat select op active-rijen toe) en rekent elke route door met de
 * bestaande, pure Pricing Brain. Geen writes, geen API-wijziging, geen nieuwe
 * businesslogica — puur orchestratie voor de admin-demo.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPricingReadClient } from "@/lib/supabase/server";
import {
  estimateCost,
  decide,
  recommend,
  explain,
  buildDefaultProviders,
  DEFAULT_FACTOR_CONFIG,
  round2,
  type RouteContext,
  type ServiceType,
} from "@/lib/pricing-brain";
import type { BrainDashboardData, BrainRouteView } from "./types";

const PICKUP_FK = "fixed_route_prices_pickup_location_id_fkey";
const DROPOFF_FK = "fixed_route_prices_dropoff_location_id_fkey";
const VEHICLE_FK = "fixed_route_prices_vehicle_class_id_fkey";

type Row = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v));

function buildView(r: Row): BrainRouteView {
  const pickup = (r.pickup ?? {}) as Row;
  const dropoff = (r.dropoff ?? {}) as Row;
  const vclass = (r.vehicle_class ?? {}) as Row;

  const pickupSlug = String(pickup.slug ?? "");
  const dropoffSlug = String(dropoff.slug ?? "");
  const vehicleClassCode = String(vclass.code ?? "");
  const serviceType = String(r.service_type) as ServiceType;
  const distanceKm = num(r.distance_km);
  const durationMin = num(r.estimated_duration_min);
  const currentPrice = num(r.price);
  const currentReturnPrice =
    r.return_price === null || r.return_price === undefined ? null : num(r.return_price);

  const ctx: RouteContext = {
    pickupSlug,
    dropoffSlug,
    vehicleClassCode,
    serviceType,
    distanceKm,
    estimatedDurationMin: durationMin,
    currentPrice,
    currentReturnPrice,
    pickupIsAirport: pickup.location_type === "airport",
    dropoffIsAirport: dropoff.location_type === "airport",
    vehicleMultiplier: vclass.price_multiplier === undefined ? 1 : num(vclass.price_multiplier),
    market: null,
  };

  const cost = estimateCost(distanceKm, durationMin);
  const decision = decide(ctx, buildDefaultProviders(), DEFAULT_FACTOR_CONFIG);
  const rec = recommend(ctx, decision);
  const explanation = explain(decision);
  const marginEur = round2(currentPrice - cost.total);

  return {
    id: String(r.id),
    pickupSlug,
    dropoffSlug,
    vehicleClassCode,
    serviceType,
    distanceKm,
    durationMin,
    currentPrice,
    currentReturnPrice,
    cost: cost.total,
    marginEur,
    marginPct: rec.currentMarginPct,
    recommendedPrice: decision.recommendedPrice,
    psychologicalPrice: decision.psychologicalPrice,
    rawRecommendedPrice: decision.rawRecommendedPrice,
    overallConfidence: decision.overallConfidence,
    action: rec.action,
    toPrice: rec.toPrice,
    expectedMarginPct: rec.expectedMarginPct,
    rationale: rec.rationale,
    explanation,
    sim: {
      pickupSlug,
      dropoffSlug,
      vehicleClassCode,
      serviceType,
      distanceKm,
      estimatedDurationMin: durationMin,
      price: currentPrice,
      recommendedAction: rec.action,
      recommendedToPrice: rec.toPrice,
    },
  };
}

export async function loadBrainDashboard(): Promise<BrainDashboardData> {
  const generatedAt = new Date().toISOString();
  const typedClient = createPricingReadClient();
  if (!typedClient) {
    return { configured: false, generatedAt, routeCount: 0, routes: [] };
  }
  // De join gebruikt aliassen die niet in de gegenereerde Database-types zitten;
  // val terug op de ongetypeerde client voor deze read-only query.
  const supabase = typedClient as unknown as SupabaseClient;

  const { data, error } = await supabase
    .from("fixed_route_prices")
    .select(
      `id, price, return_price, distance_km, estimated_duration_min, service_type,
       pickup:locations!${PICKUP_FK} ( slug, location_type ),
       dropoff:locations!${DROPOFF_FK} ( slug, location_type ),
       vehicle_class:vehicle_classes!${VEHICLE_FK} ( code, price_multiplier )`
    )
    .eq("active", true);

  if (error) {
    console.error("[brain-dashboard] kon routes niet lezen:", error.message);
    return { configured: true, generatedAt, routeCount: 0, routes: [] };
  }

  const routes = ((data ?? []) as Row[])
    .map(buildView)
    .sort((a, b) => a.marginPct - b.marginPct);

  return { configured: true, generatedAt, routeCount: routes.length, routes };
}
