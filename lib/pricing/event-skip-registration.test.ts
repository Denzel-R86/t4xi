import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { calculateBookingPrice } from "@/lib/pricing/engine";
import { NO_AIRPORT, type PricingQuoteResult } from "@/lib/pricing/service";
import { eurosToCents } from "@/lib/payments/create-intent";
import type { EventPricingData } from "@/lib/pricing/event-store";

/**
 * Een optionele evenemententoeslag mag NOOIT een geldige reguliere prijs
 * wegnemen, en een overgeslagen berekening mag nooit spoorloos verdwijnen.
 *
 * Aanleiding: de klantfout van 18-10-2026 (HTTP 500, geen enkel spoor) en de
 * vaststelling dat de beveiliging uitsluitend `await load()` dekte.
 */

type AvailableQuote = Extract<PricingQuoteResult, { available: true }>;

function quoteFixture(price: number): AvailableQuote {
  return {
    available: true, source: "fixed_route_prices", price, singlePrice: price,
    returnPrice: null, returnApplied: false, priceCents: eurosToCents(price),
    singlePriceCents: eurosToCents(price), returnPriceCents: null,
    rideOnlySinglePriceCents: eurosToCents(price), currency: "EUR", vatRate: 9,
    distanceKm: 34, estimatedDurationMin: 42, vehicleClass: "executive-ev",
    route: { pickupSlug: "amsterdam", dropoffSlug: "almere", label: "AMS → ALM" },
    isAirportTransfer: false, airport: { ...NO_AIRPORT }, dataSource: "supabase",
    fingerprint: "fp", pickupApproach: null, economicFloor: null, airportArrival: null,
  } as AvailableQuote;
}

const INVOER = {
  pickup: "tt. Vasumweg 32A-17, 1033 SC Amsterdam",
  dropoff: "Sterduinstraat 2, 1361 BP Almere",
  returnTrip: false,
  departureAt: "2026-10-21T20:00:00.000Z",
};

async function prijsMet(load: () => Promise<EventPricingData | null>) {
  const meldingen: string[] = [];
  const origineel = console.warn;
  console.warn = (m?: unknown) => { meldingen.push(String(m)); };
  try {
    const r = await calculateBookingPrice(INVOER, {
      getQuote: async () => quoteFixture(75),
      now: () => new Date("2026-10-18T11:00:00.000Z"),
      generateQuoteId: () => "00000000-0000-7000-8000-000000000001",
      loadEventPricing: load,
      recordShadowLog: async () => {},
    });
    return { r, meldingen };
  } finally {
    console.warn = origineel;
  }
}

// ── De prijs overleeft elke eventfout ────────────────────────────────────────

test("een gooiende loader laat de reguliere prijs intact en wordt gemeld", async () => {
  const { r, meldingen } = await prijsMet(async () => {
    throw new Error("supabase: connection reset");
  });
  assert.equal(r.quote.available, true);
  assert.equal(r.snapshot?.totalCents, 7500, "EUR 75,00 blijft staan");
  assert.equal(meldingen.length, 1);
  assert.match(meldingen[0]!, /reden=laden-faalde/);
  assert.match(meldingen[0]!, /fouttype=Error/);
});

test("een loader die stilzwijgend null geeft wordt OOK gemeld", async () => {
  // Dit was de stille faalmodus: `.catch(() => null)` in de loader, daarna
  // mode 'off', waarna observeEventFees direct terugkeert. Geen rij, geen log.
  const { r, meldingen } = await prijsMet(async () => null);
  assert.equal(r.snapshot?.totalCents, 7500);
  assert.equal(meldingen.length, 1);
  assert.match(meldingen[0]!, /reden=laden-gaf-niets/);
});

test("een fout IN de berekening neemt de prijs niet meer weg", async () => {
  // Vóór 18-10 propageerde dit naar de route en werd het HTTP 500 zonder prijs.
  const kapot = {
    get config() { throw new Error("misvormde configuratie"); },
  } as unknown as EventPricingData;
  const { r, meldingen } = await prijsMet(async () => kapot);
  assert.equal(r.quote.available, true, "de klant houdt zijn prijs");
  assert.equal(r.snapshot?.totalCents, 7500);
  assert.ok(
    meldingen.some((m) => /reden=(berekening-faalde|laden-gaf-niets)/.test(m)),
    `verwachtte een meldingsregel, kreeg: ${JSON.stringify(meldingen)}`
  );
});

// ── Geen persoonsgegevens in de meldingen ────────────────────────────────────

test("de melding bevat geen adres, datum of andere klantinvoer", async () => {
  const { meldingen } = await prijsMet(async () => {
    throw new Error(`mislukt voor ${INVOER.pickup}`);
  });
  const alles = meldingen.join(" ");
  for (const verboden of ["Vasumweg", "Sterduinstraat", "1033", "1361", "2026-10-21"]) {
    assert.ok(!alles.includes(verboden), `melding lekt klantinvoer: ${verboden}`);
  }
});

// ── Broncode-locks ───────────────────────────────────────────────────────────

test("de route logt de reden van een 500 en lekt daarbij niets", () => {
  const src = readFileSync(new URL("../../app/api/pricing/quote/route.ts", import.meta.url), "utf8");
  const blok = src.slice(src.indexOf("} catch (err) {"));
  assert.match(blok, /console\.error/, "de 500-tak moet een spoor achterlaten");
  assert.match(blok, /fouttype=/, "fouttype hoort in de regel");
  // de vrije fouttekst mag er NIET in: die kan ingevoerde waarden echoen
  assert.doesNotMatch(blok.slice(0, blok.indexOf("return json(500")), /err\.message|\$\{err\}/,
    "de vrije fouttekst mag niet gelogd worden");
});

test("het hele eventpad valt binnen de beveiliging, niet alleen de load", () => {
  const src = readFileSync(new URL("./engine.ts", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("async function eventFeesForQuote"), src.indexOf("async function observeEventFees"));
  const laatsteTry = fn.lastIndexOf("try {");
  for (const aanroep of ["buildEventLegs(", "resolveEventFee(", "buildLocationContext("]) {
    assert.ok(
      fn.indexOf(aanroep) > laatsteTry,
      `${aanroep} moet BINNEN de beveiliging staan, anders kan een fout de prijs wegnemen`
    );
  }
  assert.match(fn, /skipEventFees\("berekening-faalde"/);
});
