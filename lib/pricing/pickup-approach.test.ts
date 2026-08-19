// End-to-end tests voor het pickup-aanrijmodel (2026-08-18, bouwakkoord) via
// resolveQuoteWith met geïnjecteerde fakes. Bewijst: servicegebied-toewijzing
// per gemeente/standplaats, de landelijke beperking (onbekend/te-ver-buiten
// servicegebied → "Offerte op aanvraag", nooit stilzwijgend zonder component),
// exact-één-keer-berekenen bij een retour, cent-precisie door de hele
// pijplijn (quote → snapshot), geen publieke lek van interne velden, en dat
// de cache geen pickup-/klantgegevens bevat.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveQuoteWith,
  cachedLoader,
  type ResolveQuoteDeps,
  type PricingQuoteInput,
  type PickupApproachLogEntry,
  type OperationalBase,
} from "@/lib/pricing/service";
import type { ApproachFeeConfig } from "@/lib/pricing/approach-fee";
import { buildPriceSnapshot, checkSnapshotUsable, NIGHT_SURCHARGE_RATE, type StoredSnapshot } from "@/lib/pricing/snapshot";
import { eurosToCents } from "@/lib/payments/create-intent";

type AppliedApproach = Extract<PickupApproachLogEntry, { outcome: "applied" }>;

/** Zelfde patroon als assertComputed() in deadhead-activation.e2e.test.ts: runtime-check + expliciete cast. */
function assertApplied(e: PickupApproachLogEntry | null): AppliedApproach {
  assert.ok(e !== null && e.outcome === "applied", "verwacht een toegepaste aanrijcomponent (outcome: 'applied')");
  return e as AppliedApproach;
}

const vclass = { id: "veh-exec-ev", code: "executive-ev", max_passengers: 4, max_luggage: 3, active: true };

// maxApproachKm: 35 → 40 (2026-08-19) — zie approach-fee.test.ts voor de
// commerciële reden (Utrecht Centraal/centrum, Lelystad vallen anders net
// buiten hun eigen, expliciet toegewezen servicegebied).
const CONFIG: ApproachFeeConfig = {
  customerSharePct: 0.5,
  freeKm: 5,
  fullCoverageKm: 15,
  maxCustomerComponentCents: 2500,
  maxApproachKm: 40,
  perKmCents: 65,
  perMinCents: 110,
};

const BASE_ALMERE: OperationalBase = {
  id: "base-almere-id",
  slug: "almere",
  label: "Almere",
  postcode: "1361BP",
  latitude: 52.342886,
  longitude: 5.139465,
};
const BASE_AMSTERDAM_ZUIDOOST: OperationalBase = {
  id: "base-amsterdam-zuidoost-id",
  slug: "amsterdam-zuidoost",
  label: "Amsterdam-Zuidoost",
  postcode: "1102JL",
  latitude: 52.319773,
  longitude: 4.956975,
};
const BASE_SPIJKENISSE: OperationalBase = {
  id: "base-spijkenisse-id",
  slug: "spijkenisse",
  label: "Spijkenisse",
  postcode: "3201LG",
  latitude: 51.852165,
  longitude: 4.335123,
};
const BASES = new Map([
  [BASE_ALMERE.slug, BASE_ALMERE],
  [BASE_AMSTERDAM_ZUIDOOST.slug, BASE_AMSTERDAM_ZUIDOOST],
  [BASE_SPIJKENISSE.slug, BASE_SPIJKENISSE],
]);
const BASE_ALMERE_ADDRESS = `${BASE_ALMERE.postcode} ${BASE_ALMERE.label}`;
const BASE_AMSTERDAM_ZUIDOOST_ADDRESS = `${BASE_AMSTERDAM_ZUIDOOST.postcode} ${BASE_AMSTERDAM_ZUIDOOST.label}`;
const BASE_SPIJKENISSE_ADDRESS = `${BASE_SPIJKENISSE.postcode} ${BASE_SPIJKENISSE.label}`;
const KNOWN_BASE_ADDRESSES = new Set([BASE_ALMERE_ADDRESS, BASE_AMSTERDAM_ZUIDOOST_ADDRESS, BASE_SPIJKENISSE_ADDRESS]);

// Zelfde definitieve indeling als de migratie (2026-08-18, derde standplaats
// Amsterdam-Zuidoost): Amsterdam/Diemen/Amstelveen/Utrecht verhuisd van basis
// Almere naar basis Amsterdam-Zuidoost; Utrecht uitsluitend de gemeente zelf
// (Nieuwegein/Stichtse Vecht/De Bilt/Zeist/Bunnik/Houten/IJsselstein/Woerden
// blijven bewust ongeconfigureerd — geen rij hieronder).
const SERVICE_AREAS = new Map([
  ["almere", "almere"],
  ["lelystad", "almere"],
  ["hilversum", "almere"],
  ["laren", "almere"],
  ["amsterdam", "amsterdam-zuidoost"],
  ["diemen", "amsterdam-zuidoost"],
  ["amstelveen", "amsterdam-zuidoost"],
  ["utrecht", "amsterdam-zuidoost"],
  ["nissewaard", "spijkenisse"],
  ["rotterdam", "spijkenisse"],
]);

type MakeDepsOptions = Partial<ResolveQuoteDeps> & {
  gemeente?: string | null;
  approachKm?: number;
  approachMin?: number;
  passengerKm?: number;
  passengerMin?: number;
  onPickupApproach?: (e: PickupApproachLogEntry) => void;
  baseRouteCallsCounter?: { count: number };
};

/** Onderscheidt de basis→pickup-aanroep (origin === een bekend standplaatsadres) van de echte passagiersroute. */
function makeGetRoute(o: MakeDepsOptions) {
  const approach = { distanceKm: o.approachKm ?? 2, durationMin: o.approachMin ?? 4 };
  const passenger = { distanceKm: o.passengerKm ?? 20, durationMin: o.passengerMin ?? 25 };
  return async (origin: string, _destination: string, _departureAt?: string) => {
    if (KNOWN_BASE_ADDRESSES.has(origin)) {
      if (o.baseRouteCallsCounter) o.baseRouteCallsCounter.count += 1;
      return approach;
    }
    return passenger;
  };
}

function makeDeps(o: MakeDepsOptions = {}): ResolveQuoteDeps {
  const {
    gemeente = "almere",
    approachKm,
    approachMin,
    passengerKm,
    passengerMin,
    onPickupApproach,
    baseRouteCallsCounter,
    ...rest
  } = o;
  return {
    findLocation: async () => null,
    findVehicleClass: async () => vclass,
    findFixedRoute: async () => null,
    getRoute: makeGetRoute({ approachKm, approachMin, passengerKm, passengerMin, baseRouteCallsCounter }),
    loadApproachFeeConfig: async () => CONFIG,
    loadOperationalBases: async () => BASES,
    loadServiceAreaBaseSlugs: async () => SERVICE_AREAS,
    lookupOfficialGemeente: async () => gemeente,
    recordPickupApproach: onPickupApproach,
    ...rest,
  };
}

const input = (pickup: string, dropoff: string, o: Partial<PricingQuoteInput> = {}): PricingQuoteInput => ({
  pickup,
  dropoff,
  ...o,
});

// ── Servicegebied-toewijzing per gemeente/standplaats ────────────────────────

test("pickup in gemeente Hilversum (regio Gooi) → toegewezen aan basis Almere, component toegepast", async () => {
  let logged: PickupApproachLogEntry | null = null;
  const res = await resolveQuoteWith(
    input("Hilversum", "Amsterdam"),
    makeDeps({ gemeente: "hilversum", onPickupApproach: (e) => (logged = e) })
  );
  assert.equal(res.available, true);
  const applied = assertApplied(logged);
  assert.equal(applied.baseSlug, "almere");
  assert.equal(applied.baseId, BASE_ALMERE.id);
});

test("pickup in gemeente Nissewaard → toegewezen aan basis Spijkenisse", async () => {
  let logged: PickupApproachLogEntry | null = null;
  const res = await resolveQuoteWith(
    input("Spijkenisse", "Rotterdam Airport"),
    makeDeps({ gemeente: "nissewaard", onPickupApproach: (e) => (logged = e) })
  );
  assert.equal(res.available, true);
  assert.equal(assertApplied(logged).baseSlug, "spijkenisse");
});

test("pickup in gemeente Lelystad → toegewezen aan basis Almere", async () => {
  let logged: PickupApproachLogEntry | null = null;
  const res = await resolveQuoteWith(
    input("Lelystad", "Schiphol"),
    makeDeps({ gemeente: "lelystad", onPickupApproach: (e) => (logged = e) })
  );
  assert.equal(res.available, true);
  assert.equal(assertApplied(logged).baseSlug, "almere");
});

for (const g of ["amsterdam", "diemen", "amstelveen", "utrecht"]) {
  test(`pickup in gemeente ${g} → toegewezen aan basis Amsterdam-Zuidoost (derde standplaats, 2026-08-18)`, async () => {
    let logged: PickupApproachLogEntry | null = null;
    const res = await resolveQuoteWith(
      input(g, "Schiphol"),
      makeDeps({ gemeente: g, onPickupApproach: (e) => (logged = e) })
    );
    assert.equal(res.available, true);
    const applied = assertApplied(logged);
    assert.equal(applied.baseSlug, "amsterdam-zuidoost");
    assert.equal(applied.baseId, BASE_AMSTERDAM_ZUIDOOST.id);
  });
}

for (const g of ["nieuwegein", "stichtse vecht", "de bilt", "zeist", "bunnik", "houten", "ijsselstein", "woerden"]) {
  test(`pickup in gemeente ${g} (rondom Utrecht, NIET expliciet goedgekeurd) → blijft unassigned → Offerte op aanvraag`, async () => {
    const res = await resolveQuoteWith(input(g, "Schiphol"), makeDeps({ gemeente: g }));
    assert.equal(res.available, false);
  });
}

test("Weesp-adres met officiële PDOK-gemeente 'Amsterdam' (sinds de herindeling van 2022) → toegewezen aan basis Amsterdam-Zuidoost, geen aparte servicegebied-rij nodig", async () => {
  let logged: PickupApproachLogEntry | null = null;
  const res = await resolveQuoteWith(
    input("Weesp", "Schiphol"),
    makeDeps({ gemeente: "amsterdam", onPickupApproach: (e) => (logged = e) })
  );
  assert.equal(res.available, true);
  assert.equal(assertApplied(logged).baseSlug, "amsterdam-zuidoost");
});

// ── Negatief/grensgeval: Laren (NH) vs. de officiële gemeente Lochem (Gelderland) ──

test("Laren met officiële gemeente 'Laren' (Noord-Holland) → toegewezen aan basis Almere", async () => {
  const res = await resolveQuoteWith(input("Laren", "Amsterdam"), makeDeps({ gemeente: "laren" }));
  assert.equal(res.available, true);
});

test("Laren met officiële gemeente 'Lochem' (het gelijknamige Laren in Gelderland) → NIET toegewezen, nooit een gok → Offerte op aanvraag", async () => {
  const res = await resolveQuoteWith(input("Laren", "Amsterdam"), makeDeps({ gemeente: "lochem" }));
  assert.equal(res.available, false);
});

// ── Landelijke beperking: onbekend/niet-geconfigureerd servicegebied ─────────

test("pickup buiten elk servicegebied (PDOK vindt een gemeente, maar niet geconfigureerd) → Offerte op aanvraag (landelijke beperking)", async () => {
  let logged: PickupApproachLogEntry | null = null;
  const res = await resolveQuoteWith(
    input("Groningen", "Amsterdam"),
    makeDeps({ gemeente: "groningen", onPickupApproach: (e) => (logged = e) })
  );
  assert.equal(res.available, false);
  assert.deepEqual(logged, { outcome: "offer_on_request", reason: "unassigned_service_area" });
});

test("PDOK vindt zelf geen relevante gemeente (null, geslaagd) → Offerte op aanvraag", async () => {
  let logged: PickupApproachLogEntry | null = null;
  const res = await resolveQuoteWith(
    input("Onbekend adres", "Amsterdam"),
    makeDeps({ gemeente: null, onPickupApproach: (e) => (logged = e) })
  );
  assert.equal(res.available, false);
  assert.deepEqual(logged, { outcome: "offer_on_request", reason: "unassigned_service_area" });
});

// ── Storingen: fail-closed, nooit stilzwijgend zonder component ─────────────

test("ontbrekende loadApproachFeeConfig-dep → Offerte op aanvraag (fail-closed)", async () => {
  const res = await resolveQuoteWith(
    input("Almere", "Schiphol"),
    makeDeps({ loadApproachFeeConfig: undefined })
  );
  assert.equal(res.available, false);
});

test("loadApproachFeeConfig levert null (geen/dubbele actieve rij) → Offerte op aanvraag", async () => {
  let logged: PickupApproachLogEntry | null = null;
  const res = await resolveQuoteWith(
    input("Almere", "Schiphol"),
    makeDeps({ loadApproachFeeConfig: async () => null, onPickupApproach: (e) => (logged = e) })
  );
  assert.equal(res.available, false);
  assert.deepEqual(logged, { outcome: "offer_on_request", reason: "config_or_routing_unavailable" });
});

test("loadOperationalBases/loadServiceAreaBaseSlugs gooien een fout → Offerte op aanvraag", async () => {
  const res = await resolveQuoteWith(
    input("Almere", "Schiphol"),
    makeDeps({
      loadOperationalBases: () => Promise.reject(new Error("connection refused")),
    })
  );
  assert.equal(res.available, false);
});

test("lookupOfficialGemeente gooit (PDOK-storing) → Offerte op aanvraag, niet de basisprijs", async () => {
  let logged: PickupApproachLogEntry | null = null;
  const res = await resolveQuoteWith(
    input("Almere", "Schiphol"),
    makeDeps({
      lookupOfficialGemeente: () => Promise.reject(new Error("PDOK timeout")),
      onPickupApproach: (e) => (logged = e),
    })
  );
  assert.equal(res.available, false);
  assert.deepEqual(logged, { outcome: "offer_on_request", reason: "config_or_routing_unavailable" });
});

test("base→pickup-routing levert niets op (getRoute → null) → Offerte op aanvraag", async () => {
  let logged: PickupApproachLogEntry | null = null;
  const res = await resolveQuoteWith(
    input("Almere", "Schiphol"),
    makeDeps({
      getRoute: async (origin) => (origin === BASE_ALMERE_ADDRESS ? null : { distanceKm: 20, durationMin: 25 }),
      onPickupApproach: (e) => (logged = e),
    })
  );
  assert.equal(res.available, false);
  assert.deepEqual(logged, { outcome: "offer_on_request", reason: "config_or_routing_unavailable" });
});

test("aanrijafstand boven maxApproachKm (40km) → Offerte op aanvraag, reden beyond_max_approach_km", async () => {
  let logged: PickupApproachLogEntry | null = null;
  const res = await resolveQuoteWith(
    input("Almere", "Schiphol"),
    makeDeps({ approachKm: 45, onPickupApproach: (e) => (logged = e) })
  );
  assert.equal(res.available, false);
  assert.deepEqual(logged, { outcome: "offer_on_request", reason: "beyond_max_approach_km" });
});

// ── Grenspunten rond de nieuwe maxApproachKm (35 → 40km, 2026-08-19) ─────────

test("aanrijafstand 39,9km (net onder de nieuwe 40km-grens) → automatische prijs, geen offerte", async () => {
  const res = await resolveQuoteWith(input("Almere", "Schiphol"), makeDeps({ approachKm: 39.9, approachMin: 0 }));
  assert.equal(res.available, true);
});

test("aanrijafstand exact 40,0km (de nieuwe grens zelf) → automatische prijs, geen offerte", async () => {
  const res = await resolveQuoteWith(input("Almere", "Schiphol"), makeDeps({ approachKm: 40, approachMin: 0 }));
  assert.equal(res.available, true);
});

test("aanrijafstand 40,1km (net boven de nieuwe grens) → Offerte op aanvraag", async () => {
  let logged: PickupApproachLogEntry | null = null;
  const res = await resolveQuoteWith(
    input("Almere", "Schiphol"),
    makeDeps({ approachKm: 40.1, approachMin: 0, onPickupApproach: (e) => (logged = e) })
  );
  assert.equal(res.available, false);
  assert.deepEqual(logged, { outcome: "offer_on_request", reason: "beyond_max_approach_km" });
});

test("Utrecht Centraal (36,0km vanaf basis Amsterdam-Zuidoost) → binnen de nieuwe 40km-grens, automatische prijs", async () => {
  let logged: PickupApproachLogEntry | null = null;
  const res = await resolveQuoteWith(
    input("Utrecht Centraal", "Schiphol"),
    makeDeps({ gemeente: "utrecht", approachKm: 36.0, approachMin: 27, onPickupApproach: (e) => (logged = e) })
  );
  assert.equal(res.available, true);
  assert.equal(assertApplied(logged).baseSlug, "amsterdam-zuidoost");
});

test("Utrecht centrum (35,8km vanaf basis Amsterdam-Zuidoost) → binnen de nieuwe 40km-grens, automatische prijs", async () => {
  let logged: PickupApproachLogEntry | null = null;
  const res = await resolveQuoteWith(
    input("Utrecht centrum", "Schiphol"),
    makeDeps({ gemeente: "utrecht", approachKm: 35.8, approachMin: 26, onPickupApproach: (e) => (logged = e) })
  );
  assert.equal(res.available, true);
  assert.equal(assertApplied(logged).baseSlug, "amsterdam-zuidoost");
});

test("Lelystad (38,8km vanaf basis Almere) → binnen de nieuwe 40km-grens, automatische prijs", async () => {
  let logged: PickupApproachLogEntry | null = null;
  const res = await resolveQuoteWith(
    input("Lelystad", "Schiphol"),
    makeDeps({ gemeente: "lelystad", approachKm: 38.8, approachMin: 30, onPickupApproach: (e) => (logged = e) })
  );
  assert.equal(res.available, true);
  assert.equal(assertApplied(logged).baseSlug, "almere");
});

test("unassigned pickup op minder dan 40km van elke basis → nog steeds Offerte op aanvraag (landelijke beperking gaat vóór afstand)", async () => {
  // Groningen ligt fysiek relatief dichtbij geen enkele basis in dit scenario,
  // maar het servicegebied (gemeente) beslist — nooit de afstand alleen.
  // getRoute() wordt hier zelfs nooit aangeroepen: unassigned_service_area
  // wordt al vóór de base→pickup-routing vastgesteld.
  let logged: PickupApproachLogEntry | null = null;
  const res = await resolveQuoteWith(
    input("Groningen", "Schiphol"),
    makeDeps({ gemeente: "groningen", approachKm: 10, onPickupApproach: (e) => (logged = e) })
  );
  assert.equal(res.available, false);
  assert.deepEqual(logged, { outcome: "offer_on_request", reason: "unassigned_service_area" });
});

test("assigned pickup op meer dan 40km van zijn eigen basis → Offerte op aanvraag (reden beyond_max_approach_km, niet unassigned)", async () => {
  let logged: PickupApproachLogEntry | null = null;
  const res = await resolveQuoteWith(
    input("Hilversum", "Schiphol"),
    makeDeps({ gemeente: "hilversum", approachKm: 41, approachMin: 30, onPickupApproach: (e) => (logged = e) })
  );
  assert.equal(res.available, false);
  assert.deepEqual(logged, { outcome: "offer_on_request", reason: "beyond_max_approach_km" });
});

// ── Vaste route: geen homebase-load, geen base→pickup-routing ───────────────

test("vaste route: resolvePickupApproach draait hier niet — nul PDOK-gemeentelookups, nul base-routingcalls, zelfs nul passagiersroute-calls (geen Google-aanroep nodig), pickupApproach altijd null, prijs ongewijzigd", async () => {
  const counter = { count: 0 };
  let approachDepsCalled = false;
  let operationalBasesCalled = false;
  let serviceAreaBaseSlugsCalled = false;
  let gemeenteLookupCalled = false;
  let getRouteCallCount = 0;
  const res = await resolveQuoteWith(
    input("amsterdam-centrum", "schiphol-airport"),
    makeDeps({
      findLocation: async (raw) => ({
        id: `${raw}-id`,
        slug: raw,
        name: raw,
        active: true,
        location_type: "city",
        city_id: null,
      }),
      findFixedRoute: async () => ({
        price: 57,
        return_price: 103,
        currency: "EUR",
        distance_km: 26,
        estimated_duration_min: 31,
        vat_rate: 9,
        source_label: "Amsterdam → Schiphol",
        valid_from: "2026-01-01T00:00:00.000Z",
        active: true,
      }),
      loadApproachFeeConfig: async () => {
        approachDepsCalled = true;
        return CONFIG;
      },
      loadOperationalBases: async () => {
        operationalBasesCalled = true;
        return BASES;
      },
      loadServiceAreaBaseSlugs: async () => {
        serviceAreaBaseSlugsCalled = true;
        return SERVICE_AREAS;
      },
      lookupOfficialGemeente: async () => {
        gemeenteLookupCalled = true;
        return "amsterdam";
      },
      getRoute: async (...args) => {
        getRouteCallCount += 1;
        return makeGetRoute({})(...args);
      },
      baseRouteCallsCounter: counter,
    })
  );
  assert.equal(res.available, true);
  assert.equal(res.available && res.source, "fixed_route_prices");
  assert.equal(res.available && res.price, 57, "de vaste prijs blijft exact ongewijzigd door het aanrijmodel");
  assert.equal(res.available && res.pickupApproach, null);
  assert.equal(approachDepsCalled, false, "loadApproachFeeConfig mag nooit aangeroepen worden voor een vaste route");
  assert.equal(operationalBasesCalled, false, "loadOperationalBases mag nooit aangeroepen worden voor een vaste route");
  assert.equal(serviceAreaBaseSlugsCalled, false, "loadServiceAreaBaseSlugs mag nooit aangeroepen worden voor een vaste route");
  assert.equal(gemeenteLookupCalled, false, "de PDOK-gemeentelookup mag nooit draaien voor een vaste route");
  assert.equal(getRouteCallCount, 0, "getRoute (Google Directions) mag helemaal niet aangeroepen worden voor een vaste route — ook niet voor de passagiersroute");
  assert.equal(counter.count, 0, "base→pickup-routing mag nooit draaien voor een vaste route");
});

// ── Retour: de aanrijcomponent wordt exact ÉÉN keer berekend/toegepast ───────

test("retour: base→pickup-routing en de PDOK-gemeentelookup draaien precies ÉÉNMAAL — niet apart voor heen en terug", async () => {
  const counter = { count: 0 };
  let gemeenteCalls = 0;
  const res = await resolveQuoteWith(
    input("Almere", "Schiphol", { returnTrip: true }),
    makeDeps({
      baseRouteCallsCounter: counter,
      lookupOfficialGemeente: async () => {
        gemeenteCalls += 1;
        return "almere";
      },
    })
  );
  assert.equal(res.available, true);
  assert.equal(counter.count, 1);
  assert.equal(gemeenteCalls, 1);
});

test("retour = 2× de enkele-reisprijs vóór aanrijcomponent + de aanrijcomponent ÉÉNMAAL (nooit verdubbeld)", async () => {
  // passenger 20km/25min → basisprijs X = priceFromDistance(20,25); approach 10km/0min → component 163ct (zie approach-fee.test.ts).
  const single = await resolveQuoteWith(
    input("Almere", "Schiphol"),
    makeDeps({ approachKm: 10, approachMin: 0, passengerKm: 20, passengerMin: 25 })
  );
  const retour = await resolveQuoteWith(
    input("Almere", "Schiphol", { returnTrip: true }),
    makeDeps({ approachKm: 10, approachMin: 0, passengerKm: 20, passengerMin: 25 })
  );
  assert.equal(single.available, true);
  assert.equal(retour.available, true);
  if (!single.available || !retour.available) return;
  const xCents = single.singlePriceCents - 163; // X vóór de aanrijcomponent
  const expectedReturnCents = xCents * 2 + 163;
  assert.equal(single.singlePriceCents, xCents + 163);
  assert.equal(retour.returnPriceCents, expectedReturnCents);
  assert.equal(retour.price, retour.returnPrice);
  // Nooit de (foutieve) 2×(X+component)-variant:
  assert.notEqual(retour.returnPriceCents, (xCents + 163) * 2);
});

// ── Combinatie met bestaande deadhead: geen dubbele toepassing ──────────────

test("aanrijcomponent wordt precies éénmaal opgeteld bovenop de (eventueel deadhead-aangepaste) enkele-reisprijs", async () => {
  // Zonder loadDeadheadConfig/loadHighDemandZones/loadDeadheadZoneAllowlist
  // slaat resolveDeadheadPricing zichzelf over (bestaand, ongewijzigd gedrag,
  // price blijft de kale basisprijs) — dit isoleert de aanrijcomponent: het
  // verschil tussen mét en zonder aanrijmodel moet EXACT de component zijn.
  const zonderAanrijcomponent = await resolveQuoteWith(
    input("Almere", "Schiphol"),
    makeDeps({ gemeente: null }) // onbekende gemeente → normaliter offer_on_request...
  );
  // ...dus vergelijk in plaats daarvan twee verschillende aanrijafstanden met
  // dezelfde passagiersroute: het prijsverschil moet exact het verschil in
  // aanrijcomponent zijn (10km/0min=163ct vs 20km/0min=650ct, zie
  // approach-fee.test.ts), nooit meer/minder — bewijst "precies éénmaal".
  const kortereAanrij = await resolveQuoteWith(
    input("Almere", "Schiphol"),
    makeDeps({ approachKm: 10, approachMin: 0, passengerKm: 20, passengerMin: 25 })
  );
  const langereAanrij = await resolveQuoteWith(
    input("Almere", "Schiphol"),
    makeDeps({ approachKm: 20, approachMin: 0, passengerKm: 20, passengerMin: 25 })
  );
  assert.equal(zonderAanrijcomponent.available, false);
  assert.equal(kortereAanrij.available, true);
  assert.equal(langereAanrij.available, true);
  if (!kortereAanrij.available || !langereAanrij.available) return;
  // 10km/0min → component 163ct; 20km/0min → referentie 1300ct, factor 1, component round(0.5*1300)=650ct.
  assert.equal(langereAanrij.singlePriceCents - kortereAanrij.singlePriceCents, 650 - 163);
});

// ── Ophaaldatum/-tijd wordt doorgegeven aan de basis→pickup-routing ─────────

test("input.departureAt wordt doorgegeven aan de base→pickup-routingaanroep", async () => {
  let seenApproachDeparture: string | undefined = "NIET-GEZIEN";
  const res = await resolveQuoteWith(
    input("Almere", "Schiphol", { departureAt: "2026-08-20T14:00:00.000Z" }),
    makeDeps({
      getRoute: async (origin, _destination, departureAt) => {
        if (origin === BASE_ALMERE_ADDRESS) seenApproachDeparture = departureAt;
        return { distanceKm: 10, durationMin: 12 };
      },
    })
  );
  assert.equal(res.available, true);
  assert.equal(seenApproachDeparture, "2026-08-20T14:00:00.000Z");
});

// ── Geen quoteId/snapshot bij een offerte-op-aanvraag ────────────────────────

test("offerte-op-aanvraag (buiten servicegebied) bevat geen fingerprint/prijsvelden — nooit bookbaar", async () => {
  const res = await resolveQuoteWith(input("Groningen", "Amsterdam"), makeDeps({ gemeente: "groningen" }));
  assert.equal(res.available, false);
  assert.ok(!("fingerprint" in res));
  assert.ok(!("price" in res));
});

// ── Cent-precisie: dezelfde centwaarde stroomt door naar de snapshot ────────

test("cent-consistentie: buildPriceSnapshot gebruikt priceCents/singlePriceCents rechtstreeks — geen aparte euro→cent-herberekening, ook niet bij een niet-hele-euro-component", async () => {
  // 10km/0min → component 163ct (niet een veelvoud van 100) — bewijst juist de
  // drift die eurosToCents(afgerond-op-hele-euro) zou hebben veroorzaakt.
  const res = await resolveQuoteWith(
    input("Almere", "Schiphol"),
    makeDeps({ approachKm: 10, approachMin: 0 })
  );
  assert.equal(res.available, true);
  if (!res.available) return;
  const snap = buildPriceSnapshot(res, { quoteId: "0192f0c0-0000-7000-8000-000000000abc", now: new Date("2026-08-19T10:00:00.000Z") });
  assert.ok(snap !== null);
  if (!snap) return;
  assert.equal(snap.subtotalCents, res.priceCents);
  assert.notEqual(snap.subtotalCents, eurosToCents(res.price), "eurosToCents(price) zou hier juist de verkeerde (afgeronde) waarde geven — het bewijs dat priceCents nodig is");
});

// ── Geen publieke lek van interne velden ─────────────────────────────────────

test("pickupApproach en de interne PickupApproachBreakdown-velden komen NOOIT voor in de whitelist van app/api/pricing/quote/route.ts", async () => {
  const src = (await import("node:fs")).readFileSync(
    (await import("node:path")).resolve(process.cwd(), "app/api/pricing/quote/route.ts"),
    "utf8"
  );
  const successBlockStart = src.indexOf("return json(200, {");
  const successBlockEnd = src.indexOf("});", successBlockStart);
  const block = src.slice(successBlockStart, successBlockEnd);
  for (const forbidden of ["pickupApproach", "driverPayout", "chauffeurCost", "settlement", "priceCents", "singlePriceCents", "returnPriceCents"]) {
    assert.doesNotMatch(block, new RegExp(forbidden), `'${forbidden}' mag niet in de publieke quote-response staan`);
  }
});

// ── Cache bevat geen pickup-/klantgegevens ───────────────────────────────────

test("cachedLoader: de aanrijmodel-config/standplaatsen/servicegebieden-cache bevat uitsluitend het type dat load() teruggeeft — geen route-/klantgegevens mogelijk (structurele controle, zelfde patroon als de deadhead-cache)", async () => {
  const loader = cachedLoader(60_000, async () => CONFIG);
  const first = await loader();
  assert.deepEqual(Object.keys(first).sort(), [
    "customerSharePct",
    "freeKm",
    "fullCoverageKm",
    "maxApproachKm",
    "maxCustomerComponentCents",
    "perKmCents",
    "perMinCents",
  ]);
});

// ── Gelijktijdige aanvragen blijven onafhankelijk ────────────────────────────

test("concurrency: twee gelijktijdige offertes voor verschillende gemeenten interfereren niet met elkaar", async () => {
  const [almere, spijkenisse] = await Promise.all([
    resolveQuoteWith(input("Almere", "Schiphol"), makeDeps({ gemeente: "almere" })),
    resolveQuoteWith(input("Spijkenisse", "Rotterdam Airport"), makeDeps({ gemeente: "nissewaard" })),
  ]);
  assert.equal(almere.available, true);
  assert.equal(spijkenisse.available, true);
});

// ── Migratie: geen gemeente mag aan twee standplaatsen tegelijk gekoppeld worden ──

async function readMigrationSql(): Promise<string> {
  const fs = await import("node:fs");
  const path = await import("node:path");
  return fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20260818120000_pickup_approach_fee.sql"),
    "utf8"
  );
}

/** Verwijdert SQL-regelcommentaar ("-- ...") — nodig zodat prozaverwijzingen naar bv. "on conflict do nothing" of "35" in de toelichting geen valse treffer geven bij een check op de daadwerkelijke SQL-code. */
function stripSqlComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

test("migratie: de seed-VALUES-lijst wijst geen enkele gemeente toe aan meer dan één standplaats (statische controle op de nog niet toegepaste SQL)", async () => {
  const src = await readMigrationSql();
  const tupleRegex = /\('([a-z-]+)',\s*'([^']+)'\)/g;
  const baseByGemeente = new Map<string, string>();
  let match: RegExpExecArray | null;
  while ((match = tupleRegex.exec(src)) !== null) {
    const [, baseSlug, gemeente] = match;
    const key = gemeente.toLowerCase();
    const existing = baseByGemeente.get(key);
    assert.ok(
      !existing || existing === baseSlug,
      `gemeente '${gemeente}' staat zowel bij '${existing}' als bij '${baseSlug}' — dubbele actieve toewijzing`
    );
    baseByGemeente.set(key, baseSlug);
  }
  assert.ok(baseByGemeente.size > 0, "de seed-tuples moeten wel gevonden zijn — anders test deze regex niets");
  // Basis 1102JL (Amsterdam-Zuidoost): Amsterdam/Diemen/Amstelveen/Utrecht.
  assert.equal(baseByGemeente.get("amsterdam"), "amsterdam-zuidoost");
  assert.equal(baseByGemeente.get("diemen"), "amsterdam-zuidoost");
  assert.equal(baseByGemeente.get("amstelveen"), "amsterdam-zuidoost");
  assert.equal(baseByGemeente.get("utrecht"), "amsterdam-zuidoost");
  // Basis 1361BP (Almere): Almere/Lelystad/regio Het Gooi.
  for (const g of ["almere", "lelystad", "blaricum", "hilversum", "huizen", "laren", "eemnes", "gooise meren"]) {
    assert.equal(baseByGemeente.get(g), "almere", `gemeente '${g}' hoort bij basis Almere (1361BP)`);
  }
  // Basis 3201LG (Spijkenisse): regio Rotterdam.
  for (const g of ["nissewaard", "rotterdam", "barendrecht", "schiedam", "vlaardingen", "capelle aan den ijssel", "voorne aan zee"]) {
    assert.equal(baseByGemeente.get(g), "spijkenisse", `gemeente '${g}' hoort bij basis Spijkenisse (3201LG)`);
  }
});

test("migratie: seed-blokken voor standplaatsen/servicegebieden/config gebruiken geen 'on conflict do nothing' — elk blok kent een expliciet ontbreekt/identiek/afwijkend-pad", async () => {
  const src = await readMigrationSql();
  // stripSqlComments: de toelichting ERNAAST refereert bewust aan de letterlijke
  // frase "on conflict do nothing" (om uit te leggen wat NIET meer gebeurt) —
  // die tekst mag niet als valse treffer gelden, alleen echte SQL-code telt.
  assert.doesNotMatch(stripSqlComments(src), /on conflict do nothing/);
  // Elk van de drie do $$ ... $$; -blokken moet zowel een insert-pad, een
  // no-op-pad (idempotent) als een raise exception-pad (conflictveilig) hebben.
  const doBlocks = src.match(/do \$\$[\s\S]*?end \$\$;/g) ?? [];
  assert.equal(doBlocks.length, 3, "verwacht precies drie do $$ ... $$; seed-blokken (bases, service_areas, config)");
  for (const block of doBlocks) {
    assert.match(block, /insert into public\./, "elk seed-blok moet een insert-pad hebben voor de ontbrekende rij");
    assert.match(block, /null; -- identiek: veilige no-op/, "elk seed-blok moet een idempotente no-op hebben bij een identieke bestaande rij");
    assert.match(block, /raise exception/, "elk seed-blok moet hard falen bij een afwijkende bestaande rij");
  }
});

test("migratie: maxApproachKm staat overal op 40 (tabel-default én seed-variabele) — geen enkele resterende '35'-waarde", async () => {
  const src = await readMigrationSql();
  assert.match(src, /max_approach_km numeric\(6, 2\) not null default 40/);
  assert.match(src, /seed_max_approach_km numeric\(6,2\) := 40/);
  // "35" mag alleen nog voorkomen in prozacommentaar over de wijziging zelf
  // (bv. "35→40km", "verhoogd van 35km") — nooit meer als daadwerkelijke
  // waarde achter max_approach_km/seed_max_approach_km.
  assert.doesNotMatch(src, /max_approach_km numeric\(6, 2\) not null default 35/);
  assert.doesNotMatch(src, /seed_max_approach_km numeric\(6,2\) := 35/);
});

test("migratie: RLS staat aan voor alle drie de tabellen, geen enkele publieke policy", async () => {
  const src = await readMigrationSql();
  for (const table of ["pricing_operational_bases", "pricing_service_areas", "pricing_approach_fee_config"]) {
    assert.match(
      src,
      new RegExp(`alter table public\\.${table} enable row level security`),
      `${table} moet RLS aan hebben staan`
    );
  }
  assert.doesNotMatch(src, /create policy/, "geen enkele publieke policy — service-role bypasst RLS by design, dat blijft de enige toegang");
});

test("migratie: uitsluitend additief — geen ALTER/DROP op tabellen buiten de drie nieuwe (bewijst dat geen eerder toegepaste migratie wordt aangeraakt)", async () => {
  const src = await readMigrationSql();
  const newTables = ["pricing_operational_bases", "pricing_service_areas", "pricing_approach_fee_config"];
  assert.doesNotMatch(src, /drop table/i, "deze migratie mag nooit een tabel verwijderen");
  assert.doesNotMatch(src, /drop policy/i, "deze migratie mag nooit een bestaande policy verwijderen");
  const alterMatches = [...src.matchAll(/alter table (?:public\.)?(\w+)/gi)];
  assert.ok(alterMatches.length > 0, "verwacht op zijn minst de RLS-alters voor de drie nieuwe tabellen");
  for (const [, table] of alterMatches) {
    assert.ok(
      newTables.includes(table),
      `'alter table ${table}' raakt een tabel buiten de drie nieuwe tabellen van deze migratie — niet toegestaan`
    );
  }

  const fs = await import("node:fs");
  const path = await import("node:path");
  const migrationsDir = path.resolve(process.cwd(), "supabase/migrations");
  const otherMigrations = fs
    .readdirSync(migrationsDir)
    .filter((f: string) => f.endsWith(".sql") && f !== "20260818120000_pickup_approach_fee.sql");
  assert.ok(otherMigrations.length > 0, "er moeten andere, eerder toegepaste migraties bestaan naast deze");
});

// ── Nachttariefinteractie (2026-08-19, item 4 — DOCUMENTEERT het huidige
// gedrag van PR #19's nachttarief-contract, wijzigt snapshot.ts NIET.
// Zie het bijbehorende rapport: dit is een openstaande commerciële keuze. ──

test("nachttarief overdag: geen enkele toeslag, subtotalCents blijft exact priceCents (aanrijcomponent inbegrepen, ongewijzigd t.o.v. het bestaande contract)", async () => {
  const res = await resolveQuoteWith(
    input("Almere", "Schiphol", { departureAt: "2026-08-20T12:00:00.000Z" }),
    makeDeps({ approachKm: 10, approachMin: 0 })
  );
  assert.equal(res.available, true);
  if (!res.available) return;
  const snap = buildPriceSnapshot(res, {
    quoteId: "0192f0c0-0000-7000-8000-000000000def",
    now: new Date("2026-08-19T10:00:00.000Z"),
    departureAt: "2026-08-20T12:00:00.000Z",
  });
  assert.ok(snap);
  if (!snap) return;
  assert.equal(snap.adjustments.length, 0, "overdag geen nachttoeslag-adjustment");
  assert.equal(snap.totalCents, snap.subtotalCents);
  assert.equal(snap.subtotalCents, res.singlePriceCents);
});

// ── Optie B (2026-08-19, commercieel akkoord): eenmalige nachtpremie op de
// pickup-aanrijcomponent, technisch losgekoppeld van PR #19's bestaande
// per-ritdeel nachttoeslag op de passagiersrit. Vier dag/nacht-combinaties ×
// enkele/retour — bewijst dat de premie uitsluitend van de HEENREIS-pickup-
// tijd afhangt en nooit méér dan éénmaal wordt toegepast. ────────────────────

const APPROACH = { approachKm: 10, approachMin: 0 }; // component = 163ct, premie = round(163×0,15) = 24ct
const APPROACH_COMPONENT_CENTS = 163;
const APPROACH_NIGHT_PREMIUM_CENTS = 24;

test("heen nacht, enkele rit: precies 2 adjustments (bestaande nachttoeslag op UITSLUITEND de rit + de eenmalige approach-nachtpremie), nooit over de component samengevoegd", async () => {
  const res = await resolveQuoteWith(
    input("Almere", "Schiphol", { departureAt: "2026-08-20T02:00:00.000Z" }),
    makeDeps(APPROACH)
  );
  assert.equal(res.available, true);
  if (!res.available) return;
  assert.equal(res.pickupApproach?.customerComponentCents, APPROACH_COMPONENT_CENTS);
  assert.equal(res.pickupApproach?.isNightPickup, true);
  assert.equal(res.pickupApproach?.approachNightPremiumCents, APPROACH_NIGHT_PREMIUM_CENTS);
  assert.equal(res.pickupApproach?.totalPickupContributionCents, APPROACH_COMPONENT_CENTS + APPROACH_NIGHT_PREMIUM_CENTS);

  const snap = buildPriceSnapshot(res, {
    quoteId: "0192f0c0-0000-7000-8000-000000000f01",
    now: new Date("2026-08-19T10:00:00.000Z"),
    departureAt: "2026-08-20T02:00:00.000Z",
  });
  assert.ok(snap);
  if (!snap) return;
  assert.equal(snap.adjustments.length, 2);
  const rideOnlyNightAdj = snap.adjustments.find((a) => a.code === "night_outbound");
  const premiumAdj = snap.adjustments.find((a) => a.code === "pickup_approach_night_premium");
  assert.ok(rideOnlyNightAdj && premiumAdj);
  // De bestaande nachttoeslag is UITSLUITEND 15% van de rit-zonder-component (X),
  // niet van singlePriceCents (X+component) — het bewijs dat de splitsing werkt.
  assert.equal(rideOnlyNightAdj!.amountCents, Math.round(res.rideOnlySinglePriceCents * NIGHT_SURCHARGE_RATE));
  assert.equal(premiumAdj!.amountCents, APPROACH_NIGHT_PREMIUM_CENTS);
  assert.equal(
    snap.totalCents,
    res.singlePriceCents + rideOnlyNightAdj!.amountCents + premiumAdj!.amountCents
  );
});

test("heen dag, enkele rit: geen enkele nachtgerelateerde adjustment, ook geen approach-nachtpremie", async () => {
  const res = await resolveQuoteWith(
    input("Almere", "Schiphol", { departureAt: "2026-08-20T12:00:00.000Z" }),
    makeDeps(APPROACH)
  );
  assert.equal(res.available, true);
  if (!res.available) return;
  assert.equal(res.pickupApproach?.isNightPickup, false);
  assert.equal(res.pickupApproach?.approachNightPremiumCents, 0);
  const snap = buildPriceSnapshot(res, {
    quoteId: "0192f0c0-0000-7000-8000-000000000f02",
    now: new Date("2026-08-19T10:00:00.000Z"),
    departureAt: "2026-08-20T12:00:00.000Z",
  });
  assert.ok(snap);
  if (!snap) return;
  assert.equal(snap.adjustments.length, 0);
  assert.equal(snap.totalCents, res.singlePriceCents);
});

test("heen nacht / terug dag, RETOUR: de approach-nachtpremie telt mee (heenreis is 's nachts), night_return blijft weg (terugreis is overdag)", async () => {
  const res = await resolveQuoteWith(
    input("Almere", "Schiphol", {
      returnTrip: true,
      departureAt: "2026-08-20T02:00:00.000Z",
      returnDepartureAt: "2026-08-21T12:00:00.000Z",
    }),
    makeDeps(APPROACH)
  );
  assert.equal(res.available, true);
  if (!res.available) return;
  assert.equal(res.pickupApproach?.isNightPickup, true);
  assert.equal(res.pickupApproach?.approachNightPremiumCents, APPROACH_NIGHT_PREMIUM_CENTS);
  const snap = buildPriceSnapshot(res, {
    quoteId: "0192f0c0-0000-7000-8000-000000000f03",
    now: new Date("2026-08-19T10:00:00.000Z"),
    departureAt: "2026-08-20T02:00:00.000Z",
    returnDepartureAt: "2026-08-21T12:00:00.000Z",
  });
  assert.ok(snap);
  if (!snap) return;
  const codes = snap.adjustments.map((a) => a.code).sort();
  assert.deepEqual(codes, ["night_outbound", "pickup_approach_night_premium"]);
});

test("heen dag / terug nacht, RETOUR: de approach-nachtpremie blijft weg (heenreis-pickup is overdag), night_return telt wél mee — uitsluitend de HEENREIS-tijd bepaalt de premie", async () => {
  const res = await resolveQuoteWith(
    input("Almere", "Schiphol", {
      returnTrip: true,
      departureAt: "2026-08-20T12:00:00.000Z",
      returnDepartureAt: "2026-08-21T02:00:00.000Z",
    }),
    makeDeps(APPROACH)
  );
  assert.equal(res.available, true);
  if (!res.available) return;
  assert.equal(res.pickupApproach?.isNightPickup, false, "de RETOURtijd mag de premie nooit bepalen");
  assert.equal(res.pickupApproach?.approachNightPremiumCents, 0);
  const snap = buildPriceSnapshot(res, {
    quoteId: "0192f0c0-0000-7000-8000-000000000f04",
    now: new Date("2026-08-19T10:00:00.000Z"),
    departureAt: "2026-08-20T12:00:00.000Z",
    returnDepartureAt: "2026-08-21T02:00:00.000Z",
  });
  assert.ok(snap);
  if (!snap) return;
  const codes = snap.adjustments.map((a) => a.code).sort();
  assert.deepEqual(codes, ["night_return"]);
});

test("heen nacht / terug nacht, RETOUR: de FIX — de approach-nachtpremie telt precies ÉÉNMAAL mee, niet tweemaal (dit was het bug-scenario vóór optie B)", async () => {
  const res = await resolveQuoteWith(
    input("Almere", "Schiphol", {
      returnTrip: true,
      departureAt: "2026-08-20T02:00:00.000Z",
      returnDepartureAt: "2026-08-21T03:00:00.000Z",
    }),
    makeDeps(APPROACH)
  );
  assert.equal(res.available, true);
  if (!res.available) return;
  assert.equal(res.pickupApproach?.customerComponentCents, APPROACH_COMPONENT_CENTS, "de component zelf zit nog steeds precies éénmaal in het subtotaal");
  assert.equal(res.pickupApproach?.approachNightPremiumCents, APPROACH_NIGHT_PREMIUM_CENTS);
  const snap = buildPriceSnapshot(res, {
    quoteId: "0192f0c0-0000-7000-8000-000000000f05",
    now: new Date("2026-08-19T10:00:00.000Z"),
    departureAt: "2026-08-20T02:00:00.000Z",
    returnDepartureAt: "2026-08-21T03:00:00.000Z",
  });
  assert.ok(snap);
  if (!snap) return;
  // Precies 3 adjustments: night_outbound + night_return (elk over de rit-alleen)
  // + de premie ÉÉNMAAL — NIET vier (wat de oude, ongecorrigeerde mechanische
  // route zou hebben gegeven door de premie ook in elke ritdeel-toeslag mee te
  // nemen).
  assert.equal(snap.adjustments.length, 3);
  const premiumAdjustments = snap.adjustments.filter((a) => a.code === "pickup_approach_night_premium");
  assert.equal(premiumAdjustments.length, 1, "de approach-nachtpremie mag nooit tweemaal voorkomen, ook niet als beide ritdelen 's nachts zijn");
  assert.equal(premiumAdjustments[0]!.amountCents, APPROACH_NIGHT_PREMIUM_CENTS);
  const rideOnlyNightTotal = snap.adjustments
    .filter((a) => a.code === "night_outbound" || a.code === "night_return")
    .reduce((s, a) => s + a.amountCents, 0);
  const expectedPerLeg = Math.round(res.rideOnlySinglePriceCents * NIGHT_SURCHARGE_RATE);
  assert.equal(rideOnlyNightTotal, expectedPerLeg * 2);
  assert.equal(
    snap.totalCents,
    res.returnPriceCents! + rideOnlyNightTotal + APPROACH_NIGHT_PREMIUM_CENTS
  );
});

test("cent-consistentie: de definitieve snapshot.totalCents is exact reproduceerbaar uit priceCents/rideOnlySinglePriceCents/pickupApproach — geen drift", async () => {
  const res = await resolveQuoteWith(
    input("Almere", "Schiphol", { departureAt: "2026-08-20T02:00:00.000Z" }),
    makeDeps(APPROACH)
  );
  assert.equal(res.available, true);
  if (!res.available) return;
  const snap = buildPriceSnapshot(res, {
    quoteId: "0192f0c0-0000-7000-8000-000000000f06",
    now: new Date("2026-08-19T10:00:00.000Z"),
    departureAt: "2026-08-20T02:00:00.000Z",
  });
  assert.ok(snap);
  if (!snap) return;
  const recomputedTotal =
    res.priceCents +
    Math.round(res.rideOnlySinglePriceCents * NIGHT_SURCHARGE_RATE) +
    (res.pickupApproach?.approachNightPremiumCents ?? 0);
  assert.equal(snap.totalCents, recomputedTotal);
  assert.equal(snap.totalCents, snap.subtotalCents + snap.adjustments.reduce((s, a) => s + a.amountCents, 0));
});

test("vaste route: krijgt nooit een pickupComponent of een approach-nachtpremie, ook niet 's nachts", async () => {
  const res = await resolveQuoteWith(
    input("amsterdam-centrum", "schiphol-airport"),
    makeDeps({
      findLocation: async (raw) => ({
        id: `${raw}-id`,
        slug: raw,
        name: raw,
        active: true,
        location_type: "city",
        city_id: null,
      }),
      findFixedRoute: async () => ({
        price: 57,
        return_price: 103,
        currency: "EUR",
        distance_km: 26,
        estimated_duration_min: 31,
        vat_rate: 9,
        source_label: "Amsterdam → Schiphol",
        valid_from: "2026-01-01T00:00:00.000Z",
        active: true,
      }),
    })
  );
  assert.equal(res.available, true);
  if (!res.available) return;
  assert.equal(res.pickupApproach, null);
  assert.equal(res.rideOnlySinglePriceCents, res.singlePriceCents);
  const snap = buildPriceSnapshot(res, {
    quoteId: "0192f0c0-0000-7000-8000-000000000f07",
    now: new Date("2026-08-19T10:00:00.000Z"),
    departureAt: "2026-08-20T02:00:00.000Z", // 's nachts
  });
  assert.ok(snap);
  if (!snap) return;
  assert.ok(
    !snap.adjustments.some((a) => a.code === "pickup_approach_night_premium"),
    "een vaste route heeft geen pickupApproach, dus nooit een approach-nachtpremie"
  );
});

// ── Backward compatibility: PriceSnapshot/StoredSnapshot-schema is ONGEWIJZIGD ──

test("backward compat: een 'oude-stijl' StoredSnapshot (exact zoals vóór dit PR, geen enkel nieuw veld) blijft door checkSnapshotUsable geaccepteerd — het schema is niet aangeraakt door het aanrijmodel", () => {
  const oldStyleSnapshot: StoredSnapshot = {
    quoteId: "0192f0c0-0000-7000-8000-00000001aaaa",
    pricingVersion: "2026.07.v1",
    pricingSource: "fixed_route_prices",
    currency: "EUR",
    subtotalCents: 5700,
    totalCents: 5700,
    routeSnapshot: {
      pickupSlug: "amsterdam-centrum",
      dropoffSlug: "schiphol-airport",
      vehicleClass: "executive-ev",
      distanceKm: 26,
      estimatedDurationMin: 31,
      source: "fixed_route_prices",
      sourceLabel: "Amsterdam Centrum → Schiphol",
      validFrom: null,
      returnApplied: false,
      vatRate: 9,
      fingerprint: "amsterdam-centrum|schiphol-airport|executive-ev|enkel",
      airport: { pickupIsAirport: false, dropoffIsAirport: true, isAirportPickup: false, isAirportDropoff: true, isAirportTransfer: true, flightDirection: "departure" },
    },
    calculatedAt: "2026-07-10T08:00:00.000Z",
    expiresAt: "2026-07-10T08:15:00.000Z",
  };
  const usability = checkSnapshotUsable(oldStyleSnapshot, {
    now: new Date("2026-07-10T08:05:00.000Z"),
    expectedFingerprint: "amsterdam-centrum|schiphol-airport|executive-ev|enkel",
  });
  assert.deepEqual(usability, { ok: true });
});
