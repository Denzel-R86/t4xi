/**
 * Tests voor de lokale locatiedataset (vliegvelden + populaire bestemmingen)
 * en de bijbehorende zoekfunctie. Dekt naam-, alias-, plaats- en adresmatch,
 * plus de expliciet gevraagde voorbeeldopdrachten.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  airports,
  popularDestinations,
  localLocations,
  searchLocalLocations,
  normalizeSearchValue,
} from "./local-locations";
import { nsStations } from "./ns-stations";

function firstId(query: string): string | undefined {
  return searchLocalLocations(query)[0]?.id;
}

function ids(query: string): string[] {
  return searchLocalLocations(query, 10).map((l) => l.id);
}

// ── Basisdataset ─────────────────────────────────────────────────────────────

test("combineert vliegvelden, populaire bestemmingen en treinstations zonder overlap", () => {
  assert.equal(localLocations.length, airports.length + popularDestinations.length + nsStations.length);
  const idSet = new Set(localLocations.map((l) => l.id));
  assert.equal(idSet.size, localLocations.length, "alle id's moeten uniek zijn");
});

test("alle NS-stations uit de rijdendetreinen.nl-dataset zijn geladen (397 min. 1 bewust uitgesloten dubbel met Schiphol-luchthaven)", () => {
  assert.equal(nsStations.length, 396);
  for (const station of nsStations) {
    assert.equal(station.type, "popular_destination");
    assert.equal(station.category, "station");
    assert.ok(station.city, `${station.id}: mist city`);
  }
});

test("het NS-station 'Schiphol Airport' (SHL) is bewust uitgesloten — 'schip' moet de luchthaven blijven vinden", () => {
  assert.ok(!nsStations.some((s) => s.id === "station-shl"));
  assert.equal(firstId("schip"), "airport-ams");
});

test("elke locatie heeft geldige WGS84-coördinaten binnen een plausibel bereik", () => {
  for (const loc of localLocations) {
    assert.ok(loc.latitude > -90 && loc.latitude < 90, `${loc.id}: latitude buiten bereik`);
    assert.ok(loc.longitude > -180 && loc.longitude < 180, `${loc.id}: longitude buiten bereik`);
    // Alle locaties liggen in West-Europa: grove sanity-check tegen verwisselde
    // lat/long (bv. een longitude van 52 zou hier meteen opvallen).
    assert.ok(loc.latitude > 49 && loc.latitude < 54, `${loc.id}: latitude niet in West-Europa`);
    assert.ok(loc.longitude > -1 && loc.longitude < 10, `${loc.id}: longitude niet in West-Europa`);
  }
});

test("normalizeSearchValue is case- en accent-insensitive", () => {
  assert.equal(normalizeSearchValue("Düsseldorf"), "dusseldorf");
  assert.equal(normalizeSearchValue("ARENA"), "arena");
  assert.equal(normalizeSearchValue("A'DAM Lookout"), "adam lookout");
});

// ── Naam / alias / plaats / adres ───────────────────────────────────────────

test("matcht op naam", () => {
  assert.equal(firstId("Efteling"), "efteling");
  assert.equal(firstId("keukenhof"), "keukenhof");
});

test("matcht op alias", () => {
  assert.equal(firstId("hmh"), "afas-live");
  assert.equal(firstId("zestienhoven"), "airport-rtm");
  assert.equal(firstId("tulpen"), "keukenhof");
});

test("matcht op plaatsnaam", () => {
  assert.ok(ids("kaatsheuvel").includes("efteling"));
  assert.ok(ids("zandvoort").includes("circuit-zandvoort"));
});

test("matcht op adres", () => {
  assert.ok(ids("europalaan").includes("efteling"));
});

// ── NS-stations ──────────────────────────────────────────────────────────────

test("Amsterdam Amstel is vindbaar op naam, kort en met 'station' erbij", () => {
  assert.equal(firstId("Amsterdam Amstel"), "station-asa");
  assert.equal(firstId("amstel"), "station-asa");
  assert.equal(firstId("amsterdam amstel station"), "station-asa");
});

test("Amsterdam Centraal komt maar één keer terug (geen dubbel met de oude losse entry)", () => {
  const found = ids("amsterdam centraal");
  const occurrences = found.filter((id) => id === "station-asd").length;
  assert.equal(occurrences, 1);
  assert.equal(firstId("amsterdam cs"), "station-asd");
});

test("willekeurige stations zijn vindbaar op naam en op 'station <naam>'", () => {
  assert.equal(firstId("Utrecht Centraal"), "station-ut");
  assert.equal(firstId("Rotterdam Centraal"), "station-rtd");
  assert.equal(firstId("Den Haag Centraal"), "station-gvc");
  assert.equal(firstId("Zwolle"), "station-zl");
  assert.equal(firstId("station Sloterdijk"), "station-ass");
  assert.equal(firstId("Duivendrecht station"), "station-dvd");
});

test("stationscode alleen botst niet met een luchthaven-IATA-code (bv. OST = Olst-station vs. Ostend-Airport)", () => {
  assert.equal(firstId("OST"), "airport-ost", "IATA-exact moet blijven winnen op een losse 3-letterige code");
  assert.ok(ids("olst").includes("station-ost"));
});

// ── Expliciete testgevallen uit de opdracht ─────────────────────────────────

test("vliegveld-zoekopdrachten", () => {
  assert.equal(firstId("AMS"), "airport-ams");
  assert.equal(firstId("schip"), "airport-ams");
  assert.equal(firstId("vliegveld amsterdam"), "airport-ams");
  assert.equal(firstId("ein"), "airport-ein");
  assert.equal(firstId("zestienhoven"), "airport-rtm");
  assert.equal(firstId("weeze"), "airport-nrn");
  assert.equal(firstId("NRN"), "airport-nrn");
  assert.ok(ids("dusseldorf").includes("airport-dus"));
  assert.equal(firstId("zaventem"), "airport-bru");
  assert.equal(firstId("charleroi"), "airport-crl");
  assert.equal(firstId("luik"), "airport-lgg");
});

test("een losse driletterige zoekterm wint als IATA-code, maar 'dam' wordt niet gekaapt", () => {
  assert.equal(firstId("EIN"), "airport-ein");
  // "dam" is zelf geen IATA-code in de dataset — moet gewoon op naam matchen.
  assert.equal(firstId("dam"), "dam-amsterdam");
});

test("populaire-bestemmingen-zoekopdrachten", () => {
  assert.equal(firstId("efteling"), "efteling");
  assert.equal(firstId("tulpen"), "keukenhof");
  assert.equal(firstId("ajax"), "johan-cruijff-arena");
  assert.equal(firstId("arena"), "johan-cruijff-arena");
  assert.equal(firstId("cruise rotterdam"), "cruise-terminal-rotterdam");
  assert.equal(firstId("newcastle ferry"), "dfds-ijmuiden");
  assert.equal(firstId("windmolens"), "zaanse-schans");
  assert.equal(firstId("pretpark kaatsheuvel"), "efteling");
  assert.equal(firstId("panda"), "ouwehands-dierenpark");
  assert.equal(firstId("f1"), "circuit-zandvoort");
  assert.equal(firstId("cruise amsterdam"), "passenger-terminal-amsterdam");
});

test("museumplein levert Museumplein, Rijksmuseum én Van Gogh Museum", () => {
  const found = ids("museumplein");
  assert.ok(found.includes("museumplein"));
  assert.ok(found.includes("rijksmuseum"));
  assert.ok(found.includes("van-gogh-museum"));
});

test("scheveningen levert De Pier en SEA LIFE", () => {
  const found = ids("scheveningen");
  assert.ok(found.includes("pier-scheveningen"));
  assert.ok(found.includes("sea-life-scheveningen"));
});

test("outlet levert Designer Outlet Roermond en Batavia Stad", () => {
  const found = ids("outlet");
  assert.ok(found.includes("designer-outlet-roermond"));
  assert.ok(found.includes("batavia-stad"));
});

// ── Typefouttolerantie (bij voorkeur) ───────────────────────────────────────

test("kleine typefouten in de naam worden nog gevonden", () => {
  assert.ok(ids("eftling").includes("efteling"));
  assert.ok(ids("keukenhoff").includes("keukenhof"));
});

// ── Geen valse positieven ────────────────────────────────────────────────────

test("een normaal woonadres levert geen lokale match op (blijft aan PDOK over)", () => {
  assert.deepEqual(searchLocalLocations("Keizersgracht 123 Amsterdam"), []);
  assert.deepEqual(searchLocalLocations("Vondelstraat 45"), []);
});

test("elke geselecteerde locatie draagt de verplichte velden", () => {
  for (const loc of localLocations) {
    assert.equal(typeof loc.id, "string");
    assert.equal(typeof loc.name, "string");
    assert.equal(typeof loc.address, "string");
    assert.equal(typeof loc.city, "string");
    assert.equal(typeof loc.country, "string");
    assert.equal(typeof loc.latitude, "number");
    assert.equal(typeof loc.longitude, "number");
    assert.ok(loc.type === "airport" || loc.type === "popular_destination");
    assert.equal(loc.type, loc.category === "airport" ? "airport" : "popular_destination");
  }
});
