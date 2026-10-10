import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  resolveArrivalSurcharge,
  applyArrivalSurcharge,
  type AirportArrivalSurchargeConfig,
} from "@/lib/pricing/airport-arrival-surcharge";

const SCHIPHOL: AirportArrivalSurchargeConfig = { airportSlug: "schiphol-airport", surchargeCents: 1500 };

// ── resolveArrivalSurcharge ──────────────────────────────────────────────────

test("geen toeslag wanneer de rit niet op een luchthaven begint", () => {
  assert.equal(resolveArrivalSurcharge({ pickupIsAirport: false, config: SCHIPHOL }), null);
});

test("geen toeslag zonder configuratierij — nooit een stilzwijgende default", () => {
  assert.equal(resolveArrivalSurcharge({ pickupIsAirport: true, config: null }), null);
});

test("toeslag bij luchthaven-pickup met configuratie", () => {
  const r = resolveArrivalSurcharge({ pickupIsAirport: true, config: SCHIPHOL });
  assert.deepEqual(r, { airportSlug: "schiphol-airport", surchargeCents: 1500, appliedOnce: true });
});

test("fail-closed bij onbruikbaar bedrag (negatief, niet-geheel, NaN, 0)", () => {
  for (const bedrag of [-1, 12.5, Number.NaN, Number.POSITIVE_INFINITY, 0]) {
    const r = resolveArrivalSurcharge({
      pickupIsAirport: true,
      config: { airportSlug: "x", surchargeCents: bedrag },
    });
    assert.equal(r, null, `bedrag ${bedrag} had geen toeslag mogen opleveren`);
  }
});

// ── applyArrivalSurcharge ────────────────────────────────────────────────────

test("toeslag wordt EXACT EENMAAL opgeteld bij enkele reis", () => {
  const surcharge = resolveArrivalSurcharge({ pickupIsAirport: true, config: SCHIPHOL });
  const r = applyArrivalSurcharge({ singleCents: 10200, returnCents: 18400, surcharge });
  assert.equal(r.singleCents, 11700, "Schiphol -> Almere: 102,00 + 15,00 = 117,00");
});

test("toeslag wordt bij RETOUR eenmaal opgeteld, niet verdubbeld", () => {
  const surcharge = resolveArrivalSurcharge({ pickupIsAirport: true, config: SCHIPHOL });
  const r = applyArrivalSurcharge({ singleCents: 10200, returnCents: 18400, surcharge });
  assert.equal(r.returnCents, 19900, "184,00 + 15,00 = 199,00 — niet 184,00 + 30,00");
  assert.notEqual(r.returnCents, 18400 + 2 * 1500);
});

test("retour blijft null wanneer de route geen retourprijs heeft", () => {
  const surcharge = resolveArrivalSurcharge({ pickupIsAirport: true, config: SCHIPHOL });
  const r = applyArrivalSurcharge({ singleCents: 10200, returnCents: null, surcharge });
  assert.equal(r.returnCents, null);
  assert.equal(r.singleCents, 11700);
});

test("zonder toeslag blijven beide bedragen ongewijzigd", () => {
  const r = applyArrivalSurcharge({ singleCents: 10200, returnCents: 18400, surcharge: null });
  assert.deepEqual(r, { singleCents: 10200, returnCents: 18400 });
});

test("het verschil heen/terug is precies de toeslag, voor elk bedrag", () => {
  const surcharge = resolveArrivalSurcharge({ pickupIsAirport: true, config: SCHIPHOL });
  for (const basis of [3900, 5000, 10200, 13700, 20900]) {
    const r = applyArrivalSurcharge({ singleCents: basis, returnCents: Math.round(basis * 1.8), surcharge });
    assert.equal(r.singleCents - basis, 1500);
    assert.equal((r.returnCents as number) - Math.round(basis * 1.8), 1500);
  }
});

// ── Structurele borging in service.ts ────────────────────────────────────────

const service = readFileSync(new URL("./service.ts", import.meta.url), "utf8");

test("de nachttoeslagbasis blijft EXCLUSIEF de aankomsttoeslag", () => {
  // rideOnlySinglePriceCents voedt de nachttoeslag in snapshot.ts. Zou die de
  // toeslag bevatten, dan werd parkeren/monitoring ongemerkt met 15% opgehoogd
  // en bij een retour dubbel belast.
  assert.match(
    service,
    /rideOnlySinglePriceCents: eurosToCents\(fixed\.price\)/,
    "rideOnlySinglePriceCents moet de kale vaste routeprijs blijven"
  );
  assert.doesNotMatch(
    service,
    /rideOnlySinglePriceCents: withSurcharge\./,
    "de toeslag mag nooit in de nachttoeslagbasis terechtkomen"
  );
});

test("de toeslag wordt uitsluitend bij een luchthaven-pickup opgehaald", () => {
  assert.match(service, /if \(airport\.pickupIsAirport && deps\.loadArrivalSurcharge\)/);
});

test("de publieke quote-API lekt de interne toeslagregel niet", () => {
  const api = readFileSync(new URL("../../app/api/pricing/quote/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(api, /airportArrival/, "airportArrival is INTERN en hoort niet in de API-response");
});

// ── End-to-end door de echte resolver ────────────────────────────────────────

import { resolveQuoteWith, type ResolveQuoteDeps } from "@/lib/pricing/service";

const SCHIPHOL_LOC = {
  id: "schiphol-id",
  slug: "schiphol-airport",
  name: "Schiphol Airport",
  active: true,
  location_type: "airport" as const,
  city_id: "haarlemmermeer-id",
};
const ALMERE_LOC = {
  id: "almere-id",
  slug: "almere",
  name: "Almere",
  active: true,
  location_type: "city" as const,
  city_id: "almere-city-id",
};
const VCLASS = { id: "veh", code: "executive-ev", max_passengers: 4, max_luggage: 3, active: true };

/** Gespiegelde vaste route Schiphol -> Almere: de kale heenprijs, zonder toeslag. */
const GESPIEGELD = {
  price: 102,
  return_price: 184,
  currency: "EUR",
  distance_km: 39,
  estimated_duration_min: 38,
  vat_rate: 9,
  source_label: "spiegeling-terugrichting-2026-10-10",
  valid_from: "2026-10-10T00:00:00Z",
  active: true,
};

function arrivalDeps(over: Partial<ResolveQuoteDeps> = {}): ResolveQuoteDeps {
  return {
    findLocation: async (raw: string) =>
      /schiphol/i.test(raw) ? SCHIPHOL_LOC : ALMERE_LOC,
    findVehicleClass: async () => VCLASS,
    findFixedRoute: async () => GESPIEGELD,
    getRoute: async () => null,
    loadArrivalSurcharge: async () => SCHIPHOL,
    ...over,
  } as ResolveQuoteDeps;
}

test("E2E: Schiphol -> Almere levert 117 euro (102 gespiegeld + 15 toeslag)", async () => {
  const res = await resolveQuoteWith({ pickup: "Schiphol", dropoff: "Almere" }, arrivalDeps());
  assert.equal(res.available, true);
  if (!res.available) return;
  assert.equal(res.price, 117);
  assert.equal(res.priceCents, 11700);
  assert.equal(res.source, "fixed_route_prices");
  assert.deepEqual(res.airportArrival, {
    airportSlug: "schiphol-airport",
    surchargeCents: 1500,
    appliedOnce: true,
  });
});

test("E2E: retour vanaf Schiphol krijgt de toeslag EENMAAL (199, niet 214)", async () => {
  const res = await resolveQuoteWith(
    { pickup: "Schiphol", dropoff: "Almere", returnTrip: true },
    arrivalDeps()
  );
  assert.equal(res.available, true);
  if (!res.available) return;
  assert.equal(res.price, 199, "184 + 15 eenmaal");
  assert.notEqual(res.price, 214, "mag niet 184 + 2x15 zijn");
});

test("E2E: nachttoeslagbasis blijft de kale ritprijs, niet de prijs met toeslag", async () => {
  const res = await resolveQuoteWith({ pickup: "Schiphol", dropoff: "Almere" }, arrivalDeps());
  assert.equal(res.available, true);
  if (!res.available) return;
  assert.equal(res.rideOnlySinglePriceCents, 10200, "de toeslag hoort hier buiten te blijven");
  assert.equal(res.priceCents - res.rideOnlySinglePriceCents, 1500);
});

test("E2E: de omgekeerde richting (naar Schiphol) krijgt GEEN toeslag", async () => {
  const res = await resolveQuoteWith(
    { pickup: "Almere", dropoff: "Schiphol" },
    arrivalDeps({ findLocation: async (raw: string) => (/schiphol/i.test(raw) ? SCHIPHOL_LOC : ALMERE_LOC) })
  );
  assert.equal(res.available, true);
  if (!res.available) return;
  assert.equal(res.price, 102, "vertrekrit blijft ongewijzigd");
  assert.equal(res.airportArrival, null);
});

test("E2E: zonder configuratierij blijft de prijs de kale spiegelprijs", async () => {
  const res = await resolveQuoteWith(
    { pickup: "Schiphol", dropoff: "Almere" },
    arrivalDeps({ loadArrivalSurcharge: async () => null })
  );
  assert.equal(res.available, true);
  if (!res.available) return;
  assert.equal(res.price, 102, "nooit een stilzwijgende default-toeslag");
  assert.equal(res.airportArrival, null);
});

test("E2E: storing in de toeslagtabel blokkeert de offerte niet", async () => {
  const res = await resolveQuoteWith(
    { pickup: "Schiphol", dropoff: "Almere" },
    arrivalDeps({
      loadArrivalSurcharge: async () => {
        throw new Error("config onbereikbaar (gesimuleerd)");
      },
    })
  );
  assert.equal(res.available, true, "een geldige vaste prijs mag niet wegvallen door een toeslagstoring");
  if (!res.available) return;
  assert.equal(res.price, 102);
  assert.equal(res.airportArrival, null);
});
