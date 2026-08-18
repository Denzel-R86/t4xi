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
import { buildPriceSnapshot } from "@/lib/pricing/snapshot";
import { eurosToCents } from "@/lib/payments/create-intent";

type AppliedApproach = Extract<PickupApproachLogEntry, { outcome: "applied" }>;

/** Zelfde patroon als assertComputed() in deadhead-activation.e2e.test.ts: runtime-check + expliciete cast. */
function assertApplied(e: PickupApproachLogEntry | null): AppliedApproach {
  assert.ok(e !== null && e.outcome === "applied", "verwacht een toegepaste aanrijcomponent (outcome: 'applied')");
  return e as AppliedApproach;
}

const vclass = { id: "veh-exec-ev", code: "executive-ev", max_passengers: 4, max_luggage: 3, active: true };

const CONFIG: ApproachFeeConfig = {
  customerSharePct: 0.5,
  freeKm: 5,
  fullCoverageKm: 15,
  maxCustomerComponentCents: 2500,
  maxApproachKm: 35,
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
  [BASE_SPIJKENISSE.slug, BASE_SPIJKENISSE],
]);
const BASE_ALMERE_ADDRESS = `${BASE_ALMERE.postcode} ${BASE_ALMERE.label}`;
const BASE_SPIJKENISSE_ADDRESS = `${BASE_SPIJKENISSE.postcode} ${BASE_SPIJKENISSE.label}`;

const SERVICE_AREAS = new Map([
  ["almere", "almere"],
  ["lelystad", "almere"],
  ["amsterdam", "almere"],
  ["diemen", "almere"],
  ["amstelveen", "almere"],
  ["hilversum", "almere"],
  ["laren", "almere"],
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
    if (origin === BASE_ALMERE_ADDRESS || origin === BASE_SPIJKENISSE_ADDRESS) {
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

for (const g of ["lelystad", "diemen", "amstelveen"]) {
  test(`pickup in gemeente ${g} (definitieve, later toegevoegde servicegebieden) → toegewezen aan basis Almere`, async () => {
    let logged: PickupApproachLogEntry | null = null;
    const res = await resolveQuoteWith(
      input(g, "Schiphol"),
      makeDeps({ gemeente: g, onPickupApproach: (e) => (logged = e) })
    );
    assert.equal(res.available, true);
    assert.equal(assertApplied(logged).baseSlug, "almere");
  });
}

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

test("aanrijafstand boven maxApproachKm (35km) → Offerte op aanvraag, reden beyond_max_approach_km", async () => {
  let logged: PickupApproachLogEntry | null = null;
  const res = await resolveQuoteWith(
    input("Almere", "Schiphol"),
    makeDeps({ approachKm: 40, onPickupApproach: (e) => (logged = e) })
  );
  assert.equal(res.available, false);
  assert.deepEqual(logged, { outcome: "offer_on_request", reason: "beyond_max_approach_km" });
});

// ── Vaste route: geen homebase-load, geen base→pickup-routing ───────────────

test("vaste route: resolvePickupApproach draait hier niet — geen enkele base→pickup-routingaanroep, pickupApproach altijd null", async () => {
  const counter = { count: 0 };
  let approachDepsCalled = false;
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
      baseRouteCallsCounter: counter,
    })
  );
  assert.equal(res.available, true);
  assert.equal(res.available && res.source, "fixed_route_prices");
  assert.equal(res.available && res.pickupApproach, null);
  assert.equal(approachDepsCalled, false, "loadApproachFeeConfig mag nooit aangeroepen worden voor een vaste route");
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
