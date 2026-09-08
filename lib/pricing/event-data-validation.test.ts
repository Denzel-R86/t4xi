// Datakwaliteitstests voor de evenementdataset (Phase 5).
//
// Twee lagen:
//   1. de regels zelf, op synthetische gevallen;
//   2. de ECHTE seed-migratie, geparsed uit het SQL-bestand. Zo kan de dataset
//      niet stilzwijgend uit de pas lopen met de tests die haar bewaken.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  eventDataErrors,
  validateEventData,
  SEED_CUTOFF_ISO,
  type EventDataSet,
} from "@/lib/pricing/event-data-validation";
import type { EventImpactLevel, PricingEvent, PricingEventWindow, PricingEventZone } from "@/lib/pricing/event-pricing";

// ── Bouwstenen ───────────────────────────────────────────────────────────────

function event(overrides: Partial<PricingEvent> = {}): PricingEvent {
  return {
    id: "evt-1",
    slug: "ade-2026",
    name: "Amsterdam Dance Event 2026",
    category: "festival",
    city: "Amsterdam",
    venue: null,
    startsAt: "2026-10-21T20:00:00.000Z",
    endsAt: "2026-10-26T03:00:00.000Z",
    status: "confirmed",
    expectedAttendance: null,
    sourceUrl: "https://www.amsterdam-dance-event.nl/en/",
    sourceName: "Officiele website",
    sourceType: "organiser",
    sourcePriority: 1,
    verificationStatus: "verified",
    lastVerifiedAt: "2026-08-27T00:00:00.000Z",
    lastChangedAt: null,
    requiresAnnualConfirmation: true,
    pricingEnabled: false,
    ...overrides,
  };
}

function window(overrides: Partial<PricingEventWindow> = {}): PricingEventWindow {
  return {
    id: "win-1",
    eventId: "evt-1",
    startsAt: "2026-10-23T20:00:00.000Z",
    endsAt: "2026-10-24T04:00:00.000Z",
    phase: "exit",
    pickupImpactLevel: "very_high",
    dropoffImpactLevel: "high",
    ...overrides,
  };
}

function zone(overrides: Partial<PricingEventZone> = {}): PricingEventZone {
  return {
    id: "zone-1",
    eventId: "evt-1",
    zoneType: "location_slug",
    locationSlug: "amsterdam",
    gemeenteNaam: null,
    locality: null,
    postcode4: null,
    direction: "both",
    impactOverride: null,
    ...overrides,
  };
}

function set(overrides: Partial<EventDataSet> = {}): EventDataSet {
  return { events: [event()], windows: [window()], zones: [zone()], ...overrides };
}

function rules(data: EventDataSet): string[] {
  return eventDataErrors(validateEventData(data)).map((i) => i.rule);
}

// ── De twaalf regels ─────────────────────────────────────────────────────────

test("een correcte dataset levert geen enkele fout op", () => {
  assert.deepEqual(validateEventData(set()), []);
});

test("1. confirmed zonder source_url → fout", () => {
  assert.ok(rules(set({ events: [event({ sourceUrl: null })] })).includes("confirmed_without_source"));
  assert.ok(rules(set({ events: [event({ sourceUrl: "   " })] })).includes("confirmed_without_source"));
});

test("2. vrijgegeven zonder venster → fout", () => {
  const data = set({ events: [event({ status: "confirmed", pricingEnabled: true })], windows: [] });
  assert.ok(rules(data).includes("enabled_without_window"));
});

test("3. vrijgegeven zonder zone → fout", () => {
  const data = set({ events: [event({ pricingEnabled: true })], zones: [] });
  assert.ok(rules(data).includes("enabled_without_zone"));
});

test("4. ends_at <= starts_at → fout, zowel op het evenement als op het venster", () => {
  assert.ok(
    rules(set({ events: [event({ startsAt: "2026-10-26T03:00:00.000Z", endsAt: "2026-10-21T20:00:00.000Z" })] })).includes(
      "event_span_invalid"
    )
  );
  assert.ok(
    rules(set({ windows: [window({ startsAt: "2026-10-24T04:00:00.000Z", endsAt: "2026-10-24T04:00:00.000Z" })] })).includes(
      "window_span_invalid"
    )
  );
});

test("5. onbekend impactniveau → fout, op venster én zone-override", () => {
  const badWindow = set({ windows: [window({ pickupImpactLevel: "catastrophic" as EventImpactLevel })] });
  assert.ok(rules(badWindow).includes("unknown_impact_level"));
  const badZone = set({ zones: [zone({ impactOverride: "E9" as EventImpactLevel })] });
  assert.ok(rules(badZone).includes("unknown_impact_level"));
});

test("6. ongeldige postcode4 → fout", () => {
  const data = set({ zones: [zone({ zoneType: "postcode4", locationSlug: null, postcode4: 99 })] });
  assert.ok(rules(data).includes("invalid_postcode4"));
});

test("7. zone zonder matcher → fout", () => {
  const data = set({ zones: [zone({ zoneType: "location_slug", locationSlug: null })] });
  assert.ok(rules(data).includes("zone_without_matcher"));
});

test("8. voorlopig evenement mag niet vrijgegeven zijn", () => {
  const data = set({ events: [event({ status: "expected", pricingEnabled: true })] });
  assert.ok(rules(data).includes("provisional_pricing_enabled"));
});

test("9. geannuleerd of afgerond evenement mag niet vrijgegeven zijn", () => {
  assert.ok(rules(set({ events: [event({ status: "cancelled", pricingEnabled: true })] })).includes("inactive_pricing_enabled"));
  assert.ok(rules(set({ events: [event({ status: "completed", pricingEnabled: true })] })).includes("inactive_pricing_enabled"));
  assert.ok(
    rules(set({ events: [event({ status: "verification_required", pricingEnabled: true })] })).includes(
      "unverified_pricing_enabled"
    )
  );
});

test("10. dubbele slug → fout", () => {
  const data = set({ events: [event(), event({ id: "evt-2", slug: "ADE-2026" })] });
  assert.ok(rules(data).includes("duplicate_slug"));
});

test("11. overlappende vensters met identieke niveaus → waarschuwing, geen fout", () => {
  const data = set({
    windows: [window(), window({ id: "win-2", startsAt: "2026-10-23T22:00:00.000Z", endsAt: "2026-10-24T02:00:00.000Z" })],
  });
  const issues = validateEventData(data);
  assert.equal(eventDataErrors(issues).length, 0);
  assert.ok(issues.some((i) => i.rule === "duplicate_overlapping_window" && i.severity === "warning"));
});

test("11b. overlappende vensters met VERSCHILLENDE niveaus zijn legitiem", () => {
  const data = set({
    windows: [
      window(),
      window({ id: "win-2", startsAt: "2026-10-23T22:00:00.000Z", endsAt: "2026-10-24T02:00:00.000Z", pickupImpactLevel: "extreme" }),
    ],
  });
  assert.deepEqual(validateEventData(data), []);
});

test("12. evenement waarvan alle vensters vóór het startpunt liggen → fout", () => {
  const data = set({
    events: [event({ slug: "lowlands-2026", startsAt: "2026-08-20T06:00:00.000Z", endsAt: "2026-08-24T12:00:00.000Z" })],
    windows: [window({ startsAt: "2026-08-20T06:00:00.000Z", endsAt: "2026-08-24T12:00:00.000Z" })],
  });
  assert.ok(rules(data).includes("all_windows_before_cutoff"));
});

test("een venster dat aan beide kanten 'none' is, is dode data (waarschuwing)", () => {
  const data = set({ windows: [window({ pickupImpactLevel: "none", dropoffImpactLevel: "none" })] });
  const issues = validateEventData(data);
  assert.equal(eventDataErrors(issues).length, 0);
  assert.ok(issues.some((i) => i.rule === "window_without_effect"));
});

// ── De echte seed-migratie ───────────────────────────────────────────────────

const SEED_PATH = resolve(process.cwd(), "supabase/migrations/20260828120000_pricing_events_seed_v2.sql");
const SEED_SQL = readFileSync(SEED_PATH, "utf8");

/** Vensters uit het `values`-blok: (slug, start, eind, fase, pickup, dropoff). */
function parseWindows(): PricingEventWindow[] {
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

/**
 * Zones uit de uniforme values-tabel: (evenement, matchertype, waarde,
 * richting, override). Eén vorm voor alle zonesoorten, dus één regex.
 */
function parseZones(): PricingEventZone[] {
  const re =
    /\('([a-z0-9-]+)', '(location_slug|postcode4|locality|gemeente)', '([^']*)', '(pickup|dropoff|both)', '([a-z_]*)'\)/g;
  const out: PricingEventZone[] = [];
  for (const m of SEED_SQL.matchAll(re)) {
    const [, eventSlug, zoneType, value, direction, override] = m;
    out.push({
      id: `${eventSlug}-${zoneType}-${value}`,
      eventId: eventSlug!,
      zoneType: zoneType as PricingEventZone["zoneType"],
      locationSlug: zoneType === "location_slug" ? value! : null,
      gemeenteNaam: zoneType === "gemeente" ? value! : null,
      locality: zoneType === "locality" ? value! : null,
      postcode4: zoneType === "postcode4" ? Number(value) : null,
      direction: direction as PricingEventZone["direction"],
      impactOverride: override ? (override as PricingEventZone["impactOverride"]) : null,
    });
  }
  return out;
}

/**
 * Evenementen uit het insert-blok. De SQL wordt eerst genormaliseerd tot één
 * regel, zodat de test niet breekt op een andere regelafbreking in het bestand.
 */
function parseEvents(): PricingEvent[] {
  const flat = SEED_SQL.replace(/\s+/g, " ");
  const re =
    /\( '([a-z0-9-]+)', '([^']+)', '(\w+)', '([^']+)', (?:null|'[^']*'), '([^']+)', '([^']+)', '(\w+)', (?:null|\d+), (null|'[^']+'), (null|'[^']+'), '(\w+)', (\d+), '(\w+)', '([^']+)', (true|false), (true|false) \)/g;
  const out: PricingEvent[] = [];
  for (const m of flat.matchAll(re)) {
    out.push({
      ...event(),
      id: m[1]!,
      slug: m[1]!,
      name: m[2]!,
      category: m[3] as PricingEvent["category"],
      city: m[4]!,
      startsAt: m[5]!,
      endsAt: m[6]!,
      status: m[7] as PricingEvent["status"],
      sourceUrl: m[8] === "null" ? null : m[8]!.slice(1, -1),
      sourceName: m[9] === "null" ? null : m[9]!.slice(1, -1),
      sourceType: m[10] as PricingEvent["sourceType"],
      sourcePriority: Number(m[11]),
      verificationStatus: m[12] as PricingEvent["verificationStatus"],
      lastVerifiedAt: m[13]!,
      requiresAnnualConfirmation: m[14] === "true",
      pricingEnabled: m[15] === "true",
    });
  }
  return out;
}

test("seed: alle elf evenementen worden herkend en zijn bevestigd met bron", () => {
  const events = parseEvents();
  assert.equal(events.length, 11);
  assert.deepEqual(
    events.map((e) => e.slug).sort(),
    [
      "ade-2026",
      "amsterdam-marathon-2026",
      "amsterdam-marathon-2027",
      "defqon1-2027",
      "koningsdag-2027",
      "lowlands-2027",
      "north-sea-jazz-2027",
      "oud-en-nieuw-2026",
      "oud-en-nieuw-2027",
      "pinkpop-2027",
      "zwarte-cross-2027",
    ]
  );
  for (const e of events) {
    assert.equal(e.status, "confirmed", `${e.slug} moet bevestigd zijn`);
    assert.ok(e.sourceUrl?.startsWith("https://"), `${e.slug} mist een bron-URL`);
    assert.ok(e.sourceName, `${e.slug} mist een bronnaam`);
  }
});

test("seed: geen enkel evenement wordt vrijgegeven — activeren is een aparte handeling", () => {
  for (const e of parseEvents()) {
    assert.equal(e.pricingEnabled, false, `${e.slug} mag niet vrijgegeven zijn in de seed`);
  }
  // En de kill switch wordt hier niet omgezet (alleen genoemd in het commentaar).
  const executable = SEED_SQL.split("commit;")[0]!;
  assert.ok(!/update\s+public\.pricing_event_config/.test(executable));
});

test("seed: de volledige dataset doorstaat de validator zonder fouten", () => {
  const data: EventDataSet = { events: parseEvents(), windows: parseWindows(), zones: parseZones() };
  assert.ok(data.windows.length >= 30, `verwachtte alle vensters, kreeg ${data.windows.length}`);
  assert.ok(data.zones.length >= 150, `verwachtte alle zones, kreeg ${data.zones.length}`);
  const issues = validateEventData(data, {
    seedCutoff: new Date(SEED_CUTOFF_ISO),
    now: new Date("2026-08-28T00:00:00.000Z"),
  });
  assert.deepEqual(eventDataErrors(issues), []);
});

test("seed: elk evenement heeft ten minste één venster én één zone", () => {
  const events = parseEvents();
  const windows = parseWindows();
  const zones = parseZones();
  for (const e of events) {
    assert.ok(windows.some((w) => w.eventId === e.slug), `${e.slug} heeft geen venster`);
    assert.ok(zones.some((z) => z.eventId === e.slug), `${e.slug} heeft geen zone`);
  }
});

test("seed: elk venster ligt ná het operationele startpunt", () => {
  const cutoff = Date.parse(SEED_CUTOFF_ISO);
  for (const w of parseWindows()) {
    assert.ok(Date.parse(w.endsAt) > cutoff, `${w.eventId}: venster ligt volledig in het verleden`);
  }
});

test("seed: geen enkele zone gebruikt gemeente-matching (niet betrouwbaar bij vaste routes)", () => {
  assert.ok(!parseZones().some((z) => z.zoneType === "gemeente"));
});

test("seed: het landelijke Bevrijdingsdag-record uit V1 is verdwenen", () => {
  assert.ok(!parseEvents().some((e) => e.slug === "bevrijdingsdag-2027"));
  // En de migratie ruimt het actief op, maar alleen als niemand het vrijgaf.
  assert.ok(SEED_SQL.includes("where slug = 'bevrijdingsdag-2027' and pricing_enabled = false"));
});

test("seed: venue-evenementen gebruiken postcode4, nooit een hele stad", () => {
  const zones = parseZones();
  const nsj = zones.filter((z) => z.eventId === "north-sea-jazz-2027");
  assert.deepEqual(nsj.map((z) => z.zoneType), ["postcode4"]);
  assert.deepEqual(nsj.map((z) => z.postcode4), [3084]);
  // De marathon is nu postcode-gebaseerd in plaats van stadsbreed.
  const marathon = zones.filter((z) => z.eventId === "amsterdam-marathon-2026");
  assert.ok(marathon.length > 0);
  assert.ok(marathon.every((z) => z.zoneType === "postcode4"));
  assert.ok(!marathon.some((z) => z.locationSlug === "amsterdam"));
});

test("seed: locality wordt alleen gebruikt voor kleine plaatsen, niet voor grote steden", () => {
  const localities = parseZones()
    .filter((z) => z.zoneType === "locality")
    .map((z) => z.locality);
  assert.deepEqual([...new Set(localities)].sort(), ["biddinghuizen", "landgraaf", "lichtenvoorde"]);
});

test("seed: alleen Amsterdam krijgt een zwaarder Koningsdag-niveau", () => {
  const kd = parseZones().filter((z) => z.eventId === "koningsdag-2027");
  const overridden = kd.filter((z) => z.impactOverride !== null);
  assert.ok(overridden.length > 0);
  assert.ok(overridden.every((z) => z.locationSlug?.startsWith("amsterdam")));
  assert.ok(overridden.every((z) => z.impactOverride === "very_high"));
});
