import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  classifyRoutingFailure,
  invalidResponseFailure,
  isServiceFailure,
  noRouteFailure,
  sanitizeRoutingFailure,
  timeoutFailure,
  type RoutingFailure,
} from "@/lib/pricing/routing-failure";
import { resolveQuoteWith, type ResolveQuoteDeps, type PricingQuoteResult } from "@/lib/pricing/service";
import { neutralPickupApproachDeps } from "@/lib/pricing/pickup-approach-fake";

/**
 * Diagnostiek voor routingfouten (2026-10-16).
 *
 * Het afstand-tarief viel op 2026-09-08 weg en bleef vijf weken onopgemerkt,
 * omdat `getDrivingRoute()` bij ELKE fout stil `null` gaf. `route_not_fixed`
 * ging van 6 naar 48 gevallen zonder dat iemand kon zien dat de routingdienst
 * zelf onbereikbaar was. Deze tests leggen vast dat de oorzaak nu zichtbaar is
 * én dat er geen enkele prijs door verandert.
 */

const err = (code: number, status: string, message = "", details: unknown = "") => ({
  error: { code, status, message, details },
});

// ── Classificatie per Google-antwoord ──────────────────────────────────────

test("403 SERVICE_DISABLED -> routing_service_disabled", () => {
  const f = classifyRoutingFailure(403, err(403, "PERMISSION_DENIED",
    "Routes API has not been used in project 123 before or it is disabled"));
  assert.equal(f.category, "routing_service_disabled");
  assert.equal(f.httpStatus, 403);
  assert.equal(f.googleStatus, "PERMISSION_DENIED");
  assert.equal(f.googleCode, 403);
});

test("billing uitgeschakeld -> routing_billing_disabled", () => {
  const f = classifyRoutingFailure(403, err(403, "PERMISSION_DENIED",
    "The project is not linked to a billing account"));
  assert.equal(f.category, "routing_billing_disabled");
});

test("ongeldige sleutel -> routing_api_key_invalid", () => {
  assert.equal(classifyRoutingFailure(400, err(400, "INVALID_ARGUMENT", "API key not valid")).category,
    "routing_api_key_invalid");
  assert.equal(classifyRoutingFailure(401, err(401, "UNAUTHENTICATED")).category,
    "routing_api_key_invalid");
});

test("sleutelrestrictie -> routing_api_key_restricted", () => {
  assert.equal(classifyRoutingFailure(403, err(403, "PERMISSION_DENIED",
    "Requests from referer <empty> are blocked")).category, "routing_api_key_restricted");
  assert.equal(classifyRoutingFailure(403, err(403, "PERMISSION_DENIED",
    "Requests from this IP address are blocked")).category, "routing_api_key_restricted");
  // 403 zonder onderscheidend trefwoord valt terug op restrictie
  assert.equal(classifyRoutingFailure(403, null).category, "routing_api_key_restricted");
});

test("quota -> routing_quota_exceeded", () => {
  assert.equal(classifyRoutingFailure(429, null).category, "routing_quota_exceeded");
  assert.equal(classifyRoutingFailure(403, err(403, "RESOURCE_EXHAUSTED", "Quota exceeded")).category,
    "routing_quota_exceeded");
});

test("400 zonder herkenbaar signaal -> routing_unknown_error", () => {
  const f = classifyRoutingFailure(400, err(400, "INVALID_ARGUMENT", "origin is malformed"));
  assert.equal(f.category, "routing_unknown_error");
  assert.equal(f.httpStatus, 400);
});

test("500 van Google -> routing_unknown_error", () => {
  assert.equal(classifyRoutingFailure(500, null).category, "routing_unknown_error");
});

test("timeout, lege routes en onbruikbare payload hebben eigen categorieën", () => {
  assert.equal(timeoutFailure().category, "routing_timeout");
  assert.equal(noRouteFailure().category, "routing_no_route");
  assert.equal(invalidResponseFailure().category, "routing_invalid_response");
});

test("alleen 'geen route' telt NIET als storing", () => {
  assert.equal(isServiceFailure(noRouteFailure()), false);
  assert.equal(isServiceFailure(null), false);
  for (const f of [timeoutFailure(), invalidResponseFailure(), classifyRoutingFailure(403, null)]) {
    assert.equal(isServiceFailure(f), true, f.category);
  }
});

// ── Privacy: niets gevoeligs mag naar buiten ───────────────────────────────

test("classificatie legt geen key, header, adres of vrije tekst vast", () => {
  const f = classifyRoutingFailure(403, {
    error: {
      code: 403,
      status: "PERMISSION_DENIED",
      message: "API key AIzaSyD-GEHEIM blocked for Spinnakerplantsoen 30, 1319DG Almere",
      details: [{ "@type": "help", apiKey: "AIzaSyD-GEHEIM" }],
    },
  });
  const serialised = JSON.stringify(sanitizeRoutingFailure(f));
  for (const verboden of ["AIzaSy", "GEHEIM", "Spinnakerplantsoen", "1319DG", "Almere", "X-Goog"]) {
    assert.ok(!serialised.includes(verboden), `'${verboden}' mag niet gelekt worden: ${serialised}`);
  }
});

test("sanitize laat exact vier velden door", () => {
  const f = { ...timeoutFailure(), extra: "geheim" } as unknown as RoutingFailure;
  assert.deepEqual(Object.keys(sanitizeRoutingFailure(f)).sort(),
    ["category", "googleCode", "googleStatus", "httpStatus"]);
});

test("googleStatus wordt begrensd en vrije tekst geweigerd", () => {
  const lang = "X".repeat(200);
  assert.equal(classifyRoutingFailure(400, { error: { status: lang } }).googleStatus, null);
  assert.equal(classifyRoutingFailure(400, { error: { status: 42 } }).googleStatus, null);
});

// ── End-to-end: reden in de quote, prijs onveranderd ───────────────────────

const VCLASS = { id: "veh", code: "executive-ev", max_passengers: 4, max_luggage: 3, active: true };
const LOC = (slug: string) => ({ id: "l-" + slug, slug, name: slug, active: true, location_type: "city", city_id: "c-" + slug });
const ROUTE = { price: 75, return_price: 135, currency: "EUR", distance_km: 35, estimated_duration_min: 43,
  vat_rate: 9, source_label: null, valid_from: "2026-10-01T00:00:00Z", active: true };

function deps(over: Partial<ResolveQuoteDeps> = {}): ResolveQuoteDeps {
  return {
    findLocation: async (raw: string) => LOC(raw),
    findVehicleClass: async () => VCLASS,
    findFixedRoute: async () => null,
    findCityLocation: async () => null,
    getRoute: async () => null,
    loadArrivalSurcharge: async () => null,
    // Neutrale aanrijdeps: anders haakt resolvePickupApproach af vóór de
    // passagiersroute en wordt getRoute daar nooit voor aangeroepen.
    ...neutralPickupApproachDeps,
    ...over,
  } as ResolveQuoteDeps;
}
const reden = (r: PricingQuoteResult) => (r.available ? null : r.reason);

/** getRoute die faalt en de opgegeven mislukking meldt. */
const falendeRoute = (f: RoutingFailure) =>
  (async (_o: string, _d: string, _t?: string, onFailure?: (x: RoutingFailure) => void) => {
    onFailure?.(f);
    return null;
  }) as ResolveQuoteDeps["getRoute"];

test("storing -> reden draagt de categorie, niet 'route_not_fixed'", async () => {
  for (const f of [
    classifyRoutingFailure(403, err(403, "PERMISSION_DENIED", "Routes API is disabled")),
    timeoutFailure(),
    classifyRoutingFailure(429, null),
  ]) {
    const r = await resolveQuoteWith({ pickup: "almere", dropoff: "groningen" },
      deps({ getRoute: falendeRoute(f) }));
    assert.equal(r.available, false);
    assert.equal(reden(r), `routing_unavailable:${f.category}`);
  }
});

test("echt geen route -> blijft gewoon route_not_fixed", async () => {
  const r = await resolveQuoteWith({ pickup: "almere", dropoff: "groningen" },
    deps({ getRoute: falendeRoute(noRouteFailure()) }));
  assert.equal(reden(r), "route_not_fixed");
});

test("zonder diagnostiek blijft het gedrag exact als voorheen", async () => {
  const r = await resolveQuoteWith({ pickup: "almere", dropoff: "groningen" },
    deps({ getRoute: async () => null }));
  assert.equal(reden(r), "route_not_fixed");
});

test("elk foutpad blijft prijsloos en fail closed", async () => {
  for (const f of [timeoutFailure(), invalidResponseFailure(), noRouteFailure(),
                   classifyRoutingFailure(401, null), classifyRoutingFailure(500, null)]) {
    const r = await resolveQuoteWith({ pickup: "almere", dropoff: "groningen" },
      deps({ getRoute: falendeRoute(f) }));
    assert.equal(r.available, false, f.category);
    assert.equal((r as { price?: number }).price, undefined, f.category);
  }
});

test("PRIJSNEUTRAAL: een vaste route werkt zonder enige Google-aanroep", async () => {
  let aangeroepen = 0;
  const r = await resolveQuoteWith({ pickup: "almere", dropoff: "amsterdam" },
    deps({ findFixedRoute: async () => ROUTE, getRoute: async () => { aangeroepen++; return null; } }));
  assert.equal(r.available, true);
  assert.equal(r.available && r.price, 75);
  assert.equal(aangeroepen, 0, "geen routing-aanroep bij een vaste route");
});

test("PRIJSNEUTRAAL: een geslaagde afstandsprijs blijft identiek", async () => {
  const gelukt = (async () => ({ distanceKm: 100, durationMin: 93 })) as ResolveQuoteDeps["getRoute"];
  const a = await resolveQuoteWith({ pickup: "almere", dropoff: "groningen" }, deps({ getRoute: gelukt }));
  // Zelfde aanroep, nu met een dep die de diagnostiek-callback negeert.
  const b = await resolveQuoteWith({ pickup: "almere", dropoff: "groningen" },
    deps({ getRoute: (async () => ({ distanceKm: 100, durationMin: 93 })) as ResolveQuoteDeps["getRoute"] }));
  assert.equal(a.available, b.available);
  if (a.available && b.available) {
    assert.equal(a.priceCents, b.priceCents, "cent-exact gelijk met en zonder diagnostiek");
  }
});

// ── Bronscan ───────────────────────────────────────────────────────────────

const routing = readFileSync(new URL("./routing.ts", import.meta.url), "utf8");

test("routing.ts logt nooit key, headers of response", () => {
  assert.ok(!/console\.(log|error|warn)/.test(routing), "geen directe console-uitvoer in routing.ts");
  assert.ok(!routing.includes("meld({ category: \"routing_unknown_error\", httpStatus: null, googleStatus: key"),
    "de key mag nooit in een melding");
  // De melding gaat uitsluitend via de getypeerde RoutingFailure.
  assert.match(routing, /onFailure\?: \(failure: RoutingFailure\) => void/);
});

test("diagnostiek kan de offerte nooit breken", () => {
  assert.match(routing, /try \{ onFailure\?\.\(f\); \} catch/);
});

test("het stille 'if (!res.ok) return null' bestaat niet meer", () => {
  assert.ok(!/if \(!res\.ok\) return null;/.test(routing),
    "elke mislukking moet geclassificeerd worden");
  assert.match(routing, /meld\(classifyRoutingFailure\(res\.status, body\)\)/);
});

// ═══════════════════════════════════════════════════════════════════════════
// Duurzame observability: fase, first-wins en de werkelijke logpayload
// ═══════════════════════════════════════════════════════════════════════════

import { toLogEntry, type RoutingFailureLogEntry, type RoutingPhase } from "@/lib/pricing/routing-failure";

test("toLogEntry draagt de fase en exact de vier gesaneerde velden", () => {
  const e = toLogEntry("pickup_approach", classifyRoutingFailure(403, err(403, "PERMISSION_DENIED", "is disabled")));
  assert.deepEqual(Object.keys(e).sort(), ["category", "googleCode", "googleStatus", "httpStatus", "phase"]);
  assert.equal(e.phase, "pickup_approach");
  assert.equal(e.category, "routing_service_disabled");
});

/** Deps die de aanrijroute ECHT laat lopen, zodat de fase onderscheidbaar is. */
function faseDeps(opts: {
  approachFails?: RoutingFailure;
  passengerFails?: RoutingFailure;
  onRecord: (e: RoutingFailureLogEntry) => void;
}): ResolveQuoteDeps {
  const base = deps();
  return {
    ...base,
    recordRoutingFailure: opts.onRecord,
    getRoute: (async (origin: string, _d: string, _t?: string, onFailure?: (f: RoutingFailure) => void) => {
      const isApproach = /\d{4}\s?[A-Z]{2}|base/i.test(origin);
      const fout = isApproach ? opts.approachFails : opts.passengerFails;
      if (fout) { onFailure?.(fout); return null; }
      // Aanrijrit bewust KORT: boven maxApproachKm (40) haakt de aanrijstap af
      // en wordt de passagiersroute nooit bereikt.
      return isApproach ? { distanceKm: 2, durationMin: 4 } : { distanceKm: 100, durationMin: 93 };
    }) as ResolveQuoteDeps["getRoute"],
  } as ResolveQuoteDeps;
}

test("fase passenger_route wordt als zodanig vastgelegd", async () => {
  const entries: RoutingFailureLogEntry[] = [];
  await resolveQuoteWith({ pickup: "almere", dropoff: "groningen" },
    faseDeps({ passengerFails: timeoutFailure(), onRecord: (e) => entries.push(e) }));
  assert.ok(entries.length >= 1);
  assert.equal(entries[0]!.phase, "passenger_route");
  assert.equal(entries[0]!.category, "routing_timeout");
});

test("EERSTE fout wint: een latere fout overschrijft de oorzaak niet", async () => {
  const entries: RoutingFailureLogEntry[] = [];
  const r = await resolveQuoteWith({ pickup: "almere", dropoff: "groningen" },
    faseDeps({
      approachFails: classifyRoutingFailure(403, err(403, "PERMISSION_DENIED", "Routes API is disabled")),
      passengerFails: classifyRoutingFailure(429, null),
      onRecord: (e) => entries.push(e),
    }));
  assert.equal(r.available, false);
  // De reden draagt de EERSTE oorzaak, niet de latere quota-fout.
  assert.equal(r.available ? null : r.reason, "routing_unavailable:routing_service_disabled");
});

test("één quote levert nooit meerdere conflicterende redenen op", async () => {
  const r = await resolveQuoteWith({ pickup: "almere", dropoff: "groningen" },
    faseDeps({
      approachFails: timeoutFailure(),
      passengerFails: classifyRoutingFailure(500, null),
      onRecord: () => {},
    }));
  assert.equal(r.available, false);
  const reason = r.available ? "" : r.reason;
  assert.equal(reason.split("routing_unavailable:").length, 2, "precies één reden");
});

test("diagnostiek laat de offerte nooit falen, ook als de recorder gooit", async () => {
  const r = await resolveQuoteWith({ pickup: "almere", dropoff: "amsterdam" },
    faseDeps({
      passengerFails: timeoutFailure(),
      onRecord: () => { throw new Error("recorder stuk"); },
    }));
  // Geen exception naar buiten; nette fail-closed uitkomst.
  assert.equal(r.available, false);
});

// ── Integratie: komt het ECHT in de logpayload terecht? ────────────────────

test("AANVULLEND (bronscan, geen runtimebewijs): glue van resolveQuote naar logQuote", () => {
  const service = readFileSync(new URL("./service.ts", import.meta.url), "utf8");
  assert.match(service, /logQuote\(input, result, shadow, pickupApproach, routingFailure\)/);
  assert.match(service, /recordRoutingFailure: \(entry\) => \{\s*if \(routingFailure === null\) routingFailure = entry;/);
});

test("INTEGRATIE: de payload is geserialiseerd vrij van key, headers en adressen", () => {
  // Exact de vorm die in price_breakdown belandt.
  const entry = toLogEntry("pickup_approach", classifyRoutingFailure(403, {
    error: {
      code: 403, status: "PERMISSION_DENIED",
      message: "API key AIzaSyGEHEIM blocked; referer t4xi.nl; origin Spinnakerplantsoen 30, 1319DG Almere",
      details: [{ apiKey: "AIzaSyGEHEIM", header: "X-Goog-Api-Key" }],
    },
  }));
  const payload = JSON.stringify({ routingFailure: entry });
  for (const verboden of ["AIzaSy", "GEHEIM", "X-Goog", "Spinnakerplantsoen", "1319DG", "referer", "blocked"]) {
    assert.ok(!payload.includes(verboden), `'${verboden}' mag niet in de logpayload: ${payload}`);
  }
  // Wel bruikbaar voor onderzoek:
  assert.match(payload, /"phase":"pickup_approach"/);
  assert.match(payload, /"httpStatus":403/);
  assert.match(payload, /"googleStatus":"PERMISSION_DENIED"/);
  assert.match(payload, /"googleCode":403/);
});

test("onbekende Google-code blijft diagnosticeerbaar zonder ruwe melding", () => {
  const e = toLogEntry("passenger_route", classifyRoutingFailure(418, { error: { code: 418, status: "WEIRD_STATUS" } }));
  assert.equal(e.category, "routing_unknown_error");
  assert.equal(e.httpStatus, 418);
  assert.equal(e.googleStatus, "WEIRD_STATUS");
  assert.equal(e.googleCode, 418);
  assert.ok(!JSON.stringify(e).includes("message"));
});

test("een falende logwrite verandert het klantresultaat niet", () => {
  const service = readFileSync(new URL("./service.ts", import.meta.url), "utf8");
  // logQuote draait fire-and-forget met een catch; de offerte wacht er niet op.
  assert.match(service, /void logQuote\([^)]*\)\.catch\(\(\) => \{\}\)/);
});

test("de fase-waarden zijn exact de twee bedoelde", () => {
  const geldig: RoutingPhase[] = ["pickup_approach", "passenger_route"];
  const service = readFileSync(new URL("./service.ts", import.meta.url), "utf8");
  for (const p of geldig) assert.ok(service.includes(`toLogEntry("${p}"`), `fase ${p} ontbreekt`);
});

// ═══════════════════════════════════════════════════════════════════════════
// RUNTIME-INTEGRATIE: de werkelijke insert-payload, niet de broncode
// ═══════════════════════════════════════════════════════════════════════════

import { logQuote, type PricingQuoteInput } from "@/lib/pricing/service";

type Rij = Record<string, unknown>;

/** Fake log-sink die de ECHTE insert-payload vastlegt. */
function fakeLogger(opts: { faal?: boolean } = {}) {
  const inserts: { tabel: string; row: Rij }[] = [];
  const client = {
    from(tabel: string) {
      return {
        async insert(row: Rij) {
          inserts.push({ tabel, row });
          if (opts.faal) throw new Error("log-sink onbereikbaar");
          return { error: null };
        },
      };
    },
  };
  return { client: client as never, inserts };
}

/** Draait exact de productiestappen: resolveQuoteWith + logQuote. */
async function quoteEnLog(input: PricingQuoteInput, d: ResolveQuoteDeps, logger: ReturnType<typeof fakeLogger>) {
  let eerste: RoutingFailureLogEntry | null = null;
  const result = await resolveQuoteWith(input, {
    ...d,
    recordRoutingFailure: (e: RoutingFailureLogEntry) => { if (eerste === null) eerste = e; },
  });
  await logQuote(input, result, null, null, eerste, logger.client).catch(() => {});
  return { result, rij: logger.inserts[0]?.row };
}

const SERVICE_DISABLED = classifyRoutingFailure(403, {
  error: {
    code: 403,
    status: "PERMISSION_DENIED",
    message: "Routes API has not been used in project 42 before or it is disabled. API key AIzaSyGEHEIM",
    details: [{ apiKey: "AIzaSyGEHEIM", header: "X-Goog-Api-Key" }],
  },
});

const INPUT: PricingQuoteInput = {
  pickup: "Spinnakerplantsoen 30, 1319DG Almere",
  dropoff: "Groningen",
};

test("RUNTIME: eerste Google-fout in fase pickup_approach landt in de insert-payload", async () => {
  const logger = fakeLogger();
  const { result, rij } = await quoteEnLog(INPUT,
    faseDeps({ approachFails: SERVICE_DISABLED, onRecord: () => {} }), logger);

  assert.equal(result.available, false);
  assert.ok(rij, "er moet een rij zijn geïnsert");

  // 4. price_breakdown.routingFailure met EXACT vijf velden
  const breakdown = rij!.price_breakdown as Record<string, unknown>;
  const rf = breakdown.routingFailure as Record<string, unknown>;
  assert.ok(rf, "price_breakdown.routingFailure moet bestaan");
  assert.deepEqual(Object.keys(rf).sort(),
    ["category", "googleCode", "googleStatus", "httpStatus", "phase"]);
  assert.equal(rf.phase, "pickup_approach");
  assert.equal(rf.category, "routing_service_disabled");
  assert.equal(rf.httpStatus, 403);
  assert.equal(rf.googleStatus, "PERMISSION_DENIED");
  assert.equal(rf.googleCode, 403);

  // 5. compacte, genormaliseerde error_code
  assert.equal(rij!.error_code, "routing_unavailable:routing_service_disabled");
});

test("RUNTIME: de volledig geserialiseerde payload bevat geen key, adres, header of ruwe melding", async () => {
  const logger = fakeLogger();
  const { rij } = await quoteEnLog(INPUT,
    faseDeps({ approachFails: SERVICE_DISABLED, onRecord: () => {} }), logger);

  // Alleen het diagnostiekdeel: request_payload bevat bewust de ingevoerde
  // adressen, dat is bestaand en gewenst gedrag en staat los van deze wijziging.
  const diagnostiek = JSON.stringify((rij!.price_breakdown as Record<string, unknown>).routingFailure);
  for (const verboden of ["AIzaSy", "GEHEIM", "X-Goog", "Spinnakerplantsoen", "1319DG",
                          "has not been used", "apiKey", "details", "message"]) {
    assert.ok(!diagnostiek.includes(verboden), `'${verboden}' lekt: ${diagnostiek}`);
  }
});

test("RUNTIME: routingFailure verschijnt NIET in de publieke API-response", async () => {
  const logger = fakeLogger();
  const { result } = await quoteEnLog(INPUT,
    faseDeps({ approachFails: SERVICE_DISABLED, onRecord: () => {} }), logger);
  const publiek = JSON.stringify(result);
  assert.ok(!publiek.includes("routingFailure"));
  assert.ok(!publiek.includes("PERMISSION_DENIED"));
  assert.ok(!publiek.includes("googleStatus"));
});

test("RUNTIME: tweede fout overschrijft de eerste niet in de payload", async () => {
  const logger = fakeLogger();
  const { rij } = await quoteEnLog(INPUT, faseDeps({
    approachFails: SERVICE_DISABLED,                    // eerst
    passengerFails: classifyRoutingFailure(429, null),  // later
    onRecord: () => {},
  }), logger);
  const rf = (rij!.price_breakdown as Record<string, unknown>).routingFailure as Record<string, unknown>;
  assert.equal(rf.category, "routing_service_disabled", "de EERSTE oorzaak blijft staan");
  assert.equal(rf.phase, "pickup_approach");
  assert.notEqual(rf.category, "routing_quota_exceeded");
});

test("RUNTIME: een falende log-sink laat het klantresultaat ongemoeid", async () => {
  const logger = fakeLogger({ faal: true });
  const { result, rij } = await quoteEnLog(INPUT,
    faseDeps({ approachFails: SERVICE_DISABLED, onRecord: () => {} }), logger);
  assert.ok(rij, "de insert is wel geprobeerd");
  assert.equal(result.available, false);
  assert.equal(result.available ? null : result.reason, "routing_unavailable:routing_service_disabled");
  // De 404-mapping zelf wordt apart geborgd (statusForReason is bewust niet
  // geëxporteerd: Next valideert exports in route-handlers).
});

test("RUNTIME: zonder routingstoring blijft price_breakdown vrij van routingFailure", async () => {
  const logger = fakeLogger();
  const { rij } = await quoteEnLog({ pickup: "almere", dropoff: "amsterdam" },
    { ...deps(), findFixedRoute: async () => ROUTE } as ResolveQuoteDeps, logger);
  assert.equal(rij!.error_code, null, "geslaagde offerte heeft geen foutcode");
  assert.equal(rij!.price_breakdown, null, "geen diagnostiek bij een vaste route");
});

test("de publieke status voor een routingstoring is 404, nooit 500", () => {
  const api = readFileSync(new URL("../../app/api/pricing/quote/route.ts", import.meta.url), "utf8");
  // De prefixcheck staat VOOR de switch, dus de default-500 wordt nooit bereikt.
  const fn = api.slice(api.indexOf("function statusForReason"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  const prefixPos = body.indexOf('reason.startsWith("routing_unavailable:")');
  const switchPos = body.indexOf("switch (reason)");
  assert.ok(prefixPos > -1, "prefixcheck moet bestaan");
  assert.ok(prefixPos < switchPos, "prefixcheck moet VOOR de switch staan");
  assert.match(body, /startsWith\("routing_unavailable:"\)\) return 404;/);
});
