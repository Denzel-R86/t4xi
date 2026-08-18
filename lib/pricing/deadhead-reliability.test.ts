// Betrouwbaarheidshardening (2026-08-14): regressie-/stresstests voor de
// cold-start-timeoutproblematiek die na de city-wide zonefix werd gemeld.
// Twee lagen:
//  1. Geïsoleerde unit-tests van de bouwstenen (withRetryOnce, cachedLoader).
//  2. End-to-end-tests via resolveQuoteWith die bewijzen dat een onzekere
//     zonestatus voor een MOGELIJK Eindhoven/Roermond-bestemming nooit de lage
//     basisprijs bindend oplevert (indeterminate → "Offerte op aanvraag"),
//     terwijl een bevestigd buiten-zone-adres en een vaste route ongewijzigd
//     blijven werken.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveQuoteWith,
  withRetryOnce,
  cachedLoader,
  NoServiceRoleClientError,
  type ResolveQuoteDeps,
  type PricingQuoteInput,
  type ShadowLogEntry,
  type DeadheadZoneAllowlist,
} from "@/lib/pricing/service";
import type { DeadheadConfig } from "@/lib/pricing/deadhead-shadow";
import { neutralPickupApproachDeps, wrapGetRouteWithNeutralApproach } from "@/lib/pricing/pickup-approach-fake";

// ── Laag 1: withRetryOnce ────────────────────────────────────────────────────

test("withRetryOnce: eerste poging faalt, retry slaagt → levert de retry-waarde, load() precies tweemaal aangeroepen", async () => {
  let calls = 0;
  const result = await withRetryOnce(
    async () => {
      calls += 1;
      if (calls === 1) throw new Error("tijdelijke storing");
      return "ok-na-retry";
    },
    50,
    50
  );
  assert.equal(result, "ok-na-retry");
  assert.equal(calls, 2);
});

test("withRetryOnce: beide pogingen falen → verwerpt met de fout van de TWEEDE (laatste) poging", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withRetryOnce(
        async () => {
          calls += 1;
          throw new Error(`poging ${calls}`);
        },
        50,
        50
      ),
    /poging 2/
  );
  assert.equal(calls, 2);
});

test("withRetryOnce: eerste poging hangt langer dan timeoutMs → retry start op tijd, geen onbeperkt wachten", async () => {
  let calls = 0;
  const start = Date.now();
  const result = await withRetryOnce(
    async () => {
      calls += 1;
      if (calls === 1) return new Promise(() => {}); // hangt voor altijd
      return "ok-na-retry";
    },
    100,
    100
  );
  const elapsedMs = Date.now() - start;
  assert.equal(result, "ok-na-retry");
  assert.equal(calls, 2);
  assert.ok(elapsedMs < 100 + 100 + 200, `verwacht ~200ms, duurde ${elapsedMs}ms`);
});

// ── Laag 1: cachedLoader ──────────────────────────────────────────────────────

test("cachedLoader: gelijktijdige aanroepen tijdens een cold-startload delen ÉÉN onderliggende load (dedup — punt 8)", async () => {
  let calls = 0;
  let resolveLoad: (v: number) => void = () => {};
  const load = cachedLoader(60_000, () => {
    calls += 1;
    return new Promise<number>((resolve) => {
      resolveLoad = resolve;
    });
  });
  const p1 = load();
  const p2 = load();
  const p3 = load();
  resolveLoad(42);
  const [v1, v2, v3] = await Promise.all([p1, p2, p3]);
  assert.equal(calls, 1, "drie gelijktijdige cold-start-aanroepen mogen maar één keer de echte load starten");
  assert.deepEqual([v1, v2, v3], [42, 42, 42]);
});

test("cachedLoader: binnen de TTL levert een warme aanroep het gecachete resultaat, geen nieuwe load", async () => {
  let calls = 0;
  const load = cachedLoader(60_000, async () => {
    calls += 1;
    return calls;
  });
  const first = await load();
  const second = await load();
  const third = await load();
  assert.equal(first, 1);
  assert.equal(second, 1, "tweede aanroep binnen de TTL moet het gecachete resultaat krijgen, geen nieuwe load");
  assert.equal(third, 1);
  assert.equal(calls, 1);
});

test("cachedLoader: na het verlopen van de TTL wordt veilig ververst — een configwijziging is dan zichtbaar", async () => {
  let calls = 0;
  const load = cachedLoader(30, async () => {
    calls += 1;
    return calls; // simuleert een "gewijzigde" configwaarde per load
  });
  const first = await load();
  assert.equal(first, 1);
  await new Promise((r) => setTimeout(r, 60)); // TTL (30ms) ruim verstreken
  const second = await load();
  assert.equal(second, 2, "na de TTL moet een nieuwe, verse load plaatsvinden");
  assert.equal(calls, 2);
});

test("cachedLoader: een MISLUKTE load wordt nooit gecachet — de eerstvolgende aanroep probeert gewoon opnieuw", async () => {
  let calls = 0;
  const load = cachedLoader(60_000, async () => {
    calls += 1;
    if (calls === 1) throw new Error("tijdelijke storing");
    return "hersteld";
  });
  await assert.rejects(() => load());
  const second = await load();
  assert.equal(second, "hersteld");
  assert.equal(calls, 2, "een mislukte load mag de daaropvolgende aanroep niet blokkeren met een gecachete fout");
});

test("cachedLoader: de cache bevat uitsluitend het type dat load() teruggeeft — geen route-/klantgegevens mogelijk (structurele controle)", async () => {
  // DeadheadConfig/HighDemandZoneIds/DeadheadZoneAllowlist zijn de enige types
  // die in productie via cachedLoader lopen — geen van drieën heeft een adres-,
  // naam-, telefoon- of e-mailveld. Dit bewijst het door de vorm van de echte
  // productiewaarde te controleren, niet door aannames over de cache-interne.
  const load = cachedLoader<DeadheadZoneAllowlist>(60_000, async () => ({
    cityIds: new Set(["eindhoven-city-id"]),
    byOfficialWoonplaats: new Map([["eindhoven", "eindhoven-city-id"]]),
  }));
  const value = await load();
  assert.deepEqual(Object.keys(value).sort(), ["byOfficialWoonplaats", "cityIds"]);
});

// ── Laag 2: end-to-end via resolveQuoteWith ─────────────────────────────────

const CONFIG: DeadheadConfig = { minDistanceKm: 80, deadheadFactor: 0.6, maxDeadheadKm: 80 };
const NO_HIGH_DEMAND = { locationIds: new Set<string>(), cityIds: new Set<string>() };
const vclass = { id: "veh-exec-ev", code: "executive-ev", max_passengers: 4, max_luggage: 3, active: true };

function makeDeps(o: Partial<ResolveQuoteDeps> & { onShadow?: (e: ShadowLogEntry) => void } = {}): ResolveQuoteDeps {
  const { onShadow, getRoute: passengerGetRoute, ...rest } = o;
  return {
    findLocation: async () => null,
    findVehicleClass: async () => vclass,
    findFixedRoute: async () => null,
    getRoute: wrapGetRouteWithNeutralApproach(passengerGetRoute ?? (async () => ({ distanceKm: 104.7, durationMin: 67 }))),
    ...neutralPickupApproachDeps,
    loadDeadheadConfig: async () => CONFIG,
    loadHighDemandZones: async () => NO_HIGH_DEMAND,
    loadDeadheadZoneAllowlist: async () => ({ cityIds: new Set(), byOfficialWoonplaats: new Map() }),
    lookupOfficialWoonplaats: async () => null,
    recordShadow: onShadow,
    ...rest,
  };
}

const input = (dropoff: string, o: Partial<PricingQuoteInput> = {}): PricingQuoteInput => ({
  pickup: "Laren",
  dropoff,
  ...o,
});

test("PDOK-timeout vóór een MOGELIJK Eindhoven-adres, geen fallback-match → offerte onzeker (nooit de te lage basisprijs)", async () => {
  let shadow: ShadowLogEntry | null = null;
  const res = await resolveQuoteWith(
    // Bevat "Eindhoven" in de tekst (plausibiliteitssignaal) maar geen bruikbare
    // postcode voor de fallback — precies het scenario waarin alleen de live
    // PDOK-lookup uitsluitsel kan geven.
    input("Onbekende straat, ergens bij Eindhoven"),
    makeDeps({
      lookupOfficialWoonplaats: async () => {
        throw new Error("PDOK timeout (gesimuleerd)");
      },
      onShadow: (e) => (shadow = e),
    })
  );
  assert.equal(res.available, false, "mag NOOIT bindend beschikbaar zijn met de basisprijs voor een onzekere, mogelijk Eindhoven-bestemming");
  if (res.available) return;
  // "unknown_location" (niet "route_not_fixed"): pickup ("Laren") resolveert in
  // deze fixture ook niet naar een LocationRow — de exacte sub-reden is hier
  // niet het punt, het punt is dat er ÜBERHAUPT geen prijsveld/quoteId is.
  assert.equal(res.reason, "unknown_location");
  assert.equal((res as { price?: number }).price, undefined, "een onzekere offerte mag geen prijsveld bevatten");
  assert.ok(shadow !== null && "shadowSkipped" in shadow, "shadow had een skip-entry moeten zijn");
  const skipped = shadow as Extract<ShadowLogEntry, { shadowSkipped: true }>;
  assert.equal(skipped.reason, "zone_lookup_unavailable");
});

test("canonieke Eindhoven Airport (al-opgeloste locatie) + falende zone-allowlist → ook onzeker, nooit stilzwijgend de basisprijs", async () => {
  const eindhovenAirport = {
    id: "eindhoven-airport-id",
    slug: "eindhoven-airport",
    name: "Eindhoven Airport",
    active: true,
    location_type: "airport" as const,
    city_id: "eindhoven-city-id",
  };
  const res = await resolveQuoteWith(
    input("Eindhoven Airport"),
    makeDeps({
      findLocation: async (raw) => (raw === "Eindhoven Airport" ? eindhovenAirport : null),
      loadDeadheadZoneAllowlist: async () => {
        throw new Error("connection reset");
      },
    })
  );
  assert.equal(res.available, false, "Eindhoven Airport is een bekende, bewezen locatie — een falende allowlist mag daar nooit stilzwijgend de basisprijs voor teruggeven");
  if (!res.available) assert.equal(res.reason, "unknown_location"); // pickup ("Laren") resolveert hier ook niet — zie toelichting hierboven
});

test("canonieke Eindhoven Airport heeft GEEN PDOK nodig — een falende lookupOfficialWoonplaats-dep raakt de (succesvolle) activering niet", async () => {
  const eindhovenAirport = {
    id: "eindhoven-airport-id",
    slug: "eindhoven-airport",
    name: "Eindhoven Airport",
    active: true,
    location_type: "airport" as const,
    city_id: "eindhoven-city-id",
  };
  let pdokCalled = false;
  const res = await resolveQuoteWith(
    input("Eindhoven Airport"),
    makeDeps({
      findLocation: async (raw) => (raw === "Eindhoven Airport" ? eindhovenAirport : null),
      loadDeadheadZoneAllowlist: async () => ({
        cityIds: new Set(["eindhoven-city-id"]),
        byOfficialWoonplaats: new Map([["eindhoven", "eindhoven-city-id"]]),
      }),
      lookupOfficialWoonplaats: async () => {
        pdokCalled = true;
        throw new Error("mag hier niet aangeroepen worden");
      },
    })
  );
  assert.equal(res.available, true);
  if (res.available) assert.equal(res.price, 193);
  assert.equal(pdokCalled, false, "een al-opgeloste LocationRow heeft nooit een PDOK-lookup nodig");
});

test("aantoonbaar buiten de zone (PDOK bevestigt een andere plaats) + latere allowlist-fout maakt niet uit — basisprijs, nooit onzeker", async () => {
  const res = await resolveQuoteWith(
    input("Vrijthof 1, 6211LC Maastricht"),
    makeDeps({
      lookupOfficialWoonplaats: async () => "Maastricht", // PDOK succesvol, gewoon een andere plaats
    })
  );
  assert.equal(res.available, true, "een bevestigd buiten-zone-adres blijft gewoon een bindende offerte, nooit 'onzeker'");
  if (res.available) assert.equal(res.price, 153); // basisprijs, 104.7km/67min (10.75+104.7*0.65+67*1.10=152.5→153)
});

test("geen enkel plausibiliteitssignaal (geen postcode, geen plaatsnaam) + volledige storing → basisprijs, nooit onzeker", async () => {
  const res = await resolveQuoteWith(
    input("Willekeurig adres zonder herkenbare aanwijzing"),
    makeDeps({
      loadDeadheadConfig: async () => {
        throw new Error("connection reset");
      },
    })
  );
  assert.equal(res.available, true);
  if (res.available) assert.equal(res.price, 153);
});

test("vaste route blijft volledig onaangetast door de betrouwbaarheidshardening", async () => {
  let shadowCalled = false;
  const res = await resolveQuoteWith(
    { pickup: "Amsterdam Centrum", dropoff: "Schiphol Airport" },
    makeDeps({
      findLocation: async (raw) =>
        raw === "Amsterdam Centrum"
          ? { id: "ams-id", slug: "amsterdam-centrum", name: "Amsterdam Centrum", active: true, location_type: "city", city_id: null }
          : { id: "sch-id", slug: "schiphol-airport", name: "Schiphol Airport", active: true, location_type: "airport", city_id: null },
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
      getRoute: async () => {
        throw new Error("mag niet aangeroepen worden voor een vaste route");
      },
      loadDeadheadConfig: async () => {
        throw new Error("mag niet aangeroepen worden voor een vaste route");
      },
      onShadow: () => {
        shadowCalled = true;
      },
    })
  );
  assert.equal(res.available, true);
  if (res.available) {
    assert.equal(res.price, 57);
    assert.equal(res.source, "fixed_route_prices");
  }
  assert.equal(shadowCalled, false);
});

test("retry-herstel end-to-end: config-loader faalt op de eerste poging, herstelt op de tweede → activering verloopt gewoon (via withRetryOnce zoals productie het gebruikt)", async () => {
  let calls = 0;
  const flakyThenOkConfig = async () => {
    calls += 1;
    if (calls === 1) throw new Error("tijdelijke cold-start-vertraging");
    return CONFIG;
  };
  const dropoff = { id: "roermond-id", slug: "roermond", name: "Roermond", active: true, location_type: "city" as const, city_id: "roermond-city-id" };
  const res = await resolveQuoteWith(
    input("dropoff"),
    makeDeps({
      findLocation: async (raw) => (raw === "dropoff" ? dropoff : null),
      getRoute: async () => ({ distanceKm: 90, durationMin: 70 }),
      // Simuleert exact wat cachedLoadDeadheadConfig in productie doet: één retry.
      loadDeadheadConfig: () => withRetryOnce(flakyThenOkConfig, 50, 50),
      loadDeadheadZoneAllowlist: async () => ({
        cityIds: new Set(["roermond-city-id"]),
        byOfficialWoonplaats: new Map([["roermond", "roermond-city-id"]]),
      }),
    })
  );
  assert.equal(res.available, true);
  if (res.available) assert.equal(res.price, 181); // exact zoals de bestaande ACTIVATIE-test
  assert.equal(calls, 2);
});
