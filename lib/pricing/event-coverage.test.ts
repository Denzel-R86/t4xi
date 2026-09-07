// Coverage-matrix voor de Event Pricing-dataset (Phase 5.6).
//
// Deze test beantwoordt de enige vraag die er vóór livegang toe doet: hoeveel
// REËLE klantinput herkent het evenemententarief daadwerkelijk, en — belangrijker
// — welke input herkent het TERECHT NIET.
//
// De dataset komt uit de seed-migratie zelf, de locatiecontext uit exact dezelfde
// pure functies als de productiepijplijn (`resolveLocationSlug` +
// `buildLocationContext`). Er wordt niets nagebootst behalve de vrijgave: in de
// seed staat elk evenement op pricing_enabled = false, hier worden ze aangezet om
// te kunnen meten wat er ná activatie gebeurt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildLocationContext } from "@/lib/pricing/location-context";
import { resolveLocationSlug } from "@/lib/pricing/location-aliases";
import { resolveEventFee } from "@/lib/pricing/event-fee";
import type {
  EventFeeRule,
  EventFeeRules,
  EventImpactLevel,
  EventPricingConfig,
  PricingEvent,
  PricingEventWindow,
  PricingEventZone,
} from "@/lib/pricing/event-pricing";

const SEED_SQL = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260828120000_pricing_events_seed_v2.sql"),
  "utf8"
);

const RULES: EventFeeRules = new Map<EventImpactLevel, EventFeeRule>([
  ["none", { feeCents: 0, maxUpliftPct: null }],
  ["elevated", { feeCents: 1250, maxUpliftPct: null }],
  ["high", { feeCents: 2500, maxUpliftPct: null }],
  ["very_high", { feeCents: 4000, maxUpliftPct: null }],
  ["extreme", { feeCents: 6000, maxUpliftPct: null }],
]);

const CONFIG: EventPricingConfig = {
  mode: "live",
  concurrentUpgradeEnabled: false,
  concurrentUpgradeMinEvents: 2,
  concurrentUpgradeMinLevel: "high",
  maxImpactLevel: "extreme",
};

// ── Dataset uit de seed ──────────────────────────────────────────────────────

function seedEvents(): PricingEvent[] {
  const flat = SEED_SQL.replace(/\s+/g, " ");
  const re =
    /\( '([a-z0-9-]+)', '([^']+)', '(\w+)', '([^']+)', (?:null|'[^']*'), '([^']+)', '([^']+)', '(\w+)', (?:null|\d+), (?:null|'[^']+'), (?:null|'[^']+'), '(\w+)', \d+, '(\w+)', '[^']+', (?:true|false), (?:true|false) \)/g;
  const out: PricingEvent[] = [];
  for (const m of flat.matchAll(re)) {
    out.push({
      id: m[1]!,
      slug: m[1]!,
      name: m[2]!,
      category: m[3] as PricingEvent["category"],
      city: m[4]!,
      venue: null,
      startsAt: m[5]!,
      endsAt: m[6]!,
      status: m[7] as PricingEvent["status"],
      expectedAttendance: null,
      sourceUrl: "https://example.org",
      sourceName: null,
      sourceType: m[8] as PricingEvent["sourceType"],
      sourcePriority: 1,
      verificationStatus: m[9] as PricingEvent["verificationStatus"],
      lastVerifiedAt: null,
      lastChangedAt: null,
      requiresAnnualConfirmation: true,
      // Vrijgave gesimuleerd: de seed levert ze bewust uitgeschakeld.
      pricingEnabled: true,
    });
  }
  return out;
}

function seedWindows(): PricingEventWindow[] {
  const re =
    /\('([a-z0-9-]+)', '(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)', '(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)', '(\w+)', '(\w+)', '(\w+)'\)/g;
  const out: PricingEventWindow[] = [];
  for (const m of SEED_SQL.matchAll(re)) {
    out.push({
      id: `${m[1]}-w${out.length}`,
      eventId: m[1]!,
      startsAt: m[2]!,
      endsAt: m[3]!,
      phase: m[4] as PricingEventWindow["phase"],
      pickupImpactLevel: m[5] as EventImpactLevel,
      dropoffImpactLevel: m[6] as EventImpactLevel,
    });
  }
  return out;
}

function seedZones(): PricingEventZone[] {
  const re =
    /\('([a-z0-9-]+)', '(location_slug|postcode4|locality|gemeente)', '([^']*)', '(pickup|dropoff|both)', '([a-z_]*)'\)/g;
  const out: PricingEventZone[] = [];
  for (const m of SEED_SQL.matchAll(re)) {
    const [, slug, type, value, direction, override] = m;
    out.push({
      id: `${slug}-${type}-${value}`,
      eventId: slug!,
      zoneType: type as PricingEventZone["zoneType"],
      locationSlug: type === "location_slug" ? value! : null,
      gemeenteNaam: null,
      locality: type === "locality" ? value! : null,
      postcode4: type === "postcode4" ? Number(value) : null,
      direction: direction as PricingEventZone["direction"],
      impactOverride: override ? (override as PricingEventZone["impactOverride"]) : null,
    });
  }
  return out;
}

const EVENTS = seedEvents();
const WINDOWS = seedWindows();
const ZONES = seedZones();

// ── De probe ─────────────────────────────────────────────────────────────────

type Verdict = "matches" | "fails closed";

/**
 * Simuleert één kant van een rit: het adres zoals de klant het koos, met de
 * slug die de prijsengine er zelf uit zou afleiden. `side` bepaalt of het adres
 * het ophaal- of afzetpunt is; de andere kant is bewust een neutrale locatie
 * buiten elke zone, zodat uitsluitend het geteste adres kan matchen.
 */
function probe(address: string, side: "pickup" | "dropoff", at: string): { verdict: Verdict; cents: number } {
  const tested = buildLocationContext(address, { locationSlug: resolveLocationSlug(address) });
  const neutral = buildLocationContext("Grote Markt 1, 9711 LV Groningen", {
    locationSlug: resolveLocationSlug("Grote Markt 1, 9711 LV Groningen"),
  });
  const result = resolveEventFee({
    leg: {
      pickup: side === "pickup" ? tested : neutral,
      dropoff: side === "dropoff" ? tested : neutral,
      departureAt: new Date(at),
    },
    events: EVENTS,
    windows: WINDOWS,
    zones: ZONES,
    rules: RULES,
    config: CONFIG,
    baselineSubtotalCents: null,
  });
  return { verdict: result.amountCents > 0 ? "matches" : "fails closed", cents: result.amountCents };
}

type Case = {
  event: string;
  form: string;
  address: string;
  side: "pickup" | "dropoff";
  at: string;
  expect: Verdict;
};

// Tijdstippen liggen in een venster van het betreffende evenement.
const IN_LOWLANDS_DEPARTURE = "2027-08-23T08:00:00Z";
const IN_NSJ_EXIT = "2027-07-10T22:30:00Z";
const IN_MARATHON = "2026-10-18T09:00:00Z";
const IN_ADE_PEAK = "2026-10-24T22:00:00Z";
const IN_PINKPOP_DEPARTURE = "2027-06-21T08:00:00Z";

const CASES: Case[] = [
  // ── Lowlands / Biddinghuizen: postcode4 8256 + locality ────────────────────
  { event: "lowlands-2027", form: "straatadres + postcode", address: "Spijkweg 30A, 8256RJ Biddinghuizen", side: "pickup", at: IN_LOWLANDS_DEPARTURE, expect: "matches" },
  { event: "lowlands-2027", form: "straatadres zonder postcode", address: "Spijkweg 30A, Biddinghuizen", side: "pickup", at: IN_LOWLANDS_DEPARTURE, expect: "matches" },
  { event: "lowlands-2027", form: "postcode + plaats", address: "8256RJ Biddinghuizen", side: "pickup", at: IN_LOWLANDS_DEPARTURE, expect: "matches" },
  { event: "lowlands-2027", form: "alleen plaatsnaam", address: "Biddinghuizen", side: "pickup", at: IN_LOWLANDS_DEPARTURE, expect: "matches" },
  { event: "lowlands-2027", form: "PDOK-woonplaatsvorm", address: "Biddinghuizen, Dronten, Flevoland", side: "pickup", at: IN_LOWLANDS_DEPARTURE, expect: "matches" },
  { event: "lowlands-2027", form: "venuenaam", address: "Walibi Holland", side: "pickup", at: IN_LOWLANDS_DEPARTURE, expect: "fails closed" },
  { event: "lowlands-2027", form: "buurdorp (mag NIET matchen)", address: "Dronten", side: "pickup", at: IN_LOWLANDS_DEPARTURE, expect: "fails closed" },

  // ── Pinkpop / Landgraaf: postcode4 6373 + locality ─────────────────────────
  { event: "pinkpop-2027", form: "alleen plaatsnaam", address: "Landgraaf", side: "pickup", at: IN_PINKPOP_DEPARTURE, expect: "matches" },
  { event: "pinkpop-2027", form: "PDOK-woonplaatsvorm", address: "Landgraaf, Landgraaf, Limburg", side: "pickup", at: IN_PINKPOP_DEPARTURE, expect: "matches" },
  { event: "pinkpop-2027", form: "buurgemeente (mag NIET matchen)", address: "Kerkrade", side: "pickup", at: IN_PINKPOP_DEPARTURE, expect: "fails closed" },

  // ── North Sea Jazz / Ahoy: uitsluitend postcode4 3084 ──────────────────────
  { event: "north-sea-jazz-2027", form: "straatadres + postcode", address: "Ahoyweg 10, 3084BA Rotterdam", side: "pickup", at: IN_NSJ_EXIT, expect: "matches" },
  { event: "north-sea-jazz-2027", form: "straatadres zonder postcode", address: "Ahoyweg 10, Rotterdam", side: "pickup", at: IN_NSJ_EXIT, expect: "fails closed" },
  { event: "north-sea-jazz-2027", form: "venuenaam", address: "Rotterdam Ahoy", side: "pickup", at: IN_NSJ_EXIT, expect: "fails closed" },
  { event: "north-sea-jazz-2027", form: "alleen stad (mag NIET matchen)", address: "Rotterdam", side: "pickup", at: IN_NSJ_EXIT, expect: "fails closed" },
  { event: "north-sea-jazz-2027", form: "andere wijk (mag NIET matchen)", address: "Coolsingel 1, 3011 AD Rotterdam", side: "pickup", at: IN_NSJ_EXIT, expect: "fails closed" },

  // ── Amsterdam Marathon: postcodes uit de afsluitingslijst ──────────────────
  { event: "amsterdam-marathon-2026", form: "straatadres + postcode op parcours", address: "Stadionweg 10, 1077SP Amsterdam", side: "pickup", at: IN_MARATHON, expect: "matches" },
  { event: "amsterdam-marathon-2026", form: "Zuidas op parcours", address: "Gustav Mahlerlaan 10, 1082PP Amsterdam", side: "dropoff", at: IN_MARATHON, expect: "matches" },
  { event: "amsterdam-marathon-2026", form: "straatadres zonder postcode", address: "Stadionweg 10, Amsterdam", side: "pickup", at: IN_MARATHON, expect: "fails closed" },
  { event: "amsterdam-marathon-2026", form: "Noord, NIET op parcours", address: "Buikslotermeerplein 1, 1025 XE Amsterdam", side: "pickup", at: IN_MARATHON, expect: "fails closed" },
  { event: "amsterdam-marathon-2026", form: "Zuidoost, NIET op parcours", address: "Bijlmerplein 100, 1102 DA Amsterdam", side: "pickup", at: IN_MARATHON, expect: "fails closed" },
  { event: "amsterdam-marathon-2026", form: "alleen stadsnaam", address: "Amsterdam", side: "pickup", at: IN_MARATHON, expect: "fails closed" },

  // ── ADE: stadsbreed via location_slug ──────────────────────────────────────
  { event: "ade-2026", form: "straatadres + postcode", address: "Damrak 1, 1012 LG Amsterdam", side: "pickup", at: IN_ADE_PEAK, expect: "matches" },
  { event: "ade-2026", form: "alleen stadsnaam", address: "Amsterdam", side: "pickup", at: IN_ADE_PEAK, expect: "matches" },
  { event: "ade-2026", form: "Zuidoost", address: "Bijlmerplein 100, 1102 DA Amsterdam", side: "pickup", at: IN_ADE_PEAK, expect: "matches" },
  { event: "ade-2026", form: "buurgemeente (mag NIET matchen)", address: "Amstelveen", side: "pickup", at: IN_ADE_PEAK, expect: "fails closed" },
];

test("coverage-matrix: elke inputvorm valt uit zoals ontworpen", () => {
  const rows: string[] = [];
  const failures: string[] = [];
  for (const c of CASES) {
    const { verdict, cents } = probe(c.address, c.side, c.at);
    rows.push(
      `${c.event.padEnd(24)} ${c.form.padEnd(34)} ${verdict.padEnd(13)} ${verdict === "matches" ? `€${(cents / 100).toFixed(2)}` : "—"}`
    );
    if (verdict !== c.expect) {
      failures.push(`${c.event} / ${c.form}: verwacht "${c.expect}", kreeg "${verdict}" (${c.address})`);
    }
  }
  console.log("\n" + rows.join("\n") + "\n");
  assert.deepEqual(failures, []);
});

test("coverage: geen enkel adres buiten de zones krijgt een toeslag", () => {
  const outside = [
    "Grote Markt 1, 9711 LV Groningen",
    "Stationsplein 1, 5211 AP 's-Hertogenbosch",
    "Hoofdstraat 12",
    "",
  ];
  for (const address of outside) {
    for (const at of [IN_LOWLANDS_DEPARTURE, IN_MARATHON, IN_ADE_PEAK, IN_NSJ_EXIT]) {
      assert.equal(probe(address, "pickup", at).verdict, "fails closed", `${address} @ ${at}`);
    }
  }
});

test("coverage: buiten elk tijdvenster is er nooit een toeslag", () => {
  // Zelfde adressen, maar een moment dat in geen enkel venster valt.
  const quiet = "2027-03-15T12:00:00Z";
  for (const address of ["Spijkweg 30A, 8256RJ Biddinghuizen", "Damrak 1, 1012 LG Amsterdam", "Ahoyweg 10, 3084BA Rotterdam"]) {
    assert.equal(probe(address, "pickup", quiet).verdict, "fails closed", address);
  }
});

test("coverage: richting wordt gerespecteerd — uitstroomvensters belasten alleen ophalen", () => {
  // Lowlands maandagochtend is een vertrekvenster: pickup wél, dropoff niet.
  const address = "Spijkweg 30A, 8256RJ Biddinghuizen";
  assert.equal(probe(address, "pickup", IN_LOWLANDS_DEPARTURE).verdict, "matches");
  assert.equal(probe(address, "dropoff", IN_LOWLANDS_DEPARTURE).verdict, "fails closed");
  // En andersom op de aankomstdag.
  const arrival = "2027-08-19T10:00:00Z";
  assert.equal(probe(address, "dropoff", arrival).verdict, "matches");
  assert.equal(probe(address, "pickup", arrival).verdict, "fails closed");
});
