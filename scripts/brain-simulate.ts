/**
 * T4XI Pricing Brain — Simulator CLI (Stap 8e)
 * ─────────────────────────────────────────────
 * Draait what-if scenario's op de bestaande actieve routecatalogus met de pure
 * Pricing Brain simulator. Leest alleen; schrijft NIETS naar de database (de
 * persistentie naar brain_simulations is bewust nog niet aangezet — pas na
 * expliciete goedkeuring). Wijzigt de bestaande pricing-engine/quote niet.
 *
 * Pipeline:  fixed_route_prices → analyzeRoute() (Brain) → SimRouteInput
 *            → simulate(scenario) → rapport (omzet/marge-impact, verliesgevend)
 *
 * Scenario's:
 *   airport    Alle airport-routes   +--pct%   (default 8)
 *   intercity  Alle intercity-routes +--pct%   (default 10)
 *   cost       Energie-/kostenstijging +--pct% (default 20; prijs ongewijzigd)
 *   raises     Alleen RAISE/RAISE_URGENT adviezen toepassen
 *   custom     Custom % per service_type via --custom "airport=8,intercity=10"
 *
 * Gebruik:
 *   npm run brain:simulate                       # alle standaardscenario's
 *   npm run brain:simulate -- --scenario airport --pct 8
 *   npm run brain:simulate -- --scenario custom --custom "airport=8,day_trip=5"
 *   npm run brain:simulate -- --dry-run          # expliciet read-only (== default)
 *
 * Env (uit .env.local of shell):
 *   NEXT_PUBLIC_SUPABASE_URL          (verplicht)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY     (voldoende — de simulator leest alleen)
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  simulate,
  scenarioServiceTypePct,
  scenarioCustomByService,
  scenarioCostIncrease,
  scenarioApplyRaises,
  type SimScenario,
  type SimRouteInput,
  type SimReport,
  type ServiceType,
} from "../lib/pricing-brain/index";
import { analyzeRoute, type BrainRoute, type RouteAnalysis } from "./brain-analyze";

const ALLOWED_SERVICE_TYPES: ServiceType[] = [
  "airport",
  "intercity",
  "day_trip",
  "hotel_transfer",
  "business_transfer",
  "vip_transfer",
  "hourly_chauffeur",
];
const DEFAULT_PCT: Record<string, number> = { airport: 8, intercity: 10, cost: 20 };

// ── env-loader (geen dependency) ─────────────────────────────────────────────
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

// ── argumenten ───────────────────────────────────────────────────────────────
function getOpt(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

function parseCustomMap(raw: string): Partial<Record<ServiceType, number>> {
  const map: Partial<Record<ServiceType, number>> = {};
  for (const part of raw.split(",")) {
    const [k, v] = part.split("=").map((x) => x.trim());
    if (!k || v === undefined) continue;
    if (!ALLOWED_SERVICE_TYPES.includes(k as ServiceType)) fail(`Onbekend service_type in --custom: '${k}'`);
    const num = Number(v);
    if (!Number.isFinite(num)) fail(`Ongeldig percentage in --custom voor '${k}': '${v}'`);
    map[k as ServiceType] = num;
  }
  if (Object.keys(map).length === 0) fail("--custom bevat geen geldige entries (bv. \"airport=8,intercity=10\").");
  return map;
}

// ── Supabase read (read-only; RLS staat anon toe voor active routes) ─────────
const LOCATIONS_PICKUP_FK = "fixed_route_prices_pickup_location_id_fkey";
const LOCATIONS_DROPOFF_FK = "fixed_route_prices_dropoff_location_id_fkey";
const VEHICLE_CLASS_FK = "fixed_route_prices_vehicle_class_id_fkey";

type Row = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v));

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

  return ((data ?? []) as Row[]).map((r): BrainRoute => {
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

function toSimInput(a: RouteAnalysis): SimRouteInput {
  return {
    pickupSlug: a.route.pickupSlug,
    dropoffSlug: a.route.dropoffSlug,
    vehicleClassCode: a.route.vehicleClassCode,
    serviceType: a.route.serviceType,
    distanceKm: a.route.distanceKm,
    estimatedDurationMin: a.route.estimatedDurationMin,
    price: a.route.price,
    recommendedAction: a.recommendation.action,
    recommendedToPrice: a.recommendation.toPrice,
  };
}

// ── rapport ──────────────────────────────────────────────────────────────────
const eur = (n: number): string => `€ ${n.toFixed(2)}`;
const signed = (n: number): string => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}`;

function printReport(rep: SimReport): void {
  const line = "─".repeat(54);
  console.log(`\n${line}`);
  console.log(`Scenario: ${rep.scenarioLabel}`);
  console.log("");
  console.log(`Routes totaal:   ${rep.routesTotal}`);
  console.log(`Routes geraakt:  ${rep.routesAffected}`);
  console.log("");
  console.log("Catalogusomzet (som enkele ritten):");
  console.log(`  vóór:   ${eur(rep.revenueBefore)}`);
  console.log(`  na:     ${eur(rep.revenueAfter)}`);
  console.log(`  delta:  € ${signed(rep.revenueDelta)}  (${signed(rep.revenueDeltaPct)}%)`);
  console.log("");
  console.log("Marge (som):");
  console.log(`  vóór:   ${eur(rep.marginBefore)}  (gem. ${rep.avgMarginPctBefore.toFixed(2)}%)`);
  console.log(`  na:     ${eur(rep.marginAfter)}  (gem. ${rep.avgMarginPctAfter.toFixed(2)}%)`);
  console.log(`  delta:  € ${signed(rep.marginDelta)}`);
  console.log("");
  console.log("Verliesgevend:");
  console.log(`  vóór:   ${rep.lossMakingBefore} routes`);
  console.log(`  na:     ${rep.lossMakingAfter} routes`);
  console.log(`  nieuw verliesgevend: ${rep.becameLossMaking.length}`);
  for (const r of rep.becameLossMaking) {
    console.log(
      `    - ${r.pickupSlug} → ${r.dropoffSlug} (${r.vehicleClassCode}): ` +
        `marge ${eur(r.beforeMargin)} → ${eur(r.afterMargin)}`
    );
  }
  console.log(line);
}

// ── scenario-selectie ────────────────────────────────────────────────────────
function buildScenarios(argv: string[]): SimScenario[] {
  const which = getOpt(argv, "scenario");
  const pctOpt = getOpt(argv, "pct");
  const customOpt = getOpt(argv, "custom");
  const pctFor = (kind: string): number => {
    const v = pctOpt !== undefined ? Number(pctOpt) : DEFAULT_PCT[kind];
    if (!Number.isFinite(v)) fail(`Ongeldige --pct: '${pctOpt}'`);
    return v;
  };

  if (which) {
    switch (which) {
      case "airport":
        return [scenarioServiceTypePct("airport", pctFor("airport"))];
      case "intercity":
        return [scenarioServiceTypePct("intercity", pctFor("intercity"))];
      case "cost":
        return [scenarioCostIncrease(pctFor("cost"))];
      case "raises":
        return [scenarioApplyRaises()];
      case "custom":
        if (!customOpt) fail('Scenario "custom" vereist --custom "airport=8,intercity=10".');
        return [scenarioCustomByService(parseCustomMap(customOpt))];
      default:
        fail(`Onbekend --scenario: '${which}'. Kies: airport | intercity | cost | raises | custom.`);
    }
  }

  // Geen --scenario → draai alle standaardscenario's (+ custom indien opgegeven).
  const all: SimScenario[] = [
    scenarioServiceTypePct("airport", DEFAULT_PCT.airport),
    scenarioServiceTypePct("intercity", DEFAULT_PCT.intercity),
    scenarioCostIncrease(DEFAULT_PCT.cost),
    scenarioApplyRaises(),
  ];
  if (customOpt) all.push(scenarioCustomByService(parseCustomMap(customOpt)));
  return all;
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), ".env"));

  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) fail("NEXT_PUBLIC_SUPABASE_URL ontbreekt (zet in .env.local).");
  const key = anon || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!key) fail("Geen Supabase key beschikbaar (anon volstaat — de simulator leest alleen).");

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const scenarios = buildScenarios(argv);
  const routes = await readRoutes(supabase);
  const inputs = routes.map(analyzeRoute).map(toSimInput);

  console.log(`\nPricing Brain Simulator${dryRun ? "  (DRY-RUN)" : ""}`);
  console.log(`Routes gelezen: ${routes.length}  ·  Scenario's: ${scenarios.length}`);
  console.log("Modus: READ-ONLY — geen database writes (persistentie pas na goedkeuring).");

  for (const scenario of scenarios) {
    printReport(simulate(inputs, scenario));
  }
  console.log("");
}

// Alleen draaien als dit bestand het entry-point is (niet bij import in tests).
const invoked = process.argv[1] ?? "";
if (invoked.includes("brain-simulate")) {
  main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
}
