import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  isVerificationRequest,
  VERIFICATION_HEADER,
  MIN_VERIFICATION_TOKEN_LENGTH,
} from "@/lib/pricing/verification-header";
import { calculateBookingPrice } from "@/lib/pricing/engine";
import { NO_AIRPORT, type PricingQuoteResult } from "@/lib/pricing/service";
import { eurosToCents } from "@/lib/payments/create-intent";
import type { EventShadowObservation } from "@/lib/pricing/event-shadow-log";
import type { EventPricingData } from "@/lib/pricing/event-store";
import type {
  EventFeeRule,
  EventImpactLevel,
  PricingEvent,
  PricingEventWindow,
  PricingEventZone,
} from "@/lib/pricing/event-pricing";

/**
 * De verificatieheader mag UITSLUITEND de classificatie van observaties raken.
 *
 * Het zwaarste bewijs in dit bestand is niet "de vlag werkt", maar "de klantprijs
 * is cent-identiek met en zonder de header" — en dat de route bij een onjuist
 * token geen afwijkend antwoord geeft, want dan zou hij een orakel zijn om het
 * token te raden.
 */

const TOKEN = "t".repeat(MIN_VERIFICATION_TOKEN_LENGTH);

const headers = (o: Record<string, string> = {}) => new Headers(o);

// ── 1. De functie staat standaard UIT ────────────────────────────────────────

test("zonder VERIFICATION_TOKEN wordt de header volledig genegeerd", () => {
  assert.equal(isVerificationRequest(headers({ [VERIFICATION_HEADER]: TOKEN }), {}), false);
  assert.equal(
    isVerificationRequest(headers({ [VERIFICATION_HEADER]: TOKEN }), { VERIFICATION_TOKEN: "" }),
    false
  );
});

test("een te kort token houdt de functie uit", () => {
  const zwak = "t".repeat(MIN_VERIFICATION_TOKEN_LENGTH - 1);
  assert.equal(
    isVerificationRequest(headers({ [VERIFICATION_HEADER]: zwak }), { VERIFICATION_TOKEN: zwak }),
    false,
    "een raadbaar token mag de uitsluiting niet openzetten"
  );
});

test("de ondergrens is minstens 32 tekens", () => {
  assert.ok(MIN_VERIFICATION_TOKEN_LENGTH >= 32);
});

// ── 2. Alleen een exacte match telt ──────────────────────────────────────────

test("een geldige header met het juiste token wordt herkend", () => {
  assert.equal(
    isVerificationRequest(headers({ [VERIFICATION_HEADER]: TOKEN }), { VERIFICATION_TOKEN: TOKEN }),
    true
  );
});

test("een onjuist, te kort of te lang token wordt geweigerd", () => {
  for (const poging of [
    "x".repeat(MIN_VERIFICATION_TOKEN_LENGTH),
    TOKEN.slice(0, -1),
    `${TOKEN}t`,
    TOKEN.toUpperCase(),
  ]) {
    assert.equal(
      isVerificationRequest(headers({ [VERIFICATION_HEADER]: poging }), { VERIFICATION_TOKEN: TOKEN }),
      false,
      `had geweigerd moeten worden: ${poging.slice(0, 8)}…`
    );
  }
});

test("een ontbrekende of lege header telt gewoon mee als echt verkeer", () => {
  assert.equal(isVerificationRequest(headers(), { VERIFICATION_TOKEN: TOKEN }), false);
  assert.equal(
    isVerificationRequest(headers({ [VERIFICATION_HEADER]: "   " }), { VERIFICATION_TOKEN: TOKEN }),
    false
  );
});

test("omringende witruimte in header en token wordt genegeerd", () => {
  assert.equal(
    isVerificationRequest(headers({ [VERIFICATION_HEADER]: ` ${TOKEN} ` }), {
      VERIFICATION_TOKEN: `  ${TOKEN}  `,
    }),
    true
  );
});

test("de headernaam is case-insensitief, zoals HTTP voorschrijft", () => {
  assert.equal(
    isVerificationRequest(headers({ "X-T4XI-VERIFICATION": TOKEN }), { VERIFICATION_TOKEN: TOKEN }),
    true
  );
});

// ── 3. De vlag kan de prijs niet raken ───────────────────────────────────────

type AvailableQuote = Extract<PricingQuoteResult, { available: true }>;

function quoteFixture(price: number): AvailableQuote {
  return {
    available: true,
    source: "fixed_route_prices",
    price,
    singlePrice: price,
    returnPrice: null,
    returnApplied: false,
    priceCents: eurosToCents(price),
    singlePriceCents: eurosToCents(price),
    returnPriceCents: null,
    rideOnlySinglePriceCents: eurosToCents(price),
    currency: "EUR",
    vatRate: 9,
    distanceKm: 22.5,
    estimatedDurationMin: 28,
    vehicleClass: "executive-ev",
    route: { pickupSlug: "rotterdam", dropoffSlug: "schiphol", label: "RTM → AMS" },
    isAirportTransfer: true,
    airport: { ...NO_AIRPORT, dropoffIsAirport: true, isAirportDropoff: true, isAirportTransfer: true },
    dataSource: "supabase",
    fingerprint: "fp",
    pickupApproach: null,
    economicFloor: null,
    airportArrival: null,
  };
}

const RULES = new Map<EventImpactLevel, EventFeeRule>([
  ["none", { feeCents: 0, maxUpliftPct: null }],
  ["elevated", { feeCents: 1250, maxUpliftPct: null }],
  ["high", { feeCents: 2500, maxUpliftPct: null }],
  ["very_high", { feeCents: 4000, maxUpliftPct: null }],
  ["extreme", { feeCents: 6000, maxUpliftPct: null }],
]);

const EVENT: PricingEvent = {
  id: "evt-1", slug: "ade-2026", name: "Amsterdam Dance Event", category: "festival",
  city: "Amsterdam", venue: null, startsAt: "2026-10-21T00:00:00.000Z",
  endsAt: "2026-10-26T00:00:00.000Z", status: "confirmed", expectedAttendance: null,
  sourceUrl: "https://example.org", sourceName: null, sourceType: "organiser",
  sourcePriority: 1, verificationStatus: "verified", lastVerifiedAt: null,
  lastChangedAt: null, requiresAnnualConfirmation: true, pricingEnabled: true,
};

const WINDOW: PricingEventWindow = {
  id: "win-1", eventId: "evt-1", startsAt: "2026-10-24T06:00:00.000Z",
  endsAt: "2026-10-24T20:00:00.000Z", phase: "active",
  pickupImpactLevel: "high", dropoffImpactLevel: "none",
};

const ZONE: PricingEventZone = {
  id: "zone-1", eventId: "evt-1", zoneType: "location_slug", locationSlug: "rotterdam",
  gemeenteNaam: null, locality: null, postcode4: null, direction: "both", impactOverride: null,
};

const SHADOW_DATA: EventPricingData = {
  config: {
    mode: "shadow",
    concurrentUpgradeEnabled: false,
    concurrentUpgradeMinEvents: 2,
    concurrentUpgradeMinLevel: "high",
    maxImpactLevel: "extreme",
  },
  events: [EVENT],
  windows: [WINDOW],
  zones: [ZONE],
  rules: RULES,
};

async function priceWith(synthetic: boolean) {
  const seen: EventShadowObservation[] = [];
  const result = await calculateBookingPrice(
    {
      pickup: "Coolsingel 1, 3011 AD Rotterdam",
      dropoff: "Schiphol Airport, 1118 CP Schiphol",
      returnTrip: false,
      departureAt: "2026-10-24T13:00:00.000Z",
    },
    {
      getQuote: async () => quoteFixture(100),
      now: () => new Date("2026-10-20T10:00:00.000Z"),
      generateQuoteId: () => "00000000-0000-7000-8000-000000000001",
      loadEventPricing: async () => SHADOW_DATA,
      recordShadowLog: async (entries) => {
        seen.push(...entries);
      },
      markObservationsSynthetic: synthetic,
    }
  );
  return { result, seen };
}

test("de klantprijs is cent-identiek met en zonder de verificatievlag", async () => {
  const uit = await priceWith(false);
  const aan = await priceWith(true);

  assert.deepEqual(aan.result.quote, uit.result.quote, "de offerte mag niet verschillen");
  assert.deepEqual(aan.result.snapshot, uit.result.snapshot, "de snapshot mag niet verschillen");
  assert.equal(uit.result.snapshot?.totalCents, 10000, "en de prijs is ongewijzigd €100,00");
});

test("de vlag raakt UITSLUITEND het veld synthetic in de observatie", async () => {
  const uit = await priceWith(false);
  const aan = await priceWith(true);

  assert.ok(uit.seen.length > 0, "er moet een observatie zijn om iets te bewijzen");
  assert.equal(uit.seen.length, aan.seen.length);
  assert.deepEqual(
    uit.seen.map((o) => o.synthetic),
    uit.seen.map(() => false)
  );
  assert.deepEqual(
    aan.seen.map((o) => o.synthetic),
    aan.seen.map(() => true)
  );

  // Alles behalve `synthetic` moet identiek zijn.
  const zonder = (o: EventShadowObservation) => ({ ...o, synthetic: null });
  assert.deepEqual(aan.seen.map(zonder), uit.seen.map(zonder));
});

// ── 4. Wiring- en veiligheidslocks op de route ───────────────────────────────

const ROUTE = readFileSync(new URL("../../app/api/pricing/quote/route.ts", import.meta.url), "utf8");

test("de route geeft het resultaat door aan markObservationsSynthetic", () => {
  assert.match(ROUTE, /isVerificationRequest/, "de route importeert de controle");
  assert.match(
    ROUTE,
    /markObservationsSynthetic:\s*isVerificationRequest\(request\.headers\)/,
    "zonder deze wiring zou de header niets doen"
  );
});

test("de route wordt geen orakel: geen eigen statuscode op de verificatieheader", () => {
  // Een 401/403 bij een onjuist token zou het raden van het token meetbaar maken.
  const regels = ROUTE.split(/\r?\n/).filter((l) => /isVerificationRequest|VERIFICATION/.test(l));
  for (const r of regels) {
    assert.doesNotMatch(r, /\b(401|403|return)\b/, `verificatie mag de respons niet sturen: ${r.trim()}`);
  }
});

test("de module zelf raakt niets prijsachtigs aan", () => {
  // De vlag staat in de DEPS van calculateBookingPrice, nooit in `input`. Deze
  // scan bewijst dat de module geen enkel prijsbegrip kent. Commentaar gaat er
  // eerst uit: de toelichting bénoemt `observeEventFees` en de klantprijs, en
  // die uitleg mag de scan niet laten afgaan.
  const ruw = readFileSync(new URL("./verification-header.ts", import.meta.url), "utf8");
  const codeRegels = ruw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n")
    .toLowerCase();

  // Op woordgrens, niet op losse substring: `timingSafeEqual` bevat "fee".
  for (const verboden of ["price", "cents", "fee", "fees", "amount", "total", "snapshot", "adjustment"]) {
    assert.doesNotMatch(
      codeRegels,
      new RegExp(`\\b${verboden}\\b`),
      `mag niets prijsachtigs bevatten: ${verboden}`
    );
  }
  // En geen databasetoegang: classificatie is geen schrijfactie.
  for (const verboden of ["supabase", "createclient", "insert", "update"]) {
    assert.doesNotMatch(
      codeRegels,
      new RegExp(`\\b${verboden}\\b`),
      `mag geen databasetoegang bevatten: ${verboden}`
    );
  }
});
