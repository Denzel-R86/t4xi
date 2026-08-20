import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchSchipholRoute,
  buildBookingHref,
  routeSummary,
  buildQuoteRequestText,
  buildWhatsappHref,
  formatDuration,
  isRouteFinderDetailsComplete,
  resolveRouteFinderView,
  type RouteFinderTrip,
} from "./route-finder";

test("matchSchipholRoute herkent de vijf steden, ook met wijk/plaatsdetails", () => {
  assert.equal(matchSchipholRoute("Amsterdam Centrum")?.slug, "taxi-amsterdam-schiphol");
  assert.equal(matchSchipholRoute("Gustav Mahlerlaan 10, 1082 Amsterdam")?.naam, "Amsterdam");
  assert.equal(matchSchipholRoute("Almere Poort")?.slug, "taxi-almere-schiphol");
  assert.equal(matchSchipholRoute("Den Haag centrum")?.slug, "taxi-den-haag-schiphol");
  assert.equal(matchSchipholRoute("'s-Gravenhage")?.slug, "taxi-den-haag-schiphol");
  assert.equal(matchSchipholRoute("Utrecht CS")?.naam, "Utrecht");
});

test("matchSchipholRoute geeft null voor onbekende plaatsen", () => {
  assert.equal(matchSchipholRoute("Groningen"), null);
  assert.equal(matchSchipholRoute(""), null);
});

test("buildBookingHref codeert en laat standaardwaarden weg", () => {
  const href = buildBookingHref({ pickup: "Amsterdam Centrum", dropoff: "Schiphol" });
  assert.match(href, /^\/boeken\?/);
  assert.ok(href.includes("pickup=Amsterdam+Centrum") || href.includes("pickup=Amsterdam%20Centrum"));
  assert.ok(!href.includes("retour="));
  assert.ok(!href.includes("persons="));
});

test("buildBookingHref voegt retour en passagiers toe wanneer relevant", () => {
  const href = buildBookingHref({
    pickup: "A",
    dropoff: "B",
    returnTrip: true,
    passengers: 3,
    date: "2026-09-18",
    time: "09:30",
    returnDate: "2026-09-20",
    returnTime: "18:45",
    luggage: "1-2-koffers",
  });
  assert.ok(href.includes("retour=1"));
  assert.ok(href.includes("persons=3"));
  assert.ok(href.includes("date=2026-09-18"));
  assert.ok(href.includes("time=09%3A30"));
  assert.ok(href.includes("returnDate=2026-09-20"));
  assert.ok(href.includes("returnTime=18%3A45"));
  assert.ok(href.includes("luggage=1-2-koffers"));
});

test("buildBookingHref laat persons weg bij 1 passagier", () => {
  const href = buildBookingHref({ pickup: "A", dropoff: "B", passengers: 1 });
  assert.ok(!href.includes("persons="));
});

test("buildBookingHref neemt alleen een server-geldige bindende bagagekeuze mee", () => {
  assert.ok(buildBookingHref({ pickup: "A", dropoff: "B", luggage: "handbagage" }).includes("luggage=handbagage"));
  assert.ok(buildBookingHref({ pickup: "A", dropoff: "B", luggage: "  HANDBAGAGE " }).includes("luggage=handbagage"));
  assert.ok(!buildBookingHref({ pickup: "A", dropoff: "B", luggage: "onbekend" }).includes("luggage="));
  assert.ok(!buildBookingHref({ pickup: "A", dropoff: "B", luggage: "overleg" }).includes("luggage="));
});

test("routeSummary toont tussenstops in volgorde en negeert lege delen", () => {
  assert.equal(
    routeSummary("Amsterdam", [{ label: "Haarlem", waitRequested: false }], "Schiphol"),
    "Amsterdam → Haarlem → Schiphol"
  );
  assert.equal(routeSummary("Amsterdam", [], "Schiphol"), "Amsterdam → Schiphol");
});

test("buildQuoteRequestText bevat route, type, passagiers en bagage", () => {
  const trip: RouteFinderTrip = {
    pickup: "Amsterdam",
    dropoff: "Schiphol",
    stops: [{ label: "Haarlem", waitRequested: true }],
    returnTrip: true,
    passengers: 2,
    luggage: "Handbagage",
    date: "2026-08-10",
    time: "08:00",
    returnDate: "2026-08-14",
    returnTime: "18:00",
    flightNumber: "KL1234",
  };
  const text = buildQuoteRequestText(trip);
  assert.ok(text.includes("Amsterdam → Haarlem → Schiphol"));
  assert.ok(text.includes("retour"));
  assert.ok(text.includes("Passagiers: 2"));
  assert.ok(text.includes("Bagage: Handbagage"));
  assert.ok(text.includes("KL1234"));
  assert.ok(text.includes("extra wachttijd"));
});

// 2026-08-19 (hotfix): bagage wordt nooit tweemaal gevraagd — één categorie,
// nooit ook nog een aparte koffer-/handbagage-aantal-vraag ernaast.
test("buildQuoteRequestText: bagage-regel ontbreekt zonder gekozen categorie (geen stille default)", () => {
  const trip: RouteFinderTrip = {
    pickup: "Amsterdam",
    dropoff: "Schiphol",
    stops: [],
    returnTrip: false,
    passengers: 1,
    luggage: "",
  };
  const text = buildQuoteRequestText(trip);
  assert.ok(!text.includes("Bagage:"));
});

test("buildWhatsappHref codeert de tekst in de URL", () => {
  const href = buildWhatsappHref("A → B");
  assert.ok(href.startsWith("https://wa.me/31634744522?text="));
  assert.ok(!href.includes(" "));
});

test("formatDuration rekent minuten om naar uren", () => {
  assert.equal(formatDuration(45), "45 min");
  assert.equal(formatDuration(60), "1 u");
  assert.equal(formatDuration(75), "1 u 15 min");
  assert.equal(formatDuration(0), "");
});

// ── 2026-08-19 (hotfix): datum/tijd/bagage verplicht vóór een quote-call ────
// (regressie: RouteFinder gaf voorheen geen luggage door aan useRouteQuote,
// waardoor elke route "op aanvraag" toonde — ook routes met een bestaande
// vaste prijs, bv. 1361BP Almere → Schiphol).

test("isRouteFinderDetailsComplete: alle drie verplicht, geen enkele stille default", () => {
  assert.equal(isRouteFinderDetailsComplete("", "", ""), false, "niets ingevuld");
  assert.equal(isRouteFinderDetailsComplete("2026-09-01", "", ""), false, "alleen datum");
  assert.equal(isRouteFinderDetailsComplete("2026-09-01", "10:00", ""), false, "datum+tijd, geen bagage — de exacte regressie van deze hotfix");
  assert.equal(isRouteFinderDetailsComplete("", "10:00", "handbagage"), false, "geen datum");
  assert.equal(isRouteFinderDetailsComplete("2026-09-01", "", "handbagage"), false, "geen tijd");
  assert.equal(isRouteFinderDetailsComplete("2026-09-01", "10:00", "handbagage"), true, "alle drie compleet");
});

test("isRouteFinderDetailsComplete: 'geen-bagage' is een geldige, bewuste keuze — telt als compleet", () => {
  assert.equal(isRouteFinderDetailsComplete("2026-09-01", "10:00", "geen-bagage"), true);
});

test("isRouteFinderDetailsComplete: bij RETOUR zijn retourdatum én -tijd óók verplicht", () => {
  const d = "2026-09-01", t = "10:00", l = "handbagage";
  // Enkele reis: retourvelden doen niet mee.
  assert.equal(isRouteFinderDetailsComplete(d, t, l, false, "", ""), true, "enkele reis is compleet zonder retourmoment");
  // Retour: zonder retourdatum en/of -tijd nog niet compleet.
  assert.equal(isRouteFinderDetailsComplete(d, t, l, true, "", ""), false, "retour zonder retourdatum én -tijd");
  assert.equal(isRouteFinderDetailsComplete(d, t, l, true, "2026-09-05", ""), false, "retour zonder retourtijd");
  assert.equal(isRouteFinderDetailsComplete(d, t, l, true, "", "18:00"), false, "retour zonder retourdatum");
  assert.equal(isRouteFinderDetailsComplete(d, t, l, true, "2026-09-05", "18:00"), true, "retour volledig ingevuld");
  // De heenreis-eisen blijven onverkort gelden bij retour.
  assert.equal(isRouteFinderDetailsComplete(d, t, "", true, "2026-09-05", "18:00"), false, "retour compleet maar geen bagage");
});

test("RouteFinder geeft returnTrip/returnDate/returnTime door aan de volledigheidscheck", () => {
  const src = readFileSync(resolve(process.cwd(), "components/tarieven/RouteFinder.tsx"), "utf8");
  assert.match(
    src,
    /isRouteFinderDetailsComplete\(date,\s*time,\s*luggage,\s*returnTrip,\s*returnDate,\s*returnTime\)/,
    "de retourvelden worden niet meegegeven — retour zou dan zonder retourmoment een prijs kunnen opleveren"
  );
});

test("resolveRouteFinderView: niet ingediend of onvolledige adressen → hidden", () => {
  const base = { hasPickup: true, hasDropoff: true, detailsComplete: true, quoteStatus: "ready" as const, hasStops: false };
  assert.equal(resolveRouteFinderView({ ...base, submitted: false }), "hidden");
  assert.equal(resolveRouteFinderView({ ...base, submitted: true, hasPickup: false }), "hidden");
  assert.equal(resolveRouteFinderView({ ...base, submitted: true, hasDropoff: false }), "hidden");
});

test("resolveRouteFinderView: adressen compleet maar datum/tijd/bagage niet → incomplete, NOOIT prijs of offerte-op-aanvraag", () => {
  const base = { submitted: true, hasPickup: true, hasDropoff: true, hasStops: false };
  // Zelfs een toevallig 'ready'/'onrequest' quoteStatus mag nooit doorlekken vóór complete invoer.
  assert.equal(resolveRouteFinderView({ ...base, detailsComplete: false, quoteStatus: "ready" }), "incomplete");
  assert.equal(resolveRouteFinderView({ ...base, detailsComplete: false, quoteStatus: "onrequest" }), "incomplete");
  assert.equal(resolveRouteFinderView({ ...base, detailsComplete: false, quoteStatus: "idle" }), "incomplete");
  assert.equal(resolveRouteFinderView({ ...base, detailsComplete: false, quoteStatus: "loading" }), "incomplete");
});

test("resolveRouteFinderView: complete invoer → normale statusafleiding (loading/ready/onrequest)", () => {
  const base = { submitted: true, hasPickup: true, hasDropoff: true, detailsComplete: true };
  assert.equal(resolveRouteFinderView({ ...base, quoteStatus: "loading", hasStops: false }), "loading");
  assert.equal(resolveRouteFinderView({ ...base, quoteStatus: "ready", hasStops: false }), "ready");
  assert.equal(resolveRouteFinderView({ ...base, quoteStatus: "ready", hasStops: true }), "onrequest", "tussenstops kennen nog geen automatisch tarief");
  assert.equal(resolveRouteFinderView({ ...base, quoteStatus: "onrequest", hasStops: false }), "onrequest");
  assert.equal(resolveRouteFinderView({ ...base, quoteStatus: "error", hasStops: false }), "error");
});

// ── Structurele controle: alle drie useRouteQuote-consumenten ───────────────
// geven nu expliciet een geldige bagagecategorie door, of vereisen (via
// `ready`) een bewuste keuze vóór de fetch — geen enkele blijft op de oude,
// impliciete lege-string-default hangen die deze regressie veroorzaakte.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { classifyLuggage } from "@/lib/pricing/luggage";

test("RouteFinder's bagagecategorieën zijn stuk voor stuk server-geldig (classifyLuggage → nooit 'invalid')", () => {
  const src = readFileSync(resolve(process.cwd(), "components/tarieven/RouteFinder.tsx"), "utf8");
  const match = src.match(/const LUGGAGE_CATEGORIES = \[([\s\S]*?)\] as const;/);
  assert.ok(match, "LUGGAGE_CATEGORIES niet gevonden in RouteFinder.tsx");
  const values = [...match![1].matchAll(/value:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(values.length >= 4, "verwacht minimaal dezelfde categorieën als hero/boeken");
  for (const value of values) {
    assert.notEqual(classifyLuggage(value).kind, "invalid", `'${value}' moet een server-geldige bagagecategorie zijn`);
  }
  // "Geen bagage" moet expliciet aanwezig zijn (verplicht per opdracht).
  assert.ok(values.includes("geen-bagage"), "'geen-bagage' ontbreekt als optie");
});

test("alle drie useRouteQuote-aanroepen geven 'luggage' door — geen enkele op de stille lege-string-default", () => {
  const consumers = [
    "components/tarieven/RouteFinder.tsx",
    "components/booking/BookingSection.tsx",
    "components/horizon/patterns.tsx",
  ];
  for (const file of consumers) {
    const src = readFileSync(resolve(process.cwd(), file), "utf8");
    const call = src.match(/useRouteQuote\(\s*pickup\s*,\s*dropoff\s*,\s*\{[^}]*\}/);
    assert.ok(call, `${file}: geen useRouteQuote(pickup, dropoff, {...})-aanroep gevonden`);
    assert.match(call![0], /luggage\s*[,:]/, `${file}: useRouteQuote-aanroep geeft geen 'luggage' door`);
  }
});

test("RouteFinder geeft de gevalideerde bagagekeuze door aan de boekings-deep-link", () => {
  const src = readFileSync(resolve(process.cwd(), "components/tarieven/RouteFinder.tsx"), "utf8");
  assert.match(
    src,
    /bookingHref=\{buildBookingHref\(\{[\s\S]*?\bluggage,\s*[\s\S]*?\}\)\}/,
  );
});

// ── 2026-08-19 (hotfix, herzien): bagage werd tweemaal gevraagd (de bewuste ──
// categorie ÉN aparte, losstaande koffer-/handbagage-aantallen, plus een
// hardcoded "2 grote koffers en 2 stuks handbagage"-vermelding in de
// resultaatkaart die niets met de echte keuze te maken had) — en datum, tijd,
// ritsoort en passagiers stonden nog achter een "+"-toggle. Alles staat nu
// direct zichtbaar; de ENIGE resterende "+"-stap is tussenstops.

test("RouteFinder: datum, tijd, ritsoort en passagiers staan alle in de ALTIJD-zichtbare zoekmodule", () => {
  const src = readFileSync(resolve(process.cwd(), "components/tarieven/RouteFinder.tsx"), "utf8");
  const primaryModuleEnd = src.indexOf("Tussenstops — subtiel uitklapbaar");
  assert.ok(primaryModuleEnd > 0, "kon de zoekmodule niet afbakenen");
  const primaryModule = src.slice(0, primaryModuleEnd);
  assert.match(primaryModule, /\$\{ids\}-date`/, "datumveld ontbreekt in de altijd-zichtbare zoekmodule");
  assert.match(primaryModule, /\$\{ids\}-time`/, "tijdveld ontbreekt in de altijd-zichtbare zoekmodule");
  assert.match(primaryModule, /\$\{ids\}-luggage-primary`/, "bagageveld ontbreekt in de altijd-zichtbare zoekmodule");
  assert.match(primaryModule, /t\("ritType"\)/, "ritsoort (enkel/retour) ontbreekt in de altijd-zichtbare zoekmodule");
  assert.match(primaryModule, /\$\{ids\}-pax`/, "passagiersveld ontbreekt in de altijd-zichtbare zoekmodule");
});

test("RouteFinder: de ENIGE resterende '+'-stap is tussenstops — geen showDetails-toggle meer", () => {
  const src = readFileSync(resolve(process.cwd(), "components/tarieven/RouteFinder.tsx"), "utf8");
  assert.doesNotMatch(src, /showDetails/, "de showDetails-toggle bestaat nog");
  assert.doesNotMatch(src, /actieDetails/, "de 'Retour & passagiers'-toggleknop bestaat nog");
  // Exact één progressieve toggle-knop in de zoekmodule: tussenstops.
  assert.match(src, /t\("actieTussenstop"\)/, "de tussenstop-toggle ontbreekt");
});

test("RouteFinder: bagage wordt nergens meer een tweede keer gevraagd (geen losse koffer-/handbagage-aantallen, geen hardcoded capaciteitstekst)", () => {
  const src = readFileSync(resolve(process.cwd(), "components/tarieven/RouteFinder.tsx"), "utf8");
  assert.doesNotMatch(src, /bigLuggage|handLuggage/, "de oude, losstaande koffer-/handbagage-AANTAL-velden bestaan nog");
  assert.doesNotMatch(src, /bagageCapaciteit/, "de hardcoded '2 grote koffers en 2 stuks handbagage'-vermelding bestaat nog");
  // Precies één plek die de bagagecategorie-select rendert.
  const selectMatches = [...src.matchAll(/LUGGAGE_CATEGORIES\.map/g)];
  assert.equal(selectMatches.length, 1, "de bagagecategorieën worden op meer dan één plek gerenderd");
});

test("ResultCard's bagage-fact toont het daadwerkelijk gekozen label, geen generieke placeholder-tekst", () => {
  const src = readFileSync(resolve(process.cwd(), "components/tarieven/RouteFinder.tsx"), "utf8");
  assert.match(src, /value:\s*luggageLabel\s*\|\|\s*"—"/, "de bagage-fact leest niet uit de daadwerkelijke keuze (luggageLabel)");
});
