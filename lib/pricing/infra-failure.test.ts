import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  logQuote,
  resolveQuoteWith,
  NoServiceRoleClientError,
  type PricingQuoteInput,
  type PricingQuoteResult,
  type ResolveQuoteDeps,
} from "@/lib/pricing/service";
import { infraFailureFor, noteInfraFailure, type InfraFailureLogEntry } from "@/lib/pricing/infra-failure";
import { neutralPickupApproachDeps } from "@/lib/pricing/pickup-approach-fake";
import { noRouteFailure, type RoutingFailure } from "@/lib/pricing/routing-failure";

/**
 * Monitoring 2.0 (2026-11-21): een configuratie-timeout of onbereikbare
 * database in het quotepad werd gelogd als `unknown_location` (vrij adres) of
 * `route_not_fixed` (bekende locaties) — niet te onderscheiden van een
 * legitieme aanvraag. Deze tests leggen vast dat zo'n storing apart wordt
 * getagd in `price_breakdown.infraFailure`, terwijl de `reason` (en dus het
 * publieke contract) exact gelijk blijft.
 */

const VCLASS = { id: "veh", code: "executive-ev", max_passengers: 4, max_luggage: 3, active: true };
const LOC = (slug: string) => ({ id: "l-" + slug, slug, name: slug, active: true, location_type: "city", city_id: "c-" + slug });
const findLocation = async (raw: string) => (raw.includes(",") ? null : LOC(raw));

function deps(over: Partial<ResolveQuoteDeps> = {}): ResolveQuoteDeps {
  return {
    findLocation,
    findVehicleClass: async () => VCLASS,
    findFixedRoute: async () => null,
    findCityLocation: async () => null,
    getRoute: async () => ({ distanceKm: 20, durationMin: 25 }),
    loadArrivalSurcharge: async () => null,
    ...neutralPickupApproachDeps,
    ...over,
  } as ResolveQuoteDeps;
}

const VRIJ_ADRES = "Teststraat 1, 3201 AA Spijkenisse";
const VRIJ_DOEL = "Stationsplein 1, 3013 AJ Rotterdam";
const reden = (r: PricingQuoteResult) => (r.available ? null : r.reason);

async function quote(input: PricingQuoteInput, d: ResolveQuoteDeps) {
  const infra: InfraFailureLogEntry[] = [];
  const result = await resolveQuoteWith(input, { ...d, recordInfraFailure: (e) => infra.push(e) });
  return { result, infra };
}

const hangt = () => new Promise<never>(() => {});

test("config-timeout aanrijmodel: reden blijft unknown_location, maar getagd als timeout", async () => {
  const { result, infra } = await quote(
    { pickup: VRIJ_ADRES, dropoff: VRIJ_DOEL },
    deps({ loadApproachFeeConfig: hangt as ResolveQuoteDeps["loadApproachFeeConfig"] })
  );
  assert.equal(reden(result), "unknown_location", "publieke/interne reden ongewijzigd");
  assert.deepEqual(infra, [{ stage: "pickup_approach_config", category: "timeout" }]);
});

test("config-timeout bij bekende locaties: reden blijft route_not_fixed, getagd als timeout", async () => {
  const { result, infra } = await quote(
    { pickup: "almere", dropoff: "groningen" },
    deps({ loadOperationalBases: hangt as ResolveQuoteDeps["loadOperationalBases"] })
  );
  assert.equal(reden(result), "route_not_fixed");
  assert.deepEqual(infra, [{ stage: "pickup_approach_config", category: "timeout" }]);
});

test("database onbereikbaar (queryfout) -> load_error", async () => {
  const { result, infra } = await quote(
    { pickup: VRIJ_ADRES, dropoff: VRIJ_DOEL },
    deps({ loadServiceAreaBaseSlugs: async () => { throw new Error("connection refused"); } })
  );
  assert.equal(result.available, false);
  assert.deepEqual(infra, [{ stage: "pickup_approach_config", category: "load_error" }]);
});

test("ontbrekende service-role-client -> no_service_role_client", async () => {
  const { infra } = await quote(
    { pickup: VRIJ_ADRES, dropoff: VRIJ_DOEL },
    deps({ loadApproachFeeConfig: async () => { throw new NoServiceRoleClientError(); } })
  );
  assert.deepEqual(infra, [{ stage: "pickup_approach_config", category: "no_service_role_client" }]);
});

test("lege aanrijconfig -> missing_config", async () => {
  const { infra } = await quote({ pickup: VRIJ_ADRES, dropoff: VRIJ_DOEL }, deps({ loadApproachFeeConfig: async () => null }));
  assert.deepEqual(infra, [{ stage: "pickup_approach_config", category: "missing_config" }]);
});

test("PDOK-gemeentelookup faalt -> pickup_gemeente_lookup, niet outside_service_area", async () => {
  const { result, infra } = await quote(
    { pickup: VRIJ_ADRES, dropoff: VRIJ_DOEL },
    deps({ lookupOfficialGemeente: async () => { throw new Error("PDOK 502"); } })
  );
  assert.equal(reden(result), "unknown_location");
  assert.deepEqual(infra, [{ stage: "pickup_gemeente_lookup", category: "load_error" }]);
});

test("echte unknown_location (geen route, geen storing) -> GEEN infra-tag", async () => {
  const geenRoute = (async (_o: string, _d: string, _t?: string, cb?: (f: RoutingFailure) => void) => {
    cb?.(noRouteFailure());
    return null;
  }) as ResolveQuoteDeps["getRoute"];
  const { result, infra } = await quote({ pickup: VRIJ_ADRES, dropoff: VRIJ_DOEL }, deps({ getRoute: geenRoute }));
  assert.equal(reden(result), "unknown_location");
  assert.deepEqual(infra, []);
});

test("buiten servicegebied -> outside_service_area, GEEN infra-tag", async () => {
  const { result, infra } = await quote(
    { pickup: "Teststraat 1, 2031 AA Haarlem", dropoff: VRIJ_DOEL },
    deps({ lookupOfficialGemeente: async () => "Haarlem" })
  );
  assert.equal(reden(result), "outside_service_area");
  assert.deepEqual(infra, []);
});

test("geslaagde afstandsprijs -> GEEN infra-tag, prijs ongewijzigd beschikbaar", async () => {
  const { result, infra } = await quote({ pickup: VRIJ_ADRES, dropoff: VRIJ_DOEL }, deps());
  assert.equal(result.available, true);
  assert.deepEqual(infra, []);
});

test("een gooiende recorder breekt de offerte nooit", async () => {
  const result = await resolveQuoteWith(
    { pickup: VRIJ_ADRES, dropoff: VRIJ_DOEL },
    { ...deps({ loadApproachFeeConfig: async () => null }), recordInfraFailure: () => { throw new Error("boom"); } }
  );
  assert.equal(reden(result), "unknown_location");
});

// ── logQuote: het label komt in price_breakdown.infraFailure, error_code blijft ──

function fakeLogger() {
  const rows: Record<string, unknown>[] = [];
  const client = { from: () => ({ async insert(row: Record<string, unknown>) { rows.push(row); return { error: null }; } }) };
  return { client: client as never, rows };
}

test("logQuote schrijft infraFailure naast de ongewijzigde error_code", async () => {
  const input = { pickup: VRIJ_ADRES, dropoff: VRIJ_DOEL };
  const { result, infra } = await quote(input, deps({ loadApproachFeeConfig: async () => { throw new Error("x"); } }));
  noteInfraFailure(result, infra[0]!);
  const logger = fakeLogger();
  await logQuote(input, result, null, null, null, logger.client);
  const row = logger.rows[0]!;
  assert.equal(row.error_code, "unknown_location");
  assert.deepEqual((row.price_breakdown as Record<string, unknown>).infraFailure, {
    stage: "pickup_approach_config",
    category: "load_error",
  });
});

test("logQuote zonder storing: geen infraFailure-sleutel (bestaande breakdown-vorm ongewijzigd)", async () => {
  const input = { pickup: VRIJ_ADRES, dropoff: VRIJ_DOEL };
  const { result } = await quote(input, deps({ lookupOfficialGemeente: async () => "Haarlem" }));
  const logger = fakeLogger();
  await logQuote(input, result, null, { outcome: "offer_on_request", reason: "unassigned_service_area" }, null, logger.client);
  const breakdown = logger.rows[0]!.price_breakdown as Record<string, unknown>;
  assert.ok(!("infraFailure" in breakdown));
});

test("het label is niet zichtbaar op het resultaatobject (dus nooit in de publieke response)", async () => {
  const { result, infra } = await quote({ pickup: VRIJ_ADRES, dropoff: VRIJ_DOEL }, deps({ loadApproachFeeConfig: async () => null }));
  noteInfraFailure(result, infra[0]!);
  assert.ok(!JSON.stringify(result).includes("infraFailure"));
  assert.ok(!JSON.stringify(result).includes("pickup_approach_config"));
  assert.deepEqual(infraFailureFor(result), { stage: "pickup_approach_config", category: "missing_config" });
});

test("bronscan: resolveQuote koppelt de eerste storing alleen aan een resultaat zonder prijs", () => {
  const service = readFileSync(new URL("./service.ts", import.meta.url), "utf8");
  assert.match(service, /recordInfraFailure: \(entry\) => \{\s*if \(infraFailure === null\) infraFailure = entry;/);
  assert.match(service, /if \(infra && !result\.available\) noteInfraFailure\(result, infra\);/);
});
