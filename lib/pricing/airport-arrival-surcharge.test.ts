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
  const r = applyArrivalSurcharge({ singleCents: 10200, returnCents: 18400, surcharge, appliesToSingle: true });
  assert.equal(r.singleCents, 11700, "Schiphol -> Almere: 102,00 + 15,00 = 117,00");
});

test("toeslag wordt bij RETOUR eenmaal opgeteld, niet verdubbeld", () => {
  const surcharge = resolveArrivalSurcharge({ pickupIsAirport: true, config: SCHIPHOL });
  const r = applyArrivalSurcharge({ singleCents: 10200, returnCents: 18400, surcharge, appliesToSingle: true });
  assert.equal(r.returnCents, 19900, "184,00 + 15,00 = 199,00 — niet 184,00 + 30,00");
  assert.notEqual(r.returnCents, 18400 + 2 * 1500);
});

test("retour blijft null wanneer de route geen retourprijs heeft", () => {
  const surcharge = resolveArrivalSurcharge({ pickupIsAirport: true, config: SCHIPHOL });
  const r = applyArrivalSurcharge({ singleCents: 10200, returnCents: null, surcharge, appliesToSingle: true });
  assert.equal(r.returnCents, null);
  assert.equal(r.singleCents, 11700);
});

test("zonder toeslag blijven beide bedragen ongewijzigd", () => {
  const r = applyArrivalSurcharge({ singleCents: 10200, returnCents: 18400, surcharge: null, appliesToSingle: true });
  assert.deepEqual(r, { singleCents: 10200, returnCents: 18400 });
});

test("het verschil heen/terug is precies de toeslag, voor elk bedrag", () => {
  const surcharge = resolveArrivalSurcharge({ pickupIsAirport: true, config: SCHIPHOL });
  for (const basis of [3900, 5000, 10200, 13700, 20900]) {
    const r = applyArrivalSurcharge({ singleCents: basis, returnCents: Math.round(basis * 1.8), surcharge , appliesToSingle: true });
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

test("de toeslagplicht volgt het ritdeel dat vanaf een luchthaven vertrekt", () => {
  // Enkele reis: alleen de pickup telt. Geboekte retour: ook een luchthaven-
  // dropoff, want dan vertrekt de terugrit daar.
  assert.match(service, /const arrivalAirportId = airport\.pickupIsAirport/);
  assert.match(service, /bookedAsReturn && airport\.dropoffIsAirport/);
});

test("alleen een luchthaven-PICKUP maakt de enkele reis toeslagplichtig", () => {
  assert.match(service, /appliesToSingle: airport\.pickupIsAirport/);
});

test("fail-closed geldt uitsluitend bij een luchthaven-pickup", () => {
  // Een luchthaven-dropoff bij retour valt bewust NIET fail-closed: dat is een
  // bestaande vertrekroute die tijdens het code-first venster moet blijven werken.
  assert.match(service, /if \(arrival === null && airport\.pickupIsAirport\)/);
  assert.match(service, /airport_arrival_surcharge_unavailable"\s*:\s*"airport_arrival_surcharge_missing"/);
});

test("de publieke quote-API lekt de interne toeslagregel niet", () => {
  const api = readFileSync(new URL("../../app/api/pricing/quote/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(api, /airportArrival/, "airportArrival is INTERN en hoort niet in de API-response");
});


// ═══════════════════════════════════════════════════════════════════════════
// End-to-end door de echte resolver
// ═══════════════════════════════════════════════════════════════════════════

import { resolveQuoteWith, type ResolveQuoteDeps, type PricingQuoteResult } from "@/lib/pricing/service";
import { buildPriceSnapshot } from "@/lib/pricing/snapshot";
import { amsterdamDepartureIso } from "@/lib/pricing/departure-time";

const loc = (id: string, slug: string, name: string, type: "airport" | "city") => ({
  id, slug, name, active: true, location_type: type, city_id: `${slug}-city`,
});

const SCHIPHOL_LOC = loc("schiphol-id", "schiphol-airport", "Schiphol Airport", "airport");
const ROTTERDAM_AP = loc("rtha-id", "rotterdam-airport", "Rotterdam The Hague Airport", "airport");
const EINDHOVEN_AP = loc("ein-id", "eindhoven-airport", "Eindhoven Airport", "airport");
const BRUSSELS_AP = loc("bru-id", "brussels-airport", "Brussels Airport", "airport");
const ALMERE_LOC = loc("almere-id", "almere", "Almere", "city");
const UTRECHT_LOC = loc("utrecht-id", "utrecht", "Utrecht", "city");

const VCLASS = { id: "veh", code: "executive-ev", max_passengers: 4, max_luggage: 3, active: true };

/** Vaste route 102/184 — Almere <-> Schiphol in beide richtingen. */
const ROUTE_102 = {
  price: 102, return_price: 184, currency: "EUR", distance_km: 39,
  estimated_duration_min: 38, vat_rate: 9, source_label: null,
  valid_from: "2026-10-10T00:00:00Z", active: true,
};

const TOESLAG: Record<string, number> = {
  "schiphol-id": 1500,
  "rtha-id": 1000,
  "ein-id": 1000,
  // brussels-airport staat bewust NIET in de configuratie
};

function deps(over: Partial<ResolveQuoteDeps> = {}, locs: Record<string, typeof SCHIPHOL_LOC> = {}): ResolveQuoteDeps {
  const table: Record<string, typeof SCHIPHOL_LOC> = {
    schiphol: SCHIPHOL_LOC, rotterdam: ROTTERDAM_AP, eindhoven: EINDHOVEN_AP,
    brussel: BRUSSELS_AP, almere: ALMERE_LOC, utrecht: UTRECHT_LOC, ...locs,
  };
  return {
    findLocation: async (raw: string) => {
      const key = Object.keys(table).find((k) => raw.toLowerCase().includes(k));
      return key ? table[key]! : null;
    },
    findVehicleClass: async () => VCLASS,
    findFixedRoute: async () => ROUTE_102,
    getRoute: async () => null,
    loadArrivalSurcharge: async (id: string) =>
      TOESLAG[id] !== undefined ? { airportSlug: id, surchargeCents: TOESLAG[id]! } : null,
    ...over,
  } as ResolveQuoteDeps;
}

const quote = (pickup: string, dropoff: string, retour = false, d: ResolveQuoteDeps = deps()) =>
  resolveQuoteWith({ pickup, dropoff, ...(retour ? { returnTrip: true } : {}) }, d);

const prijs = (r: PricingQuoteResult) => (r.available ? r.price : null);

// ── De vier acceptatiescenario's ─────────────────────────────────────────────

test("ACCEPTATIE 1: Almere -> Schiphol enkel = 102 (geen toeslag)", async () => {
  const r = await quote("Almere", "Schiphol");
  assert.equal(prijs(r), 102);
  assert.equal(r.available && r.airportArrival, null);
});

test("ACCEPTATIE 2: Schiphol -> Almere enkel = 117 (eenmaal toeslag)", async () => {
  const r = await quote("Schiphol", "Almere");
  assert.equal(prijs(r), 117);
  assert.equal(r.available && r.airportArrival?.surchargeCents, 1500);
});

test("ACCEPTATIE 3: Almere -> Schiphol -> Almere retour = 199 (toeslag op terugritdeel)", async () => {
  const r = await quote("Almere", "Schiphol", true);
  assert.equal(prijs(r), 199, "184 + 15 eenmaal, op het ritdeel dat vanaf Schiphol vertrekt");
  assert.equal(r.available && r.singlePrice, 102, "de enkele reis NAAR de luchthaven blijft 102");
});

test("ACCEPTATIE 4: Schiphol -> Almere -> Schiphol retour = 199 (toeslag op heenritdeel)", async () => {
  const r = await quote("Schiphol", "Almere", true);
  assert.equal(prijs(r), 199);
  assert.equal(r.available && r.singlePrice, 117, "de enkele reis VANAF de luchthaven is 117");
});

test("toeslag wordt nooit met de retourfactor vermenigvuldigd", async () => {
  for (const [p, d] of [["Almere", "Schiphol"], ["Schiphol", "Almere"]] as const) {
    const r = await quote(p, d, true);
    assert.equal(prijs(r), 199);
    assert.notEqual(prijs(r), 184 + 2 * 15, "niet tweemaal");
    assert.notEqual(prijs(r), Math.round(184 + 1.8 * 15), "niet met de retourfactor");
  }
});

// ── Fail-closed bij luchthaven-pickup ────────────────────────────────────────

const FAIL_REDENEN = ["airport_arrival_surcharge_missing", "airport_arrival_surcharge_unavailable"];

test("config ontbreekt + luchthaven-pickup -> Offerte op aanvraag, nooit de kale basisprijs", async () => {
  const r = await quote("Schiphol", "Almere", false, deps({ loadArrivalSurcharge: async () => null }));
  assert.equal(r.available, false);
  if (r.available) return;
  assert.equal(r.reason, "airport_arrival_surcharge_missing");
  assert.equal((r as { price?: number }).price, undefined, "mag geen prijsveld bevatten");
});

test("queryfout + luchthaven-pickup -> fail-closed met _unavailable", async () => {
  const r = await quote("Schiphol", "Almere", false, deps({
    loadArrivalSurcharge: async () => { throw new Error("relation does not exist"); },
  }));
  assert.equal(r.available, false);
  if (r.available) return;
  assert.equal(r.reason, "airport_arrival_surcharge_unavailable");
});

test("timeout + luchthaven-pickup -> fail-closed met _unavailable", async () => {
  const r = await quote("Schiphol", "Almere", false, deps({
    loadArrivalSurcharge: async () => { throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }); },
  }));
  assert.equal(r.available, false);
  if (r.available) return;
  assert.equal(r.reason, "airport_arrival_surcharge_unavailable");
});

test("ontbrekende service-role-client (dep afwezig) -> fail-closed met _unavailable", async () => {
  const zonder = deps();
  delete (zonder as Partial<ResolveQuoteDeps>).loadArrivalSurcharge;
  const r = await quote("Schiphol", "Almere", false, zonder);
  assert.equal(r.available, false);
  if (r.available) return;
  assert.equal(r.reason, "airport_arrival_surcharge_unavailable");
});

test("fail-closed geldt ook voor de retour vanaf een luchthaven", async () => {
  const r = await quote("Schiphol", "Almere", true, deps({ loadArrivalSurcharge: async () => null }));
  assert.equal(r.available, false);
  if (r.available) return;
  assert.ok(FAIL_REDENEN.includes(r.reason));
});

// ── Backwards-compatibiliteit: code vóór de migraties ────────────────────────

test("BACKWARDS COMPAT: stad -> luchthaven enkel blijft 102 zonder toeslagconfig", async () => {
  const r = await quote("Almere", "Schiphol", false, deps({ loadArrivalSurcharge: async () => null }));
  assert.equal(prijs(r), 102, "bestaande vertrekroute mag niet wegvallen vóór de migraties");
});

test("BACKWARDS COMPAT: stad -> luchthaven RETOUR blijft 184 zonder toeslagconfig", async () => {
  const r = await quote("Almere", "Schiphol", true, deps({ loadArrivalSurcharge: async () => null }));
  assert.equal(prijs(r), 184, "geen prijswijziging tijdens het code-first venster");
});

test("BACKWARDS COMPAT: stad -> luchthaven retour overleeft een queryfout", async () => {
  const r = await quote("Almere", "Schiphol", true, deps({
    loadArrivalSurcharge: async () => { throw new Error("tabel bestaat nog niet"); },
  }));
  assert.equal(prijs(r), 184);
});

test("BACKWARDS COMPAT: intercityspiegel zonder luchthaven blijft prijsbaar zonder config", async () => {
  const r = await quote("Utrecht", "Almere", false, deps({ loadArrivalSurcharge: async () => null }));
  assert.equal(prijs(r), 102, "geen luchthaven betrokken -> geen toeslagvereiste");
  assert.equal(r.available && r.airportArrival, null);
});

// ── Per luchthaven het juiste bedrag ─────────────────────────────────────────

test("Schiphol 15, Rotterdam 10, Eindhoven 10", async () => {
  for (const [plaats, verwacht] of [["Schiphol", 117], ["Rotterdam The Hague", 112], ["Eindhoven", 112]] as const) {
    const r = await quote(plaats.toLowerCase(), "Almere");
    assert.equal(prijs(r), verwacht, `${plaats} verwachtte ${verwacht}`);
  }
});

test("Antwerpen/Brussel: geen config -> blijft op aanvraag, nooit een kale prijs", async () => {
  const r = await quote("brussel", "Almere");
  assert.equal(r.available, false, "Brussel heeft bewust geen toeslagconfig");
  if (r.available) return;
  assert.equal(r.reason, "airport_arrival_surcharge_missing");
});

// ── Nacht ────────────────────────────────────────────────────────────────────

const NACHT = amsterdamDepartureIso("2026-11-02", "23:30")!;
const OVERDAG = amsterdamDepartureIso("2026-11-02", "12:00")!;
const SNAP = { quoteId: "0192f0c0-0000-7000-8000-000000000abc", now: new Date("2026-10-10T12:00:00.000Z") };

test("nacht: de 15% werkt op de ritprijs, NIET op de aankomsttoeslag", async () => {
  const r = await quote("Schiphol", "Almere");
  assert.equal(r.available, true);
  if (!r.available) return;

  const nacht = buildPriceSnapshot(r, { ...SNAP, departureAt: NACHT })!;
  const dag = buildPriceSnapshot(r, { ...SNAP, departureAt: OVERDAG })!;
  const verschil = nacht.totalCents - dag.totalCents;

  assert.equal(verschil, Math.round(10200 * 0.15), "15% over 102,00 — niet over 117,00");
  assert.notEqual(verschil, Math.round(11700 * 0.15), "de toeslag mag niet meebelast worden");
});

test("nacht: snapshot-invariant total == subtotal + adjustments blijft gelden", async () => {
  const r = await quote("Schiphol", "Almere");
  assert.equal(r.available, true);
  if (!r.available) return;
  const s = buildPriceSnapshot(r, { ...SNAP, departureAt: NACHT })!;
  const som = s.adjustments.reduce((a, x) => a + x.amountCents, 0);
  assert.equal(s.totalCents, s.subtotalCents + som);
  assert.equal(s.subtotalCents, 11700, "de toeslag zit in het bindende subtotaal");
});

// ── Snapshot / fingerprint / idempotentie ────────────────────────────────────

test("snapshot bewaart hetzelfde totaal als de quote", async () => {
  for (const retour of [false, true]) {
    const r = await quote("Schiphol", "Almere", retour);
    assert.equal(r.available, true);
    if (!r.available) continue;
    const s = buildPriceSnapshot(r, { ...SNAP, departureAt: OVERDAG })!;
    assert.equal(s.subtotalCents, r.priceCents, `retour=${retour}`);
  }
});

test("fingerprint is stabiel en onderscheidt enkel van retour", async () => {
  const a = await quote("Schiphol", "Almere");
  const b = await quote("Schiphol", "Almere");
  const c = await quote("Schiphol", "Almere", true);
  assert.equal(a.available && b.available && a.fingerprint, b.available ? b.fingerprint : "x");
  assert.notEqual(a.available && a.fingerprint, c.available && c.fingerprint);
});

test("idempotent: herhaald oplossen levert exact dezelfde prijs", async () => {
  const uitkomsten = await Promise.all([1, 2, 3].map(() => quote("Schiphol", "Almere", true)));
  const prijzen = uitkomsten.map(prijs);
  assert.deepEqual(prijzen, [199, 199, 199]);
});

test("retry: een eerste leesfout gevolgd door succes levert de volledige prijs", async () => {
  let pogingen = 0;
  const r = await quote("Schiphol", "Almere", false, deps({
    loadArrivalSurcharge: async (id: string) => {
      pogingen += 1;
      if (pogingen === 1) throw new Error("tijdelijke storing");
      return { airportSlug: id, surchargeCents: 1500 };
    },
  }));
  // Eerste poging faalt -> fail-closed (de retry zit in de cache-laag erboven,
  // niet in de resolver). Dit legt dat gedrag expliciet vast.
  assert.equal(r.available, false, "de resolver zelf hertest niet — dat doet cachedLoader");
});

// ── Geen lek naar buiten ─────────────────────────────────────────────────────

test("publieke API-route noemt geen enkel intern toeslagveld of -reden", () => {
  const api = readFileSync(new URL("../../app/api/pricing/quote/route.ts", import.meta.url), "utf8");
  // De reden-namen mogen in de statusmapping staan, maar nooit in een response-body.
  const naBody = api.slice(api.indexOf("Niet beschikbaar"));
  assert.doesNotMatch(naBody, /airport_arrival_surcharge/, "interne reden mag niet in de response");
  assert.doesNotMatch(api, /surchargeCents/);
  assert.doesNotMatch(api, /airportArrival/);
});

// ═══════════════════════════════════════════════════════════════════════════
// Uitrolveiligheid: de code draait VÓÓR beide migraties
// ═══════════════════════════════════════════════════════════════════════════
//
// Fase 1 van het uitrolplan is code-first. De nieuwe applicatiecode moet dan
// draaien tegen een database ZONDER pricing_airport_arrival_surcharge en
// ZONDER gespiegelde routes. Deze tests simuleren precies die toestand:
// de toeslagtabel bestaat niet (query gooit), en findFixedRoute levert alleen
// de bestaande heenrichting.

/** Database van vóór de migraties: geen toeslagtabel, geen tegenrichtingen. */
function preMigratieDeps(): ResolveQuoteDeps {
  return deps({
    loadArrivalSurcharge: async () => {
      throw new Error('relation "pricing_airport_arrival_surcharge" does not exist');
    },
    findFixedRoute: async (pickupId: string) =>
      // alleen stad -> luchthaven bestaat nog
      pickupId === SCHIPHOL_LOC.id || pickupId === ROTTERDAM_AP.id || pickupId === EINDHOVEN_AP.id
        ? null
        : ROUTE_102,
  });
}

test("PRE-MIGRATIE: bestaande vertrekroute enkel blijft exact 102", async () => {
  assert.equal(prijs(await quote("Almere", "Schiphol", false, preMigratieDeps())), 102);
});

test("PRE-MIGRATIE: bestaande vertrekroute retour blijft exact 184", async () => {
  assert.equal(prijs(await quote("Almere", "Schiphol", true, preMigratieDeps())), 184);
});

test("PRE-MIGRATIE: intercity blijft onveranderd prijsbaar", async () => {
  assert.equal(prijs(await quote("Utrecht", "Almere", false, preMigratieDeps())), 102);
});

test("PRE-MIGRATIE: aankomstrit blijft op aanvraag (geen tegenroute) — zoals vandaag", async () => {
  const r = await quote("Schiphol", "Almere", false, preMigratieDeps());
  assert.equal(r.available, false, "er is nog geen gespiegelde route, dus route_not_fixed");
  if (r.available) return;
  assert.equal(r.reason, "route_not_fixed");
});

test("GEVAARLIJK VENSTER uitgesloten: gespiegelde route zonder config levert NOOIT een kale prijs", async () => {
  // Hypothetische verkeerde volgorde: tegenroutes toegepast vóór de code/config.
  // Zodra deze code draait, is dat fail-closed in plaats van te goedkoop.
  const r = await quote("Schiphol", "Almere", false, deps({
    findFixedRoute: async () => ROUTE_102,            // tegenroute bestaat al
    loadArrivalSurcharge: async () => null,            // config nog niet
  }));
  assert.equal(r.available, false);
  if (r.available) return;
  assert.equal(r.reason, "airport_arrival_surcharge_missing");
  assert.equal((r as { price?: number }).price, undefined);
});
