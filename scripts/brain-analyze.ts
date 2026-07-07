/**
 * T4XI Pricing Brain — Analyze CLI
 * ─────────────────────────────────
 * Analyseert de volledige actieve routecatalogus (public.fixed_route_prices) met
 * de bestaande, pure Pricing Brain en schrijft de resultaten naar de brain_*
 * tabellen. Leest alleen; wijzigt de bestaande pricing-engine/quote NIET.
 *
 * Pipeline per route:  RouteContext → estimateCost() → decide() (Decision Engine)
 *                      → recommend() (Recommendation Engine) → explain() (Explainer)
 *
 * Schrijft uitsluitend naar:
 *   public.brain_route_metrics      (snapshot per run, upsert op de snapshot-key)
 *   public.brain_recommendations    (open advies per route; vorige open → superseded)
 *
 * Gebruik:
 *   npm run brain:analyze -- --dry-run     # volledige analyse + rapport, geen writes
 *   npm run brain:analyze                  # analyse + schrijven naar brain_* tabellen
 *
 * Env (uit .env.local of shell):
 *   NEXT_PUBLIC_SUPABASE_URL          (verplicht)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY     (voldoende voor --dry-run: alleen lezen)
 *   SUPABASE_SERVICE_ROLE_KEY         (verplicht voor echte run: schrijven naar brain_*)
 *
 * Idempotentie:
 *   - brain_route_metrics: upsert op (pickup, dropoff, vehicle_class, computed_at).
 *     Eén run = één timestamp = één snapshot; herhalen binnen dezelfde run schrijft
 *     dezelfde rij. Opeenvolgende runs voegen een nieuwe timestamped snapshot toe
 *     (dit is een history-tabel, computed_at zit in de unieke index).
 *   - brain_recommendations: de partial unique index staat één open advies per
 *     (route, action) toe. Per run worden bestaande open adviezen van deze CLI voor
 *     de betrokken routes op 'superseded' gezet en daarna verse open adviezen
 *     ingevoegd. Netto blijft er dus altijd precies de laatste set open staan.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
  type PriceDecision,
  type Recommendation,
  type PriceExplanation,
  type CostEstimate,
  type RecommendationAction,
} from "../lib/pricing-brain/index";

const CONFIG_VERSION = 1;
const CREATED_BY = "brain-analyze";
const ACTION_ORDER: RecommendationAction[] = [
  "RAISE_URGENT",
  "RAISE",
  "LOWER",
  "REPRICE_PSYCH",
  "POSITION_PREMIUM",
  "MANUAL_REVIEW",
  "HOLD",
];

// ── kleine .env-loader (geen dependency) ─────────────────────────────────────
function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

// ── datamodel ────────────────────────────────────────────────────────────────

/** Eén route zoals gelezen uit fixed_route_prices (+ joins). */
export type BrainRoute = {
  fixedRoutePriceId: string;
  pickupLocationId: string;
  dropoffLocationId: string;
  vehicleClassId: string;
  pickupSlug: string;
  dropoffSlug: string;
  vehicleClassCode: string;
  serviceType: ServiceType;
  distanceKm: number;
  estimatedDurationMin: number;
  price: number;
  returnPrice: number | null;
  pickupIsAirport: boolean;
  dropoffIsAirport: boolean;
  vehicleMultiplier: number;
};

export type RouteAnalysis = {
  route: BrainRoute;
  context: RouteContext;
  cost: CostEstimate;
  decision: PriceDecision;
  recommendation: Recommendation;
  explanation: PriceExplanation;
};

// ── pure analyse-kern (geen IO) ──────────────────────────────────────────────

export function toRouteContext(route: BrainRoute): RouteContext {
  return {
    pickupSlug: route.pickupSlug,
    dropoffSlug: route.dropoffSlug,
    vehicleClassCode: route.vehicleClassCode,
    serviceType: route.serviceType,
    distanceKm: route.distanceKm,
    estimatedDurationMin: route.estimatedDurationMin,
    currentPrice: route.price,
    currentReturnPrice: route.returnPrice,
    pickupIsAirport: route.pickupIsAirport,
    dropoffIsAirport: route.dropoffIsAirport,
    vehicleMultiplier: route.vehicleMultiplier,
    market: null,
  };
}

export function analyzeRoute(route: BrainRoute): RouteAnalysis {
  const context = toRouteContext(route);
  const cost = estimateCost(context.distanceKm, context.estimatedDurationMin);
  const decision = decide(context, buildDefaultProviders(), DEFAULT_FACTOR_CONFIG);
  const recommendation = recommend(context, decision);
  const explanation = explain(decision);
  return { route, context, cost, decision, recommendation, explanation };
}

export type AnalysisSummary = {
  routesAnalyzed: number;
  counts: Record<RecommendationAction, number>;
  avgMarginPct: number;
  avgConfidence: number;
};

export function summarize(analyses: RouteAnalysis[]): AnalysisSummary {
  const counts = ACTION_ORDER.reduce(
    (acc, a) => ({ ...acc, [a]: 0 }),
    {} as Record<RecommendationAction, number>
  );
  let marginSum = 0;
  let confSum = 0;
  for (const a of analyses) {
    counts[a.recommendation.action] += 1;
    marginSum += a.recommendation.currentMarginPct;
    confSum += a.decision.overallConfidence;
  }
  const n = analyses.length;
  return {
    routesAnalyzed: n,
    counts,
    avgMarginPct: n > 0 ? round2(marginSum / n) : 0,
    avgConfidence: n > 0 ? Math.round((confSum / n) * 1000) / 1000 : 0,
  };
}

// ── row-mapping voor de brain_* tabellen ─────────────────────────────────────

function metricsRow(a: RouteAnalysis, computedAt: string) {
  return {
    pickup_location_id: a.route.pickupLocationId,
    dropoff_location_id: a.route.dropoffLocationId,
    vehicle_class_id: a.route.vehicleClassId,
    fixed_route_price_id: a.route.fixedRoutePriceId,
    pickup_slug: a.route.pickupSlug,
    dropoff_slug: a.route.dropoffSlug,
    vehicle_class_code: a.route.vehicleClassCode,
    service_type: a.route.serviceType,
    price: a.route.price,
    estimated_cost: a.cost.total,
    margin: round2(a.route.price - a.cost.total),
    margin_pct: a.recommendation.currentMarginPct,
    recommended_price: a.decision.recommendedPrice,
    psychological_price: a.decision.psychologicalPrice,
    overall_confidence: a.decision.overallConfidence,
    config_version: CONFIG_VERSION,
    computed_at: computedAt,
    created_by: CREATED_BY,
  };
}

function recommendationRow(a: RouteAnalysis, runId: string) {
  return {
    pickup_location_id: a.route.pickupLocationId,
    dropoff_location_id: a.route.dropoffLocationId,
    vehicle_class_id: a.route.vehicleClassId,
    fixed_route_price_id: a.route.fixedRoutePriceId,
    pickup_slug: a.route.pickupSlug,
    dropoff_slug: a.route.dropoffSlug,
    vehicle_class_code: a.route.vehicleClassCode,
    action: a.recommendation.action,
    from_price: a.recommendation.fromPrice,
    to_price: a.recommendation.toPrice,
    from_return_price: a.recommendation.fromReturnPrice,
    to_return_price: a.recommendation.toReturnPrice,
    rationale: a.recommendation.rationale,
    confidence: a.recommendation.confidence,
    expected_margin_pct: a.recommendation.expectedMarginPct,
    status: "open",
    config_version: CONFIG_VERSION,
    run_id: runId,
    created_by: CREATED_BY,
  };
}

// ── Supabase IO ──────────────────────────────────────────────────────────────

const LOCATIONS_PICKUP_FK = "fixed_route_prices_pickup_location_id_fkey";
const LOCATIONS_DROPOFF_FK = "fixed_route_prices_dropoff_location_id_fkey";
const VEHICLE_CLASS_FK = "fixed_route_prices_vehicle_class_id_fkey";

type Row = Record<string, unknown>;

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}

async function readRoutes(supabase: SupabaseClient): Promise<BrainRoute[]> {
  const { data, error } = await supabase
    .from("fixed_route_prices")
    .select(
      `id, price, return_price, distance_km, estimated_duration_min, service_type,
       pickup_location_id, dropoff_location_id, vehicle_class_id,
       pickup:locations!${LOCATIONS_PICKUP_FK} ( slug, location_type ),
       dropoff:locations!${LOCATIONS_DROPOFF_FK} ( slug, location_type ),
       vehicle_class:vehicle_classes!${VEHICLE_CLASS_FK} ( code, price_multiplier )`
    )
    .eq("active", true);

  if (error) fail(`Kon fixed_route_prices niet lezen: ${error.message}`);
  const rows = (data ?? []) as Row[];

  return rows.map((r): BrainRoute => {
    const pickup = (r.pickup ?? {}) as Row;
    const dropoff = (r.dropoff ?? {}) as Row;
    const vclass = (r.vehicle_class ?? {}) as Row;
    return {
      fixedRoutePriceId: String(r.id),
      pickupLocationId: String(r.pickup_location_id),
      dropoffLocationId: String(r.dropoff_location_id),
      vehicleClassId: String(r.vehicle_class_id),
      pickupSlug: String(pickup.slug ?? ""),
      dropoffSlug: String(dropoff.slug ?? ""),
      vehicleClassCode: String(vclass.code ?? ""),
      serviceType: String(r.service_type) as ServiceType,
      distanceKm: num(r.distance_km),
      estimatedDurationMin: num(r.estimated_duration_min),
      price: num(r.price),
      returnPrice: r.return_price === null || r.return_price === undefined ? null : num(r.return_price),
      pickupIsAirport: pickup.location_type === "airport",
      dropoffIsAirport: dropoff.location_type === "airport",
      vehicleMultiplier: vclass.price_multiplier === undefined ? 1 : num(vclass.price_multiplier),
    };
  });
}

async function writeResults(
  supabase: SupabaseClient,
  analyses: RouteAnalysis[],
  computedAt: string,
  runId: string
): Promise<void> {
  // 1. Metrics-snapshot (upsert op de snapshot unique index).
  const metrics = analyses.map((a) => metricsRow(a, computedAt));
  const { error: mErr } = await supabase
    .from("brain_route_metrics")
    .upsert(metrics, {
      onConflict: "pickup_location_id,dropoff_location_id,vehicle_class_id,computed_at",
    });
  if (mErr) fail(`Schrijven naar brain_route_metrics faalde: ${mErr.message}`);

  // 2. Vorige open adviezen van deze CLI voor de betrokken routes → superseded.
  const routeIds = analyses.map((a) => a.route.fixedRoutePriceId);
  const { error: sErr } = await supabase
    .from("brain_recommendations")
    .update({ status: "superseded", updated_at: new Date().toISOString() })
    .eq("status", "open")
    .eq("created_by", CREATED_BY)
    .in("fixed_route_price_id", routeIds);
  if (sErr) fail(`Superseden van open adviezen faalde: ${sErr.message}`);

  // 3. Verse open adviezen invoegen.
  const recs = analyses.map((a) => recommendationRow(a, runId));
  const { error: rErr } = await supabase.from("brain_recommendations").insert(recs);
  if (rErr) fail(`Schrijven naar brain_recommendations faalde: ${rErr.message}`);
}

// ── rapport ──────────────────────────────────────────────────────────────────

function pad(action: string): string {
  const dots = ".".repeat(Math.max(2, 18 - action.length));
  return `${action} ${dots}`;
}

function printReport(summary: AnalysisSummary, routesRead: number, runtimeMs: number, dryRun: boolean): void {
  const line = "-".repeat(50);
  console.log(`\n${line}`);
  console.log(`Pricing Brain Analysis${dryRun ? "  (DRY-RUN — geen writes)" : ""}`);
  console.log("");
  console.log(`Routes gelezen:\n${routesRead}`);
  console.log("");
  console.log(`Geanalyseerd:\n${summary.routesAnalyzed}`);
  console.log("");
  console.log("Recommendations:");
  console.log("");
  for (const action of ACTION_ORDER) {
    const count = summary.counts[action];
    if (count > 0) console.log(`${pad(action)} ${count}`);
  }
  console.log("");
  console.log(`Gemiddelde marge:\n${summary.avgMarginPct.toFixed(2)} %`);
  console.log("");
  console.log(`Gemiddelde confidence:\n${summary.avgConfidence.toFixed(3)}`);
  console.log("");
  console.log(`Runtime:\n${runtimeMs} ms`);
  console.log(`${line}\n`);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), ".env"));

  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) fail("NEXT_PUBLIC_SUPABASE_URL ontbreekt (zet in .env.local).");
  if (!dryRun && !serviceRole) {
    fail(
      "Een echte run vereist SUPABASE_SERVICE_ROLE_KEY (schrijven naar brain_* is deny-by-default). " +
        "Gebruik --dry-run om zonder key te analyseren, of zet de key in .env.local."
    );
  }
  // Lege string telt als 'afwezig' → gebruik || (niet ??) voor de fallback.
  const key = (dryRun ? serviceRole || anon : serviceRole) || "";
  if (!key) fail("Geen Supabase key beschikbaar (anon of service_role).");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const startedAt = Date.now();
  const routes = await readRoutes(supabase);
  const analyses = routes.map(analyzeRoute);
  const summary = summarize(analyses);

  if (!dryRun) {
    const computedAt = new Date().toISOString();
    const runId = randomUUID();
    await writeResults(supabase, analyses, computedAt, runId);
  }

  const runtimeMs = Date.now() - startedAt;
  printReport(summary, routes.length, runtimeMs, dryRun);
}

// Alleen draaien als dit bestand het entry-point is (niet bij import in tests).
const invoked = process.argv[1] ?? "";
if (invoked.includes("brain-analyze")) {
  main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
}
