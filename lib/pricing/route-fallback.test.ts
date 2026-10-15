import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildFallbackLevels,
  isFallbackEligible,
  resolveLevel,
  FALLBACK_ELIGIBLE_TYPES,
  type FallbackLocation,
} from "@/lib/pricing/route-fallback";
import { resolveQuoteWith, type ResolveQuoteDeps, type PricingQuoteResult } from "@/lib/pricing/service";
import { buildPriceSnapshot } from "@/lib/pricing/snapshot";
import { amsterdamDepartureIso } from "@/lib/pricing/departure-time";

/**
 * Wijk → stad-terugval voor vaste routes (2026-10-15).
 *
 * Root cause: een adres mét postcode resolvet naar de WIJK
 * ("Moermanskkade 107, 1013 BC Amsterdam" -> amsterdam-centrum), een adres
 * zonder postcode naar de STAD (-> amsterdam). Intercity-tarieven bestaan
 * alleen op stadsniveau, dus de eerste gaf "Offerte op aanvraag" en de tweede
 * EUR 75. Luchthavenroutes bestaan wél per wijk en werkten altijd al.
 */

// ── Locatiefixtures: exact de structuur uit productie ───────────────────────
// district deelt city_id met de city-locatie; airport heeft een eigen city.
const CITY_AMS = "city-amsterdam";
const CITY_ALM = "city-almere";
const CITY_RTM = "city-rotterdam";
const CITY_SPL = "city-schiphol";

const loc = (
  id: string,
  slug: string,
  location_type: string,
  city_id: string | null,
  active = true
): FallbackLocation & { name: string; active: boolean } => ({
  id, slug, name: slug, location_type, city_id, active,
});

const ALMERE        = loc("l-almere", "almere", "city", CITY_ALM);
const AMSTERDAM     = loc("l-ams", "amsterdam", "city", CITY_AMS);
const AMS_CENTRUM   = loc("l-ams-c", "amsterdam-centrum", "district", CITY_AMS);
const AMS_ZUIDAS    = loc("l-ams-z", "amsterdam-zuidas", "district", CITY_AMS);
const ROTTERDAM     = loc("l-rtm", "rotterdam", "city", CITY_RTM);
const RTM_CENTRUM   = loc("l-rtm-c", "rotterdam-centrum", "district", CITY_RTM);
const SCHIPHOL      = loc("l-spl", "schiphol-airport", "airport", CITY_SPL);
const RTM_AIRPORT   = loc("l-rtm-ap", "rotterdam-airport", "airport", CITY_RTM);
const LANDMARK      = loc("l-dor", "designer-outlet-roermond", "landmark", "city-roermond");
const STATION       = loc("l-ams-cs", "amsterdam-centraal", "station", CITY_AMS);
const AMS_INACTIEF  = loc("l-ams-x", "amsterdam", "city", CITY_AMS, false);

// ── Pure laag ───────────────────────────────────────────────────────────────

test("alleen district is terugvalgeschikt", () => {
  assert.deepEqual([...FALLBACK_ELIGIBLE_TYPES], ["district"]);
  assert.equal(isFallbackEligible(AMS_CENTRUM), true);
  for (const l of [AMSTERDAM, SCHIPHOL, RTM_AIRPORT, LANDMARK, STATION]) {
    assert.equal(isFallbackEligible(l), false, `${l.slug} mag NIET terugvallen`);
  }
});

test("inactieve locatie of ontbrekende city_id valt nooit terug", () => {
  assert.equal(isFallbackEligible({ ...AMS_CENTRUM, active: false }), false);
  assert.equal(isFallbackEligible({ ...AMS_CENTRUM, city_id: null }), false);
  assert.equal(isFallbackEligible(null), false);
});

test("niveaus: één zijde eerst, city→city als laatste", () => {
  const levels = buildFallbackLevels({
    pickup: AMS_CENTRUM, dropoff: RTM_CENTRUM,
    pickupCity: AMSTERDAM, dropoffCity: ROTTERDAM,
  });
  assert.equal(levels.length, 2);
  assert.deepEqual(levels[0]!.map((c) => c.generalised).sort(), ["dropoff", "pickup"]);
  assert.deepEqual(levels[1]!.map((c) => c.generalised), ["both"]);
});

test("een city-pickup levert geen pickup-kandidaat op", () => {
  const levels = buildFallbackLevels({
    pickup: ALMERE, dropoff: AMS_CENTRUM, pickupCity: ALMERE, dropoffCity: AMSTERDAM,
  });
  assert.equal(levels.length, 1);
  assert.deepEqual(levels[0]!.map((c) => c.generalised), ["dropoff"]);
});

test("nooit terugvallen naar een ANDERE stad", () => {
  const levels = buildFallbackLevels({
    pickup: AMS_CENTRUM, dropoff: ALMERE,
    pickupCity: ROTTERDAM, // verkeerde stad
    dropoffCity: null,
  });
  assert.deepEqual(levels, []);
});

test("inactieve stadlocatie levert geen kandidaat", () => {
  const levels = buildFallbackLevels({
    pickup: ALMERE, dropoff: AMS_CENTRUM, pickupCity: null, dropoffCity: AMS_INACTIEF,
  });
  assert.deepEqual(levels, []);
});

test("resolveLevel: gelijke prijs = match, verschillende prijs = ambigu", () => {
  const c = { pickupId: "a", dropoffId: "b", generalised: "dropoff" as const };
  const d = { pickupId: "c", dropoffId: "e", generalised: "pickup" as const };
  const same = (a: { p: number }, b: { p: number }) => a.p === b.p;
  assert.equal(resolveLevel([{ route: null, candidate: c }], same).kind, "none");
  assert.equal(resolveLevel([{ route: { p: 75 }, candidate: c }], same).kind, "match");
  assert.equal(
    resolveLevel([{ route: { p: 75 }, candidate: c }, { route: { p: 75 }, candidate: d }], same).kind,
    "match"
  );
  assert.equal(
    resolveLevel([{ route: { p: 75 }, candidate: c }, { route: { p: 99 }, candidate: d }], same).kind,
    "ambiguous"
  );
});

// ── End-to-end door de echte resolver ───────────────────────────────────────

const VCLASS = { id: "veh", code: "executive-ev", max_passengers: 4, max_luggage: 3, active: true };

/** Alle city-locaties die in productie bestaan — findCityLocation kent ze allemaal. */
const UTRECHT_CITY = loc("l-utr", "utrecht", "city", "city-utrecht");
const ALLE_STEDEN = [ALMERE, AMSTERDAM, ROTTERDAM, UTRECHT_CITY];

const route = (price: number, return_price: number | null = null) => ({
  price, return_price, currency: "EUR", distance_km: 35, estimated_duration_min: 43,
  vat_rate: 9, source_label: null, valid_from: "2026-10-01T00:00:00Z", active: true,
});

/** Routetabel op "pickupId>dropoffId". */
function makeDeps(routes: Record<string, ReturnType<typeof route>>, locaties: Record<string, typeof ALMERE>,
                  over: Partial<ResolveQuoteDeps> = {}): ResolveQuoteDeps {
  // Stadlocaties komen uit de volledige cataloog (zoals in productie, waar
  // findCityLocation los van de ingevoerde adressen de stad opzoekt).
  const catalogus = [...Object.values(locaties), ...ALLE_STEDEN];
  const steden: Record<string, typeof ALMERE> = {};
  for (const l of catalogus) if (l.location_type === "city" && l.active) steden[l.city_id!] = l;
  return {
    findLocation: async (raw: string) => locaties[raw] ?? null,
    findVehicleClass: async () => VCLASS,
    findFixedRoute: async (p: string, d: string) => routes[`${p}>${d}`] ?? null,
    findCityLocation: async (cityId: string) => steden[cityId] ?? null,
    getRoute: async () => null,
    loadArrivalSurcharge: async () => null,
    ...over,
  } as ResolveQuoteDeps;
}

const prijs = (r: PricingQuoteResult) => (r.available ? r.price : null);
const reden = (r: PricingQuoteResult) => (r.available ? null : r.reason);

// Productierealiteit: alleen almere>amsterdam bestaat (intercity, stadsniveau).
const INTERCITY = { [`${ALMERE.id}>${AMSTERDAM.id}`]: route(75, 135) };

test("ACCEPTATIE: Almere -> Amsterdam-adres MET postcode = EUR 75", async () => {
  const deps = makeDeps(INTERCITY, { bron: ALMERE, doel: AMS_CENTRUM });
  const r = await resolveQuoteWith({ pickup: "bron", dropoff: "doel" }, deps);
  assert.equal(prijs(r), 75);
});

test("zelfde route ZONDER postcode blijft ongewijzigd EUR 75", async () => {
  const deps = makeDeps(INTERCITY, { bron: ALMERE, doel: AMSTERDAM });
  assert.equal(prijs(await resolveQuoteWith({ pickup: "bron", dropoff: "doel" }, deps)), 75);
});

test("Rotterdam- en Utrecht-bestemming met postcode gebruiken de stadsroute", async () => {
  const UTRECHT = UTRECHT_CITY;
  const UTR_C = loc("l-utr-c", "utrecht-centrum", "district", "city-utrecht");
  const routes = {
    [`${ALMERE.id}>${ROTTERDAM.id}`]: route(165),
    [`${ALMERE.id}>${UTRECHT.id}`]: route(79),
  };
  assert.equal(prijs(await resolveQuoteWith({ pickup: "b", dropoff: "d" },
    makeDeps(routes, { b: ALMERE, d: RTM_CENTRUM }))), 165);
  assert.equal(prijs(await resolveQuoteWith({ pickup: "b", dropoff: "d" },
    makeDeps(routes, { b: ALMERE, d: UTR_C }))), 79);
});

test("postcode aan PICKUP-zijde valt eveneens veilig terug", async () => {
  const routes = { [`${AMSTERDAM.id}>${ALMERE.id}`]: route(75) };
  const r = await resolveQuoteWith({ pickup: "b", dropoff: "d" },
    makeDeps(routes, { b: AMS_CENTRUM, d: ALMERE }));
  assert.equal(prijs(r), 75);
});

test("postcode aan BEIDE zijden valt terug via city -> city", async () => {
  const routes = { [`${AMSTERDAM.id}>${ROTTERDAM.id}`]: route(129) };
  const r = await resolveQuoteWith({ pickup: "b", dropoff: "d" },
    makeDeps(routes, { b: AMS_CENTRUM, d: RTM_CENTRUM }));
  assert.equal(prijs(r), 129);
});

test("een EXACTE wijkroute wint altijd van de stadsfallback", async () => {
  const routes = {
    [`${ALMERE.id}>${AMS_CENTRUM.id}`]: route(88),  // exact, specifiek
    [`${ALMERE.id}>${AMSTERDAM.id}`]: route(75),    // stad
  };
  const r = await resolveQuoteWith({ pickup: "b", dropoff: "d" },
    makeDeps(routes, { b: ALMERE, d: AMS_CENTRUM }));
  assert.equal(prijs(r), 88, "de exacte wijkprijs, niet de stadsprijs");
});

test("bestaande wijk -> luchthavenroute houdt exact dezelfde prijs", async () => {
  const routes = {
    [`${AMS_CENTRUM.id}>${SCHIPHOL.id}`]: route(61, 110),
    [`${AMSTERDAM.id}>${SCHIPHOL.id}`]: route(65, 117),
  };
  const r = await resolveQuoteWith({ pickup: "b", dropoff: "d" },
    makeDeps(routes, { b: AMS_CENTRUM, d: SCHIPHOL }));
  assert.equal(prijs(r), 61, "wijkprijs blijft leidend, geen stadsfallback");
});

test("luchthaven wordt NOOIT als stad behandeld", async () => {
  // rotterdam-airport deelt city_id met de stad Rotterdam: zonder uitsluiting
  // zou een EUR 39-luchthavenrit de stadsprijs krijgen.
  const routes = { [`${ROTTERDAM.id}>${ALMERE.id}`]: route(165) };
  const r = await resolveQuoteWith({ pickup: "b", dropoff: "d" },
    makeDeps(routes, { b: RTM_AIRPORT, d: ALMERE }));
  assert.equal(r.available, false, "mag geen stadsprijs lenen");
  assert.equal(reden(r), "route_not_fixed");
});

test("station en landmark worden niet gedegradeerd tot stad", async () => {
  const routes = { [`${AMSTERDAM.id}>${ALMERE.id}`]: route(75) };
  for (const specifiek of [STATION, LANDMARK]) {
    const r = await resolveQuoteWith({ pickup: "b", dropoff: "d" },
      makeDeps(routes, { b: specifiek, d: ALMERE }));
    assert.equal(r.available, false, `${specifiek.slug} mag niet terugvallen`);
  }
});

test("onbekende plaats blijft fail closed", async () => {
  const r = await resolveQuoteWith({ pickup: "x", dropoff: "y" }, makeDeps(INTERCITY, {}));
  assert.equal(r.available, false);
  assert.equal(reden(r), "unknown_location");
});

test("inactieve stadlocatie: geen terugval, fail closed", async () => {
  const deps = makeDeps(INTERCITY, { b: ALMERE, d: AMS_CENTRUM });
  (deps as { findCityLocation?: unknown }).findCityLocation = async () => AMS_INACTIEF;
  const r = await resolveQuoteWith({ pickup: "b", dropoff: "d" }, deps);
  assert.equal(r.available, false);
});

test("inactieve ROUTE wordt niet gebruikt (lookup filtert zelf op active)", async () => {
  const deps = makeDeps({}, { b: ALMERE, d: AMS_CENTRUM });
  const r = await resolveQuoteWith({ pickup: "b", dropoff: "d" }, deps);
  assert.equal(r.available, false);
  assert.equal(reden(r), "route_not_fixed");
});

test("AMBIGU op hetzelfde niveau met verschillende prijzen -> fail closed", async () => {
  const routes = {
    [`${AMS_CENTRUM.id}>${ROTTERDAM.id}`]: route(129), // pickup exact, dropoff stad
    [`${AMSTERDAM.id}>${RTM_CENTRUM.id}`]: route(145), // pickup stad, dropoff exact
  };
  const r = await resolveQuoteWith({ pickup: "b", dropoff: "d" },
    makeDeps(routes, { b: AMS_CENTRUM, d: RTM_CENTRUM }));
  assert.equal(r.available, false);
  assert.equal(reden(r), "route_fallback_ambiguous");
  assert.equal((r as { price?: number }).price, undefined);
});

test("gelijke prijs op hetzelfde niveau is GEEN ambiguïteit", async () => {
  const routes = {
    [`${AMS_CENTRUM.id}>${ROTTERDAM.id}`]: route(129, 232),
    [`${AMSTERDAM.id}>${RTM_CENTRUM.id}`]: route(129, 232),
  };
  const r = await resolveQuoteWith({ pickup: "b", dropoff: "d" },
    makeDeps(routes, { b: AMS_CENTRUM, d: RTM_CENTRUM }));
  assert.equal(prijs(r), 129);
});

test("zonder findCityLocation-dep blijft het gedrag exact als voorheen", async () => {
  const deps = makeDeps(INTERCITY, { b: ALMERE, d: AMS_CENTRUM });
  delete (deps as Partial<ResolveQuoteDeps>).findCityLocation;
  const r = await resolveQuoteWith({ pickup: "b", dropoff: "d" }, deps);
  assert.equal(r.available, false, "geen terugval zonder dep");
});

// ── Retour, nacht, snapshot: ongewijzigd en cent-exact ──────────────────────

const SNAP = { quoteId: "0192f0c0-0000-7000-8000-000000000abc", now: new Date("2026-10-15T12:00:00.000Z") };
const DAG = amsterdamDepartureIso("2026-10-16", "11:00")!;
const NACHT = amsterdamDepartureIso("2026-10-16", "23:30")!;

test("retour via terugval: retourprijs en cent-exactheid blijven kloppen", async () => {
  const deps = makeDeps(INTERCITY, { b: ALMERE, d: AMS_CENTRUM });
  const r = await resolveQuoteWith({ pickup: "b", dropoff: "d", returnTrip: true }, deps);
  assert.equal(prijs(r), 135);
  assert.equal(r.available && r.priceCents, 13500);
  const s = buildPriceSnapshot(r as Extract<PricingQuoteResult, { available: true }>,
    { ...SNAP, departureAt: DAG, returnDepartureAt: DAG });
  assert.equal(s!.subtotalCents, 13500, "snapshot cent-exact gelijk aan de quote");
});

test("nachttoeslag werkt onveranderd op een teruggevallen route", async () => {
  const deps = makeDeps(INTERCITY, { b: ALMERE, d: AMS_CENTRUM });
  const r = await resolveQuoteWith({ pickup: "b", dropoff: "d" }, deps);
  assert.equal(r.available, true);
  if (!r.available) return;
  const dag = buildPriceSnapshot(r, { ...SNAP, departureAt: DAG })!;
  const nacht = buildPriceSnapshot(r, { ...SNAP, departureAt: NACHT })!;
  assert.equal(nacht.totalCents - dag.totalCents, Math.round(7500 * 0.15), "15% over EUR 75,00");
});

test("aankomsttoeslag blijft correct op een luchthaven-pickup", async () => {
  const routes = { [`${SCHIPHOL.id}>${AMS_CENTRUM.id}`]: route(61, 110) };
  const deps = makeDeps(routes, { b: SCHIPHOL, d: AMS_CENTRUM }, {
    loadArrivalSurcharge: async () => ({ airportSlug: "schiphol-airport", surchargeCents: 1500 }),
  });
  const r = await resolveQuoteWith({ pickup: "b", dropoff: "d" }, deps);
  assert.equal(prijs(r), 76, "61 + 15, exact zoals vóór deze wijziging");
  assert.equal(r.available && r.airportArrival?.surchargeCents, 1500);
});

// ── Bronscan: de algemene resolver mag hier nooit voor worden aangepast ─────

const service = readFileSync(new URL("./service.ts", import.meta.url), "utf8");
const aliases = readFileSync(new URL("./location-aliases.ts", import.meta.url), "utf8");

test("findLocation blijft ongemoeid: geen terugvallogica in de resolver", () => {
  const fn = service.slice(service.indexOf("async function findLocation"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  // `city_id` staat legitiem in de SELECT van findLocation en is dus geen signaal.
  for (const term of ["route-fallback", "buildFallbackLevels", "isFallbackEligible", "findCityLocation"]) {
    assert.ok(!body.includes(term), `findLocation mag '${term}' niet bevatten`);
  }
});

test("location-aliases bevat geen wijk->stad-terugval", () => {
  for (const term of ["buildFallbackLevels", "isFallbackEligible", "FALLBACK_ELIGIBLE_TYPES"]) {
    assert.ok(!aliases.includes(term), `location-aliases.ts mag '${term}' niet bevatten`);
  }
});

test("de terugval zit UITSLUITEND in de vaste-routetak", () => {
  // Niet in tryDistanceTariff: dynamische prijzen blijven ongewijzigd.
  const dist = service.slice(service.indexOf("async function tryDistanceTariff"));
  const body = dist.slice(0, dist.indexOf("\n}\n"));
  assert.ok(!body.includes("buildFallbackLevels"), "afstand-tarief mag geen terugval doen");
  assert.match(service, /findFixedRoute\(pickup\.id, dropoff\.id, vehicleClass\.id\)/, "exacte poging blijft eerst");
});

test("postcode wordt nergens gestript", () => {
  assert.ok(!service.includes("stripPostcode"));
  const fb = readFileSync(new URL("./route-fallback.ts", import.meta.url), "utf8");
  assert.ok(!/postcode/i.test(fb.replace(/^\s*\*.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")),
    "de fallbackmodule raakt postcodes niet aan");
});
