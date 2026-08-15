// Regressietests voor de hotfix: pricing_deadhead_config/pricing_high_demand_zones
// zijn RLS-only zonder publieke policy — de anon-key read-client zag hier altijd
// 0 rijen, wat een structurele "missing_config"-bug veroorzaakte (elke dynamische
// offerte sloeg de shadow-berekening over, ook met een correct geconfigureerde
// rij). Deze tests bewijzen dat de fix (service-role client, uitsluitend voor
// deze twee tabellen) klopt en dat niets anders is geraakt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import {
  resolveQuoteWith,
  NoServiceRoleClientError,
  type ResolveQuoteDeps,
  type PricingQuoteInput,
  type ShadowLogEntry,
} from "@/lib/pricing/service";

const EMPTY_ALLOWLIST = { cityIds: new Set<string>(), byOfficialWoonplaats: new Map<string, string>() };

function sourceOf(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), "utf8");
}

function resolveQuoteBlock(): string {
  const src = sourceOf("lib/pricing/service.ts");
  const start = src.indexOf("async function resolveQuote(");
  const end = src.indexOf("export async function resolveQuoteWith");
  assert.ok(start > -1 && end > start, "kon resolveQuote() niet lokaliseren voor de scan");
  return src.slice(start, end);
}

/**
 * De service-role client wordt sinds 2026-08-14 niet meer rechtstreeks in
 * resolveQuote() aangemaakt, maar binnen de module-scope gecachete loaders
 * (cachedLoadDeadheadConfig/cachedLoadHighDemandZones/
 * cachedLoadDeadheadZoneAllowlist) die er vlak vóór staan — vandaar dit
 * bredere blok voor de client-toegangsscan.
 */
function cachedLoadersAndResolveQuoteBlock(): string {
  const src = sourceOf("lib/pricing/service.ts");
  const start = src.indexOf("const cachedLoadDeadheadConfig");
  const end = src.indexOf("export async function resolveQuoteWith");
  assert.ok(start > -1 && end > start, "kon de gecachete loaders + resolveQuote() niet lokaliseren voor de scan");
  return src.slice(start, end);
}

// ── Bewijs: shadow-configtabellen via service-role, niet via de anon-client ──

test("de gecachete shadow-loaders (config/high-demand-zones/zone-allowlist) gebruiken de service-role client (createPricingLogClient), niet de anon read-client", () => {
  const block = cachedLoadersAndResolveQuoteBlock();
  // Alle drie roepen createPricingLogClient() aan binnen hun eigen load()-closure.
  assert.match(block, /loadDeadheadConfig\(client\)/);
  assert.match(block, /loadHighDemandZones\(client\)/);
  assert.match(block, /loadDeadheadZoneAllowlist\(client\)/);
  const logClientCalls = block.match(/createPricingLogClient\(\)/g) ?? [];
  assert.ok(logClientCalls.length >= 3, `verwacht createPricingLogClient() minstens 3× (één per loader), telde ${logClientCalls.length}`);
  assert.doesNotMatch(block, /loadDeadheadConfig\(supabase\)/);
  assert.doesNotMatch(block, /loadHighDemandZones\(supabase\)/);
  assert.doesNotMatch(block, /loadDeadheadZoneAllowlist\(supabase\)/);
});

test("resolveQuote(): de shadow-deps wijzen naar de GECACHETE loaders (cachedLoad*), niet naar een losse, ongecachete aanroep", () => {
  const block = resolveQuoteBlock();
  assert.match(block, /loadDeadheadConfig:\s*cachedLoadDeadheadConfig/);
  assert.match(block, /loadHighDemandZones:\s*cachedLoadHighDemandZones/);
  assert.match(block, /loadDeadheadZoneAllowlist:\s*cachedLoadDeadheadZoneAllowlist/);
  assert.match(block, /lookupOfficialWoonplaats:\s*retryingLookupOfficialWoonplaats/);
});

test("resolveQuote(): de publieke referentietabellen (locations/vehicle_classes/fixed_route_prices) blijven op de anon read-client", () => {
  const block = resolveQuoteBlock();
  assert.match(block, /findLocation\(supabase, raw\)/);
  assert.match(block, /findVehicleClass\(supabase, code\)/);
  assert.match(block, /findFixedRoute\(\s*supabase,/);
});

// ── Fail-closed: ontbrekende/falende service-role-client ────────────────────

const vclass = { id: "veh-exec-ev", code: "executive-ev", max_passengers: 4, max_luggage: 3, active: true };

function makeDeps(o: Partial<ResolveQuoteDeps> = {}): ResolveQuoteDeps {
  return {
    findLocation: async () => null,
    findVehicleClass: async () => vclass,
    findFixedRoute: async () => null,
    getRoute: async () => ({ distanceKm: 104.8, durationMin: 72 }),
    ...o,
  };
}

// Bewust "Rotterdam" (niet "Eindhoven Airport" zoals voorheen): dit bestand
// test de generieke claim "een onbeschikbare service-role-client breekt de
// offerte nooit" — niet het NIEUWE, specifiekere indeterminate-gedrag voor een
// mogelijk Eindhoven/Roermond-bestemming (dat heeft zijn eigen dekking in
// deadhead-reliability.test.ts). "Rotterdam" triggert couldPlausiblyBeInZone
// niet (geen postcode/plaatsnaam-match), dus dit blijft het oorspronkelijke,
// eenvoudige "load_error/no_service_role_client → basisprijs"-pad.
const input: PricingQuoteInput = { pickup: "Laren", dropoff: "Rotterdam" };

test("ontbrekende service-role-client → shadowSkipped met specifieke reden 'no_service_role_client', klantprijs ongewijzigd", async () => {
  let shadow: ShadowLogEntry | null = null;
  const res = await resolveQuoteWith(
    input,
    makeDeps({
      loadDeadheadConfig: () => Promise.reject(new NoServiceRoleClientError()),
      loadHighDemandZones: () => Promise.reject(new NoServiceRoleClientError()),
      loadDeadheadZoneAllowlist: () => Promise.reject(new NoServiceRoleClientError()),
      recordShadow: (e) => {
        shadow = e;
      },
    })
  );
  assert.equal(res.available, true);
  // 10.75 + 104.8*0.65 + 72*1.10 = 158.07 → €158 (zelfde fixture als de bestaande regressietests)
  if (res.available) assert.equal(res.price, 158);
  assert.deepEqual(shadow, { shadowSkipped: true, reason: "no_service_role_client", basePrice: 158, finalPrice: 158 });
});

test("falende service-role-client (queryfout) → shadowSkipped, nooit een fout naar de offerte, klantprijs ongewijzigd", async () => {
  let shadow: ShadowLogEntry | null = null;
  const res = await resolveQuoteWith(
    input,
    makeDeps({
      loadDeadheadConfig: () => Promise.reject(new Error("connection refused")),
      loadHighDemandZones: async () => ({ locationIds: new Set<string>(), cityIds: new Set<string>() }),
      loadDeadheadZoneAllowlist: async () => EMPTY_ALLOWLIST,
      recordShadow: (e) => {
        shadow = e;
      },
    })
  );
  assert.equal(res.available, true);
  if (res.available) assert.equal(res.price, 158);
  assert.deepEqual(shadow, { shadowSkipped: true, reason: "load_error", basePrice: 158, finalPrice: 158 });
});

// ── Geen ongemerkt bredere service-role-toegang ──────────────────────────────

function walkSourceFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walkSourceFiles(full, files);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry) && !entry.endsWith(".test.ts")) files.push(full);
  }
  return files;
}

test("SUPABASE_SERVICE_ROLE_KEY komt nergens voor in client-bundelbare code (components/ of bestanden met 'use client')", () => {
  // Server-only route handlers (app/api/**/route.ts) en server-modules mogen de
  // key wél rechtstreeks lezen (bestaand, breder patroon in deze codebase — niet
  // uitsluitend via lib/supabase/server.ts) — die komen nooit in de browserbundel.
  // Wat hier telt: nooit in components/ of in een bestand met "use client".
  const root = process.cwd();
  const offenders: string[] = [];
  for (const dir of ["app", "components"]) {
    for (const file of walkSourceFiles(resolve(root, dir))) {
      const content = readFileSync(file, "utf8");
      const clientBundlable =
        dir === "components" ||
        content.trimStart().startsWith('"use client"') ||
        content.trimStart().startsWith("'use client'");
      if (clientBundlable && content.includes("SUPABASE_SERVICE_ROLE_KEY")) {
        offenders.push(relative(root, file));
      }
    }
  }
  assert.deepEqual(offenders, []);
});
