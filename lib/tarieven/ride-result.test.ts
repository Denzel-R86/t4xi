import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { euroText, rideBuildUp, routeFinderHandoff, showLegalComparison } from "./ride-result";

/** PR 2.7 — RouteFinder "UW RIT": prijsopbouw, handoff, F-28 en F-17. */

const SERVER = { price: 89, returnApplied: false, distanceKm: 26, estimatedDurationMin: 28 };

test("prijsopbouw: alleen serverwaarden, elke regel noemt zijn serverveld", () => {
  const rows = rideBuildUp(SERVER);
  assert.deepEqual(rows, [
    { kind: "fact", labelKey: "factAfstand", value: "26 km", source: "distanceKm" },
    { kind: "fact", labelKey: "factReistijd", value: "28 min", source: "estimatedDurationMin" },
    { kind: "total", labelKey: "vastEnkel", amount: 89, source: "price" },
  ]);
  // Het totaal is exact de serverprijs — geen afgeleide of herberekende bedragen.
  assert.equal(rows.filter((r) => r.kind === "total").length, 1);
});

test("prijsopbouw: retour volgt returnApplied van de server", () => {
  const total = rideBuildUp({ ...SERVER, price: 170, returnApplied: true }).at(-1);
  assert.deepEqual(total, { kind: "total", labelKey: "vastRetour", amount: 170, source: "price" });
});

test("prijsopbouw: wat de engine niet levert (0) wordt niet verzonnen", () => {
  assert.deepEqual(rideBuildUp({ ...SERVER, distanceKm: 0, estimatedDurationMin: 0 }).map((r) => r.source), ["price"]);
  assert.deepEqual(rideBuildUp({ ...SERVER, price: 0, distanceKm: 0, estimatedDurationMin: 0 }), []);
});

const RIDE = {
  pickup: "Voorbeeldstraat 12, Almere",
  dropoff: "Schiphol",
  date: "2026-11-12",
  time: "14:30",
  passengers: 2,
  luggage: "1-2-koffers",
  returnTrip: false,
  hasStops: false,
  quoteId: "q-123",
};

test("handoff: enkele rit → gevalideerde velden, zonder prijs", () => {
  const ride = routeFinderHandoff(RIDE);
  assert.deepEqual(ride, {
    pickup: RIDE.pickup,
    dropoff: "Schiphol",
    date: RIDE.date,
    time: RIDE.time,
    persons: 2,
    luggage: "1-2-koffers",
    quoteId: "q-123",
  });
  assert.ok(!("price" in (ride as object)));
});

test("handoff: retour en tussenstops passen niet in het formaat → null (deep-link)", () => {
  assert.equal(routeFinderHandoff({ ...RIDE, returnTrip: true }), null);
  assert.equal(routeFinderHandoff({ ...RIDE, hasStops: true }), null);
});

test("handoff: ongeldige invoer → null", () => {
  assert.equal(routeFinderHandoff({ ...RIDE, pickup: undefined }), null);
  assert.equal(routeFinderHandoff({ ...RIDE, date: "12-11-2026" }), null);
  assert.equal(routeFinderHandoff({ ...RIDE, luggage: "" }), null);
  assert.equal(routeFinderHandoff({ ...RIDE, passengers: 5 }), null);
});

/* ── F-28: de voordeelclaim "U betaalt €X minder (Y%)" bestaat nergens meer ── */

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p, ext) : ext.test(name) ? [p] : [];
  });
}

function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (v && typeof v === "object") return Object.values(v).flatMap(strings);
  return [];
}

test("F-28: geen besparingsclaim in NL/EN-messages", () => {
  for (const locale of ["nl", "en"]) {
    const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
    assert.equal(messages.routezoeker.tariefVoordeel, undefined, `${locale}: tariefVoordeel`);
    const claims = strings(messages).filter((s) =>
      /betaalt\s+\{?[^.]*\}?\s*minder|pay\s+\{?[^.]*\}?\s*less|\(\{percentage\}%\)/i.test(s)
    );
    assert.deepEqual(claims, [], `${locale}: besparingsclaim gevonden`);
  }
});

test("F-28: geen component gebruikt de voordeelclaim of -velden", () => {
  const offenders = files("components", /\.tsx?$/).filter((f) =>
    /tariefVoordeel|voordeelInEuro|voordeelPercentage|isVoordeliger/.test(readFileSync(f, "utf8"))
  );
  assert.deepEqual(offenders, []);
});

/* ── Wiring in de RouteFinder ── */

const finder = readFileSync("components/tarieven/RouteFinder.tsx", "utf8");

test("F-17: geprijsde adressen krijgen geen 'Geen adressen gevonden'", () => {
  assert.match(finder, /const pricedRoute = view === "ready";/);
  assert.equal(finder.match(/accepted=\{pricedRoute\}/g)?.length, 2, "ophaal- én bestemmingsveld");
  const ac = readFileSync("components/shared/AddressAutocomplete.tsx", "utf8");
  assert.match(ac, /accepted = false/, "standaard uit: hero en /boeken ongewijzigd");
  assert.match(ac, /status === "empty" && !accepted && t\("leeg"\)/);
});

test("handoff: 'Boek deze rit' schrijft alleen de gevalideerde rit, prijs alleen in het geheugen", () => {
  assert.match(finder, /writeHandoff\(handoffRide\)/);
  assert.match(finder, /rememberShownPrice\(quote\.quoteId, quote\.price/);
  assert.match(finder, /handoffRide \? HANDOFF_HREF : buildBookingHref\(/);
  assert.doesNotMatch(finder, /writeHandoff\(\{[^}]*price/);
});

test("UW RIT: Button v2 primary, JourneyLine, geen serif (§13e/§13f)", () => {
  const card = readFileSync("components/tarieven/RideResult.tsx", "utf8");
  assert.match(card, /<Button href=\{bookingHref\} variant="primary"/);
  assert.equal(card.match(/variant="primary"/g)?.length, 1, "maximaal één primary");
  assert.match(card, /<JourneyLine state=\{journey\}/);
  assert.match(finder, /journey=\{journeyStateFor\(quote, pickup, dropoff\)\}/);
  assert.doesNotMatch(card, /font-display-serif|font-playfair/);
});

/* ── Besluiten eigenaar op #75 ── */

const ROUTEFINDER_FILES = [
  "components/tarieven/RouteFinder.tsx",
  "components/tarieven/RideResult.tsx",
  "components/tarieven/OnRequestCard.tsx",
  "components/tarieven/TariffComparison.tsx",
];

/** Alle routezoeker-teksten die deze componenten echt renderen (via t("…")). */
function usedRouteFinderCopy(locale: string): Record<string, string> {
  const ns = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).routezoeker as Record<string, unknown>;
  const keys = new Set<string>();
  for (const f of ROUTEFINDER_FILES) {
    for (const m of readFileSync(f, "utf8").matchAll(/\bt\(\s*"([A-Za-z0-9_]+)"/g)) keys.add(m[1]);
  }
  // Ook dynamische sleutels uit lijsten ("bewijsVaste", labelKey: "factAfstand", …).
  for (const f of ROUTEFINDER_FILES) {
    for (const m of readFileSync(f, "utf8").matchAll(/"([a-z][A-Za-z0-9]+)"/g)) if (m[1] in ns) keys.add(m[1]);
  }
  for (const m of readFileSync("lib/tarieven/ride-result.ts", "utf8").matchAll(/"([a-z][A-Za-z0-9]+)"/g)) if (m[1] in ns) keys.add(m[1]);
  return Object.fromEntries([...keys].filter((k) => typeof ns[k] === "string").map((k) => [k, ns[k] as string]));
}

const UNCONFIRMED = /Inbegrepen wachttijd|Included waiting time|na de landing|after landing|min inbegrepen|min included|Vluchtmonitoring|Flight monitoring|24\/7/i;

test("§0c: geen wachttijd-, vluchtmonitoring- of 24/7-claim in de RouteFinder of zijn teksten", () => {
  for (const f of ROUTEFINDER_FILES) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /factWachttijd|wachttijdLucht|wachttijdStandaard|bewijsVlucht/, f);
  }
  for (const locale of ["nl", "en"]) {
    const copy = usedRouteFinderCopy(locale);
    assert.ok(copy.trust && copy.boekDezeRit, `${locale}: sleutelverzameling leeg — test kijkt niet echt`);
    const hits = Object.entries(copy).filter(([, v]) => UNCONFIRMED.test(v));
    assert.deepEqual(hits, [], `${locale}: onbevestigde claim`);
    const ns = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).routezoeker;
    for (const k of ["factWachttijd", "wachttijdLucht", "wachttijdStandaard", "bewijsVlucht"]) assert.equal(ns[k], undefined, `${locale}.${k}`);
  }
});

test("vergelijking wettelijk tarief alleen op dezelfde ritbasis: enkele rit wel, retour niet", () => {
  assert.equal(showLegalComparison(SERVER), true);
  assert.equal(showLegalComparison({ ...SERVER, price: 170, returnApplied: true }), false);
  assert.equal(showLegalComparison({ ...SERVER, distanceKm: 0 }), false);
  const card = readFileSync("components/tarieven/RideResult.tsx", "utf8");
  assert.match(card, /\{showLegalComparison\(quote\) && \(\s*<TariffComparison/);
});

test("euroteken en bedrag blijven samen: vaste spatie, nergens een gewone spatie na €", () => {
  assert.equal(euroText("89,00"), "€ 89,00");
  for (const f of ROUTEFINDER_FILES) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, /€ /, `${f}: gewone spatie na €`);
    assert.doesNotMatch(src, /€\$\{/, `${f}: € direct aan een template-waarde zonder vaste spatie`);
  }
  for (const locale of ["nl", "en"]) {
    const hits = Object.entries(usedRouteFinderCopy(locale)).filter(([, v]) => /€ /.test(v));
    assert.deepEqual(hits, [], `${locale}: gewone spatie na € in RouteFinder-tekst`);
  }
});
