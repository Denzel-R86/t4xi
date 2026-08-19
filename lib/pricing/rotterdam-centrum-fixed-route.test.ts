// Hotfix 2026-08-19: "Rotterdam centrum" moet dezelfde vaste route vinden als
// "Rotterdam" (de bestaande €39-route naar Rotterdam Airport). Deze test
// bewijst het EIND-TOT-EIND-gedrag via resolveQuoteWith met geïnjecteerde
// fakes (geen database/netwerk) — inclusief dat de vaste route vóór alle
// afstand-/deadheadlogica wordt gevonden en dat er daarbij nul routing-/
// PDOK-aanroepen plaatsvinden. De pure alias-resolutie zelf staat in
// location-aliases.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveQuoteWith, type ResolveQuoteDeps, type PricingQuoteInput } from "@/lib/pricing/service";
import { resolveLocationSlug, resolvePriorityLocationSlug } from "@/lib/pricing/location-aliases";

const vclass = { id: "veh-exec-ev", code: "executive-ev", max_passengers: 4, max_luggage: 3, active: true };

type LocationRow = {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  location_type: string;
  city_id: string | null;
};

const ROTTERDAM: LocationRow = {
  id: "loc-rotterdam",
  slug: "rotterdam",
  name: "Rotterdam",
  active: true,
  location_type: "city",
  city_id: "city-rotterdam",
};
const ROTTERDAM_CENTRUM: LocationRow = {
  id: "loc-rotterdam-centrum",
  slug: "rotterdam-centrum",
  name: "Rotterdam Centrum",
  active: true,
  location_type: "district",
  city_id: "city-rotterdam",
};
const ROTTERDAM_AIRPORT: LocationRow = {
  id: "loc-rotterdam-airport",
  slug: "rotterdam-airport",
  name: "Rotterdam The Hague Airport",
  active: true,
  location_type: "airport",
  city_id: "city-rotterdam",
};

const LOCATIONS_BY_SLUG = new Map<string, LocationRow>([
  ["rotterdam", ROTTERDAM],
  ["rotterdam-centrum", ROTTERDAM_CENTRUM],
  ["rotterdam-airport", ROTTERDAM_AIRPORT],
]);

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Zelfde resolutievolgorde als de echte findLocation() in service.ts (Stap
 * 10l): 1) exacte slug, 2) alias (resolveLocationSlug — de functie die deze
 * hotfix wijzigt), 3) naam. Fake, geen database — puur om resolveLocationSlug
 * binnen de volledige pijplijn te bewijzen, niet om findLocation zelf te testen.
 */
async function fakeFindLocation(raw: string): Promise<LocationRow | null> {
  const priority = resolvePriorityLocationSlug(raw);
  if (priority) {
    const prioritized = LOCATIONS_BY_SLUG.get(priority);
    if (prioritized) return prioritized;
  }
  const exact = LOCATIONS_BY_SLUG.get(slugify(raw));
  if (exact) return exact;
  const alias = resolveLocationSlug(raw);
  if (alias) return LOCATIONS_BY_SLUG.get(alias) ?? null;
  return null;
}

function makeDeps(overrides: Partial<ResolveQuoteDeps> = {}): ResolveQuoteDeps {
  return {
    findLocation: fakeFindLocation,
    findVehicleClass: async () => vclass,
    findFixedRoute: async (pickupId, dropoffId) =>
      pickupId === ROTTERDAM.id && dropoffId === ROTTERDAM_AIRPORT.id
        ? {
            price: 39,
            return_price: 70,
            currency: "EUR",
            distance_km: 7,
            estimated_duration_min: 9,
            vat_rate: 9,
            source_label: "Rotterdam → Rotterdam Airport",
            valid_from: "2026-07-05T00:00:00.000Z",
            active: true,
          }
        : null,
    getRoute: async () => {
      throw new Error("getRoute mag nooit aangeroepen worden voor een vaste-routematch");
    },
    ...overrides,
  };
}

const input = (pickup: string, dropoff: string): PricingQuoteInput => ({ pickup, dropoff });

for (const pickup of ["Rotterdam centrum", "Rotterdam Centrum", "rotterdam centrum", "Rotterdam-centrum"]) {
  test(`"${pickup}" → Rotterdam Airport vindt de bestaande vaste route (€39), niet distance_tariff`, async () => {
    let getRouteCalled = false;
    const res = await resolveQuoteWith(
      input(pickup, "Rotterdam Airport"),
      makeDeps({
        getRoute: async () => {
          getRouteCalled = true;
          return { distanceKm: 7.6, durationMin: 10 };
        },
      })
    );
    assert.equal(res.available, true);
    assert.equal(res.available && res.source, "fixed_route_prices");
    assert.equal(res.available && res.singlePrice, 39, "exact de bestaande DB-route, niet een dynamische prijs");
    assert.equal(res.available && res.returnPrice, 70);
    assert.equal(getRouteCalled, false, "getRoute (Google Directions) mag niet aangeroepen worden bij een vaste-routematch");
  });
}

test("plain 'Rotterdam' en 'Rotterdam Centraal' blijven ongewijzigd naar dezelfde vaste route resolven", async () => {
  for (const pickup of ["Rotterdam", "rotterdam", "Rotterdam Centraal"]) {
    const res = await resolveQuoteWith(input(pickup, "Rotterdam Airport"), makeDeps());
    assert.equal(res.available, true);
    assert.equal(res.available && res.source, "fixed_route_prices");
    assert.equal(res.available && res.singlePrice, 39, pickup);
  }
});

test("een écht straatadres in het centrum (met postcode) blijft naar de wijk-slug resolven — geen vaste route voor die combinatie, dus distance_tariff (ongewijzigd, bestaand gedrag)", async () => {
  // Na samenvoeging met het pickup-aanrijmodel (PR #20) loopt elke NIET-vaste
  // route eerst door resolvePickupApproach() — zonder die deps zou dit adres
  // fail-closed op "Offerte op aanvraag" vallen (config_or_routing_unavailable),
  // wat hier niets zegt over de Rotterdam-centrum-hotfix zelf. Fakes hieronder
  // laten die stap slagen (gemeente "Rotterdam" → basis "spijkenisse", ruim
  // binnen de 40km-grens) zodat deze test weer uitsluitend de vaste-route-vs-
  // distance_tariff-vraag beantwoordt.
  const res = await resolveQuoteWith(
    input("Coolsingel 40, 3011 AD Rotterdam", "Rotterdam Airport"),
    makeDeps({
      getRoute: async (origin) =>
        origin === "3201LG Spijkenisse" ? { distanceKm: 12, durationMin: 15 } : { distanceKm: 7.6, durationMin: 10 },
      loadApproachFeeConfig: async () => ({
        customerSharePct: 0.5,
        freeKm: 5,
        fullCoverageKm: 15,
        maxCustomerComponentCents: 2500,
        maxApproachKm: 40,
        perKmCents: 65,
        perMinCents: 110,
      }),
      loadOperationalBases: async () =>
        new Map([["spijkenisse", { id: "base-spijkenisse", slug: "spijkenisse", label: "Spijkenisse", postcode: "3201LG", latitude: 51.852165, longitude: 4.335123 }]]),
      loadServiceAreaBaseSlugs: async () => new Map([["rotterdam", "spijkenisse"]]),
      lookupOfficialGemeente: async () => "Rotterdam",
    })
  );
  assert.equal(res.available, true);
  assert.equal(res.available && res.source, "distance_tariff", "rotterdam-centrum heeft geen eigen vaste route — dat is bestaand, ongewijzigd gedrag");
});
