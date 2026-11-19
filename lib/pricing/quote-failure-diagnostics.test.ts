import test from "node:test";
import assert from "node:assert/strict";

import { classifyRoutingFailure, noRouteFailure, type RoutingFailure } from "@/lib/pricing/routing-failure";
import { resolveQuoteWith, type ResolveQuoteDeps, type PricingQuoteResult } from "@/lib/pricing/service";
import { neutralPickupApproachDeps } from "@/lib/pricing/pickup-approach-fake";

/**
 * Diagnostiek van de reden achter "Offerte op aanvraag" (2026-11-19).
 *
 * Productiebevinding: het afstand-tarief gaf van 8 september tot en met
 * november geen enkele prijs, maar elke aanvraag met een vrij (straat)adres
 * werd gelogd als `unknown_location`. De echte oorzaak (een door Google
 * geweigerde sleutel, of een pickup buiten het servicegebied) bleef zo
 * onzichtbaar. Deze tests leggen vast dat de werkelijke oorzaak voorgaat, en
 * dat de klant in alle gevallen exact dezelfde uitkomst krijgt.
 */

const VCLASS = { id: "veh", code: "executive-ev", max_passengers: 4, max_luggage: 3, active: true };
const LOC = (slug: string) => ({ id: "l-" + slug, slug, name: slug, active: true, location_type: "city", city_id: "c-" + slug });

/** Vrije adressen (met een komma) staan niet in `locations`; kale plaatsnamen wel. */
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

const reden = (r: PricingQuoteResult) => (r.available ? null : r.reason);

const falendeRoute = (f: RoutingFailure) =>
  (async (_o: string, _d: string, _t?: string, onFailure?: (x: RoutingFailure) => void) => {
    onFailure?.(f);
    return null;
  }) as ResolveQuoteDeps["getRoute"];

const VRIJ_ADRES = "Teststraat 1, 3201 AA Spijkenisse";
const VRIJ_DOEL = "Stationsplein 1, 3013 AJ Rotterdam";
const geweigerd = classifyRoutingFailure(403, {
  error: { code: 403, status: "PERMISSION_DENIED", message: "Requests from referer <empty> are blocked" },
});

test("vrij adres + geweigerde sleutel -> routing_unavailable, niet unknown_location", async () => {
  const r = await resolveQuoteWith({ pickup: VRIJ_ADRES, dropoff: VRIJ_DOEL }, deps({ getRoute: falendeRoute(geweigerd) }));
  assert.equal(r.available, false);
  assert.equal(reden(r), "routing_unavailable:routing_api_key_restricted");
});

test("vrij adres buiten elk servicegebied -> outside_service_area", async () => {
  const r = await resolveQuoteWith(
    { pickup: "Teststraat 1, 2031 AA Haarlem", dropoff: "Teststraat 2, 1251 AA Laren" },
    deps({ lookupOfficialGemeente: async () => "Haarlem" })
  );
  assert.equal(reden(r), "outside_service_area");
});

test("bekende locaties buiten het servicegebied -> outside_service_area, niet route_not_fixed", async () => {
  const r = await resolveQuoteWith(
    { pickup: "haarlem", dropoff: "laren" },
    deps({ lookupOfficialGemeente: async () => "Haarlem" })
  );
  assert.equal(reden(r), "outside_service_area");
});

test("aanrit boven de maximale afstand -> beyond_max_approach", async () => {
  const r = await resolveQuoteWith(
    { pickup: VRIJ_ADRES, dropoff: VRIJ_DOEL },
    deps({
      // basis -> pickup ver weg; neutralPickupApproachDeps' maxApproachKm = 35
      getRoute: (async () => ({ distanceKm: 80, durationMin: 70 })) as ResolveQuoteDeps["getRoute"],
    })
  );
  assert.equal(reden(r), "beyond_max_approach");
});

test("vrij adres zonder route (geen storing) -> blijft unknown_location", async () => {
  const r = await resolveQuoteWith({ pickup: VRIJ_ADRES, dropoff: VRIJ_DOEL }, deps({ getRoute: falendeRoute(noRouteFailure()) }));
  assert.equal(reden(r), "unknown_location");
});

test("bekende locaties zonder route (geen storing) -> blijft route_not_fixed", async () => {
  const r = await resolveQuoteWith({ pickup: "almere", dropoff: "groningen" }, deps({ getRoute: falendeRoute(noRouteFailure()) }));
  assert.equal(reden(r), "route_not_fixed");
});

test("werkende routering geeft ongewijzigd een afstandsprijs", async () => {
  const r = await resolveQuoteWith({ pickup: VRIJ_ADRES, dropoff: VRIJ_DOEL }, deps());
  assert.equal(r.available, true);
  if (r.available) assert.equal(r.source, "distance_tariff");
});

test("een recorder die gooit breekt de offerte nooit", async () => {
  const r = await resolveQuoteWith(
    { pickup: "Teststraat 1, 2031 AA Haarlem", dropoff: VRIJ_DOEL },
    deps({
      lookupOfficialGemeente: async () => "Haarlem",
      recordPickupApproach: () => { throw new Error("recorder kapot"); },
    })
  );
  assert.equal(reden(r), "outside_service_area");
});

test("de externe recorder krijgt de aanrijuitkomst nog steeds", async () => {
  const gezien: unknown[] = [];
  await resolveQuoteWith(
    { pickup: "Teststraat 1, 2031 AA Haarlem", dropoff: VRIJ_DOEL },
    deps({ lookupOfficialGemeente: async () => "Haarlem", recordPickupApproach: (e) => gezien.push(e) })
  );
  assert.deepEqual(gezien, [{ outcome: "offer_on_request", reason: "unassigned_service_area" }]);
});
