// F-29: de routezoeker (/tarieven) moet bij een retour retourdatum en -tijd naar
// /api/pricing/quote sturen, zodat het nachttarief (+15% per ritdeel, 23:00–06:00)
// op het eigen moment van het terug-ritdeel wordt bepaald. Geen Supabase: de
// engine draait met een geïnjecteerde vaste-route-quote.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildQuoteRequestBody } from "@/components/shared/useRouteQuote";
import { isRouteFinderDetailsComplete } from "@/lib/tarieven/route-finder";
import { POST as quoteRoute } from "@/app/api/pricing/quote/route";
import { calculateBookingPrice } from "@/lib/pricing/engine";
import { amsterdamDepartureIso } from "@/lib/pricing/departure-time";
import { NO_AIRPORT, type PricingQuoteResult } from "@/lib/pricing/service";

type AvailableQuote = Extract<PricingQuoteResult, { available: true }>;

const PICKUP = "Amsterdam Zuidas";
const DROPOFF = "Schiphol";

const routeFinderSrc = readFileSync("components/tarieven/RouteFinder.tsx", "utf8");

/**
 * Spiegel van RouteFinder.tsx: `detailsComplete` + de useRouteQuote-opties. Dat de
 * component exact zo bedraad is, legt de eerste test hieronder vast; het
 * gedragsbewijs in de browser staat in tests/behavior/routefinder-return.spec.ts.
 */
function routeFinderQuoteOptions(s: {
  returnTrip: boolean;
  passengers: number;
  date: string;
  time: string;
  luggage: string;
  returnDate: string;
  returnTime: string;
}) {
  return {
    returnTrip: s.returnTrip,
    passengers: s.passengers,
    date: s.date,
    time: s.time,
    luggage: s.luggage,
    ready: isRouteFinderDetailsComplete(s.date, s.time, s.luggage, s.returnTrip, s.returnDate, s.returnTime),
    ...(s.returnTrip ? { returnDate: s.returnDate, returnTime: s.returnTime } : {}),
  };
}

/** De quote-body die de routezoeker voor deze invoer verstuurt. */
function finderBody(state: {
  returnTrip: boolean;
  date: string;
  time: string;
  returnDate?: string;
  returnTime?: string;
}) {
  const opts = routeFinderQuoteOptions({
    passengers: 1,
    luggage: "1-2-koffers",
    returnDate: "",
    returnTime: "",
    ...state,
  });
  return {
    ready: opts.ready,
    body: buildQuoteRequestBody(PICKUP, DROPOFF, {
      returnDate: "",
      returnTime: "",
      ...opts,
    }),
  };
}

/** Vaste-route-retourquote: enkele rit €102, retourbundel €184 (cent-exact). */
function fixedRetourQuote(): AvailableQuote {
  return {
    available: true,
    source: "fixed_route_prices",
    price: 184,
    singlePrice: 102,
    returnPrice: 184,
    returnApplied: true,
    priceCents: 18400,
    singlePriceCents: 10200,
    returnPriceCents: 18400,
    rideOnlySinglePriceCents: 10200,
    currency: "EUR",
    vatRate: 9,
    distanceKm: 18,
    estimatedDurationMin: 25,
    vehicleClass: "executive-ev",
    route: { pickupSlug: "amsterdam-zuidas", dropoffSlug: "schiphol", label: "Zuidas → AMS" },
    isAirportTransfer: true,
    airport: { ...NO_AIRPORT, dropoffIsAirport: true, isAirportDropoff: true, isAirportTransfer: true },
    dataSource: "supabase",
    fingerprint: "amsterdam-zuidas|schiphol|executive-ev|retour",
    pickupApproach: null,
    economicFloor: null,
    airportArrival: null,
  };
}

/**
 * Exact de omzetting van /api/pricing/quote (route.ts): date+time en
 * returnDate+returnTime → Amsterdamse instants → calculateBookingPrice.
 */
async function nightCodesFor(body: ReturnType<typeof finderBody>["body"]) {
  const departureAt = amsterdamDepartureIso(body.date, body.time) ?? undefined;
  const ret = body as { returnDate?: string; returnTime?: string };
  const returnDepartureAt =
    ret.returnDate && ret.returnTime ? amsterdamDepartureIso(ret.returnDate, ret.returnTime) ?? undefined : undefined;
  const { snapshot } = await calculateBookingPrice(
    {
      pickup: body.pickup,
      dropoff: body.dropoff,
      returnTrip: body.returnTrip,
      passengers: body.passengers,
      ...(departureAt ? { departureAt } : {}),
      ...(returnDepartureAt ? { returnDepartureAt } : {}),
    },
    {
      getQuote: async () => fixedRetourQuote(),
      loadEventPricing: async () => null,
      now: () => new Date("2026-10-01T08:00:00.000Z"),
      generateQuoteId: () => "0192f0c0-0000-7000-8000-000000000f29",
    }
  );
  assert.ok(snapshot);
  return { codes: snapshot.adjustments.map((a) => a.code), totalCents: snapshot.totalCents };
}

const LEG = 1530; // round(10200 × 0,15)

test("F-29: RouteFinder geeft retourdatum/-tijd aan useRouteQuote en wacht op beide", () => {
  const call = routeFinderSrc.match(/useRouteQuote\(\s*pickup,\s*dropoff,\s*\{([\s\S]*?)\}\);/);
  assert.ok(call, "useRouteQuote-aanroep niet gevonden in RouteFinder.tsx");
  assert.match(call![1], /\.\.\.\(returnTrip \? \{ returnDate, returnTime \} : \{\}\)/, "returnDate/returnTime ontbreken in de quote-aanroep");
  assert.match(call![1], /ready: detailsComplete/);
  assert.match(
    routeFinderSrc,
    /const detailsComplete = isRouteFinderDetailsComplete\(date, time, luggage, returnTrip, returnDate, returnTime\);/
  );
});

test("F-29: heen overdag (14:30), terug 's nachts (23:30) → body bevat retourmoment; alleen night_return", async () => {
  const { ready, body } = finderBody({
    returnTrip: true,
    date: "2099-11-12",
    time: "14:30",
    returnDate: "2099-11-19",
    returnTime: "23:30",
  });
  assert.equal(ready, true);
  assert.equal(body.returnDate, "2099-11-19");
  assert.equal(body.returnTime, "23:30");
  const { codes, totalCents } = await nightCodesFor(body);
  assert.deepEqual(codes, ["night_return"]);
  assert.equal(totalCents, 18400 + LEG);
});

test("F-29: spiegel — heen 's nachts (23:30), terug overdag (14:30) → alleen night_outbound", async () => {
  const { body } = finderBody({
    returnTrip: true,
    date: "2099-11-12",
    time: "23:30",
    returnDate: "2099-11-19",
    returnTime: "14:30",
  });
  assert.equal(body.returnTime, "14:30");
  const { codes, totalCents } = await nightCodesFor(body);
  assert.deepEqual(codes, ["night_outbound"]);
  assert.equal(totalCents, 18400 + LEG);
});

test("F-29: zonder retourmoment had de engine het terug-ritdeel nooit als nacht beoordeeld", async () => {
  // Body zoals de routezoeker hem vóór de fix stuurde (geen returnDate/returnTime).
  const legacy = buildQuoteRequestBody(PICKUP, DROPOFF, {
    returnTrip: true,
    passengers: 1,
    date: "2099-11-12",
    time: "14:30",
    luggage: "1-2-koffers",
    returnDate: "",
    returnTime: "",
  });
  assert.equal("returnDate" in legacy, false);
  const { codes } = await nightCodesFor(legacy);
  assert.deepEqual(codes, [], "zonder retourtijd geen night_return — de toeslag zou ontbreken");
});

test("F-29: de API weigert die oude retourbody (400, geen prijs) — de routezoeker toonde dan een fout", async () => {
  const legacy = buildQuoteRequestBody(PICKUP, DROPOFF, {
    returnTrip: true,
    passengers: 1,
    date: "2099-11-12",
    time: "14:30",
    luggage: "1-2-koffers",
    returnDate: "",
    returnTime: "",
  });
  const res = await quoteRoute(
    new Request("https://www.t4xi.nl/api/pricing/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.229" },
      body: JSON.stringify(legacy),
    })
  );
  assert.equal(res.status, 400);
  const payload = await res.json();
  assert.equal("price" in payload, false);
});

test("F-29: retour wordt pas 'ready' als retourdatum én -tijd gevuld zijn", () => {
  const base = { returnTrip: true, date: "2099-11-12", time: "14:30" };
  assert.equal(finderBody({ ...base, returnDate: "", returnTime: "23:30" }).ready, false);
  assert.equal(finderBody({ ...base, returnDate: "2099-11-19", returnTime: "" }).ready, false);
  assert.equal(finderBody({ ...base, returnDate: "2099-11-19", returnTime: "23:30" }).ready, true);
});

test("F-29: enkele rit ongewijzigd — geen retourvelden in opties of body", async () => {
  const { ready, body } = finderBody({ returnTrip: false, date: "2099-11-12", time: "14:30", returnDate: "2099-11-19", returnTime: "23:30" });
  assert.equal(ready, true);
  assert.deepEqual(body, {
    pickup: PICKUP,
    dropoff: DROPOFF,
    returnTrip: false,
    passengers: 1,
    date: "2099-11-12",
    time: "14:30",
    luggageCategory: "1-2-koffers",
  });
  const opts = routeFinderQuoteOptions({
    returnTrip: false, passengers: 1, date: "2099-11-12", time: "14:30", luggage: "1-2-koffers",
    returnDate: "2099-11-19", returnTime: "23:30",
  });
  assert.equal("returnDate" in opts, false);
  assert.equal("returnTime" in opts, false);
});

test("F-29: RouteFinder-body == BookingSection-body voor dezelfde retourrit", () => {
  const ride = { date: "2099-11-12", time: "14:30", returnDate: "2099-11-19", returnTime: "23:30" };
  const { body: finder } = finderBody({ returnTrip: true, ...ride });
  // BookingSection.tsx: useRouteQuote(pickup, dropoff, { returnTrip: tab === "retour", passengers: persons,
  // date, time, luggage, ready, ...(tab === "retour" ? { returnDate, returnTime } : {}) }).
  const tab = "retour" as string;
  const bookingOpts = {
    returnTrip: tab === "retour",
    passengers: 1,
    date: ride.date,
    time: ride.time,
    luggage: "1-2-koffers",
    ...(tab === "retour" ? { returnDate: ride.returnDate, returnTime: ride.returnTime } : {}),
  };
  const booking = buildQuoteRequestBody(PICKUP, DROPOFF, { returnDate: "", returnTime: "", ...bookingOpts });
  assert.deepEqual(finder, booking);
  // Ook de BookingSection-bron geeft het retourmoment op die manier door.
  const src = readFileSync("components/booking/BookingSection.tsx", "utf8");
  assert.match(src, /\.\.\.\(tab === "retour" \? \{ returnDate, returnTime \} : \{\}\)/);
});
