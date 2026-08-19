// Hotfix 2026-08-19: het adres dat de autocomplete daadwerkelijk verstuurt
// voor Rotterdam The Hague Airport ("Rotterdam Airportplein 60, 3045 AP
// Rotterdam", zie addressLabelFor() in local-locations.ts) resolveerde vóór
// deze hotfix naar de STAD Rotterdam (via de generieke postcode-stadsfallback
// 3000–3089), waardoor de luchthavencontext (vluchtnummerplicht,
// flightDirection) verloren ging en de klant de stadsprijs betaalde i.p.v. de
// vaste luchthavenprijs. Deze test bewijst het eind-tot-eind-gedrag via
// resolveQuoteWith met geïnjecteerde fakes (geen database/netwerk) — inclusief
// dat de vaste route vóór alle overige logica wordt gevonden en dat er
// daarbij nul Google-routingcalls plaatsvinden.
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

const AMSTERDAM: LocationRow = {
  id: "loc-amsterdam",
  slug: "amsterdam",
  name: "Amsterdam",
  active: true,
  location_type: "city",
  city_id: "city-amsterdam",
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
  ["amsterdam", AMSTERDAM],
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

/** Zelfde volgorde als de echte findLocation() in service.ts: 0) priority-alias, 1) exacte slug, 2) alias, 3) naam. */
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
      pickupId === AMSTERDAM.id && dropoffId === ROTTERDAM_AIRPORT.id
        ? {
            price: 119,
            return_price: 214,
            currency: "EUR",
            distance_km: 73,
            estimated_duration_min: 58,
            vat_rate: 9,
            source_label: "Amsterdam → Rotterdam Airport",
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

const AUTOCOMPLETE_ADDRESS = "Rotterdam Airportplein 60, 3045 AP Rotterdam";

for (const dropoff of [AUTOCOMPLETE_ADDRESS, "Rotterdam The Hague Airport", "Rotterdam Airport"]) {
  test(`Amsterdam → "${dropoff}" vindt de bestaande vaste route (€119 enkel/€214 retour), niet de stadsprijs`, async () => {
    let getRouteCalled = false;
    const res = await resolveQuoteWith(
      input("Amsterdam", dropoff),
      makeDeps({
        getRoute: async () => {
          getRouteCalled = true;
          return { distanceKm: 73, durationMin: 58 };
        },
      })
    );
    assert.equal(res.available, true);
    if (!res.available) return;
    assert.equal(res.source, "fixed_route_prices");
    assert.equal(res.singlePrice, 119, "exact de bestaande DB-route, niet de stadsprijs (129)");
    assert.equal(res.returnPrice, 214);
    assert.equal(getRouteCalled, false, "getRoute (Google Directions) mag niet aangeroepen worden bij een vaste-routematch");
  });
}

test("luchthavencontext en vluchtnummerplicht zijn actief: dropoffIsAirport/isAirportTransfer=true, flightDirection='departure'", async () => {
  const res = await resolveQuoteWith(input("Amsterdam", AUTOCOMPLETE_ADDRESS), makeDeps());
  assert.equal(res.available, true);
  if (!res.available) return;
  assert.equal(res.airport.dropoffIsAirport, true);
  assert.equal(res.airport.isAirportTransfer, true);
  assert.equal(res.airport.flightDirection, "departure");
  assert.equal(res.isAirportTransfer, true, "@deprecated top-level veld blijft in sync met airport.isAirportTransfer");
});

test("kaal 'Rotterdam' (de stad) blijft de stad — nooit per ongeluk de luchthaven", async () => {
  // Na samenvoeging met het pickup-aanrijmodel (PR #20) loopt elke NIET-vaste
  // route eerst door resolvePickupApproach() — zonder die deps zou dit adres
  // fail-closed op "Offerte op aanvraag" vallen, wat hier niets zegt over de
  // luchthaven-hotfix zelf. Fakes hieronder laten die stap slagen (gemeente
  // "Amsterdam" → basis "amsterdam-zuidoost", ruim binnen de 40km-grens).
  const res = await resolveQuoteWith(
    input("Amsterdam", "Rotterdam"),
    makeDeps({
      findFixedRoute: async () => null, // geen vaste stad-route in deze fake — irrelevant voor het punt van de test
      getRoute: async (origin) =>
        origin === "1102JL Amsterdam-Zuidoost" ? { distanceKm: 12, durationMin: 15 } : { distanceKm: 80, durationMin: 70 },
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
        new Map([["amsterdam-zuidoost", { id: "base-amsterdam-zuidoost", slug: "amsterdam-zuidoost", label: "Amsterdam-Zuidoost", postcode: "1102JL", latitude: 52.319773, longitude: 4.956975 }]]),
      loadServiceAreaBaseSlugs: async () => new Map([["amsterdam", "amsterdam-zuidoost"]]),
      lookupOfficialGemeente: async () => "Amsterdam",
    })
  );
  assert.equal(res.available, true);
  if (!res.available) return;
  assert.equal(res.airport.dropoffIsAirport, false, "'Rotterdam' alleen mag nooit als luchthaven herkend worden");
});
