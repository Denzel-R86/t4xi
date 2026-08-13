// Regressietests voor de aangescherpte landmark-herkenning (Eindhoven Airport /
// Designer Outlet Roermond) — audit vóór bouwakkoord voor deadhead-activering.
// Elke positieve match vereist een eenduidige combinatie; elke negatieve test
// bewijst dat een breed postcodegebied, een kale stadsnaam of een losse term
// NIET wordt herkend. Alle postcodes zijn PDOK-geverifieerd (2026-08-12).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLocationSlug } from "./location-aliases";
import { classifyDestination } from "./deadhead-shadow";
import { airportContext } from "./service";

// ── Positief: Eindhoven Airport ──────────────────────────────────────────────

test("Eindhoven Airport: exacte postcode 5657EA herkent, ongeacht straatlabel", () => {
  assert.equal(resolveLocationSlug("Luchthavenweg 25, 5657EA Eindhoven"), "eindhoven-airport");
  assert.equal(resolveLocationSlug("Eindhoven Airport 29, 5657EA Eindhoven"), "eindhoven-airport");
});

test("Eindhoven Airport: huisnummerbewuste straatmatch + stad/postcode-context", () => {
  assert.equal(resolveLocationSlug("Luchthavenweg 25, Eindhoven"), "eindhoven-airport");
  assert.equal(resolveLocationSlug("Luchthavenweg 25-011, Eindhoven"), "eindhoven-airport");
  assert.equal(resolveLocationSlug("Luchthavenweg 25, 5657EA"), "eindhoven-airport");
});

test("Eindhoven Airport: eenduidige naamvarianten", () => {
  assert.equal(resolveLocationSlug("Eindhoven Airport"), "eindhoven-airport");
  assert.equal(resolveLocationSlug("Eindhoven-Airport"), "eindhoven-airport");
  assert.equal(resolveLocationSlug("eindhoven airport, vertrekhal"), "eindhoven-airport");
});

// ── Positief: Designer Outlet Roermond ───────────────────────────────────────

test("Designer Outlet Roermond: exacte postcode 6041TD herkent", () => {
  assert.equal(resolveLocationSlug("Stadsweide 2, 6041TD Roermond"), "designer-outlet-roermond");
  assert.equal(resolveLocationSlug("Stadsweide 2A, 6041TD Roermond"), "designer-outlet-roermond");
});

test("Designer Outlet Roermond: huisnummerbewuste straatmatch + stad/postcode-context", () => {
  assert.equal(resolveLocationSlug("Stadsweide 2, Roermond"), "designer-outlet-roermond");
  assert.equal(resolveLocationSlug("Stadsweide 2A, Roermond"), "designer-outlet-roermond");
  assert.equal(resolveLocationSlug("Stadsweide 2, 6041TD"), "designer-outlet-roermond");
});

test("Designer Outlet Roermond: eenduidige naamvarianten", () => {
  assert.equal(resolveLocationSlug("Designer Outlet Roermond"), "designer-outlet-roermond");
  assert.equal(resolveLocationSlug("McArthurGlen Designer Outlet Roermond"), "designer-outlet-roermond");
  assert.equal(resolveLocationSlug("McArthurGlen, Roermond"), "designer-outlet-roermond");
});

// ── Negatief: breed postcodegebied ≠ het specifieke gebouw ──────────────────

test("Eindhoven Airport: buurpostcode binnen dezelfde 4-cijferige prefix matcht NIET", () => {
  // 5657EB = Luchthavenweg zelf, maar een ander postcodesegment dan 5657EA.
  assert.notEqual(resolveLocationSlug("Luchthavenweg 1, 5657EB Eindhoven"), "eindhoven-airport");
  // Andere straten binnen dezelfde 5657-prefix (PDOK-geverifieerd, echt bestaand).
  assert.notEqual(resolveLocationSlug("Castendijkweg 1, 5657ER Eindhoven"), "eindhoven-airport");
  assert.notEqual(resolveLocationSlug("Parmentierweg 1, 5657EH Eindhoven"), "eindhoven-airport");
});

test("Designer Outlet Roermond: ander adres binnen dezelfde 4-cijferige prefix matcht NIET", () => {
  assert.notEqual(resolveLocationSlug("Abdijhof 1, 6041HG Roermond"), "designer-outlet-roermond");
  assert.notEqual(resolveLocationSlug("Bakkerstraat 1, 6041JP Roermond"), "designer-outlet-roermond");
});

// ── Negatief: kale stadsnaam ≠ de landmark ───────────────────────────────────

test("kale 'Eindhoven' matcht nooit eindhoven-airport", () => {
  assert.notEqual(resolveLocationSlug("Eindhoven"), "eindhoven-airport");
  assert.notEqual(resolveLocationSlug("Stationsplein 1, Eindhoven"), "eindhoven-airport");
});

test("kale 'Roermond' matcht nooit designer-outlet-roermond", () => {
  assert.notEqual(resolveLocationSlug("Roermond"), "designer-outlet-roermond");
  assert.notEqual(resolveLocationSlug("Markt 1, Roermond"), "designer-outlet-roermond");
});

// ── Negatief: losse term zonder de vereiste combinatie ──────────────────────

test("losse termen zonder eenduidige combinatie matchen niet", () => {
  assert.notEqual(resolveLocationSlug("Luchthavenweg, Eindhoven"), "eindhoven-airport"); // geen huisnummer 25
  assert.notEqual(resolveLocationSlug("Luchthavenweg 100, Eindhoven"), "eindhoven-airport"); // ander huisnummer
  assert.notEqual(resolveLocationSlug("Designer Outlet"), "designer-outlet-roermond"); // geen Roermond
  assert.notEqual(resolveLocationSlug("Stadsweide, Roermond"), "designer-outlet-roermond"); // geen huisnummer 2
  assert.notEqual(resolveLocationSlug("Stadsweide 10, Roermond"), "designer-outlet-roermond"); // ander huisnummer
  assert.equal(resolveLocationSlug("Airport"), null); // los "airport" resolveert nergens naartoe
});

// ── Negatief: typefouten / vergelijkbare straatnamen ────────────────────────

test("typefouten en vergelijkbare namen matchen niet (geen fuzzy match)", () => {
  assert.notEqual(resolveLocationSlug("Luchthavenwg 25, Eindhoven"), "eindhoven-airport");
  assert.notEqual(resolveLocationSlug("Eindhoven Airprot"), "eindhoven-airport");
  assert.notEqual(resolveLocationSlug("Stadswede 2, Roermond"), "designer-outlet-roermond");
  assert.notEqual(resolveLocationSlug("Designer Outlets Roermond"), "designer-outlet-roermond"); // "Outlets" ipv "Outlet" — géén exacte substring "designer outlet roermond"
});

// ── Item 6: kale "Roermond" krijgt NIET automatisch dezelfde activering ─────
// De voorgestelde migratie voegt Roermond toe aan `cities` (nodig als FK voor
// de landmark-locatie) maar bewust GEEN stadsniveau-rij in `locations` — dus
// findLocation() kan "Roermond" nergens op matchen (geen exacte slug, geen
// alias, geen naam-match) en classifyDestination() valt terug op "unknown".

test("kale 'Roermond' resolveert niet via de alias-laag (geen city-level locatie toegevoegd)", () => {
  assert.equal(resolveLocationSlug("Roermond"), null);
});

test("onopgeloste bestemming (zoals kale 'Roermond' zou zijn) classificeert als 'unknown', nooit 'peripheral'", () => {
  const c = classifyDestination({
    dropoff: null, // exact wat findLocation() voor kale "Roermond" teruggeeft zonder city-level locatie
    highDemandLocationIds: new Set(),
    highDemandCityIds: new Set(),
  });
  assert.equal(c.classification, "unknown");
  // "unknown" kan nooit eligibleForActivation opleveren — geverifieerd in de
  // bestaande computeShadowDeadhead-tests (deadhead-shadow.test.ts).
});

// ── Item 7: location_type='airport' zonder airports-rij ─────────────────────

test("airportContext leest uitsluitend location_type — geen afhankelijkheid van een airports-tabelrij", () => {
  const ctx = airportContext(
    { location_type: "district" },
    { location_type: "airport" } // exact hoe Eindhoven Airport eruit zou zien: alleen locations.location_type
  );
  assert.equal(ctx.isAirportTransfer, true);
  assert.equal(ctx.isAirportDropoff, true);
  assert.equal(ctx.flightDirection, "departure");
  // app/api/bookings/route.ts:254 — `if (airport.isAirportTransfer && flightNumber === "")` —
  // gebruikt uitsluitend dit ctx-object; geen join/afhankelijkheid van de airports-tabel.
});

// ── Bestaand gedrag ongewijzigd (steekproef) ────────────────────────────────

test("bestaande wijkresolutie blijft exact ongewijzigd (steekproef)", () => {
  assert.equal(resolveLocationSlug("Oudedijk 100, 3061 AM Rotterdam"), "rotterdam-kralingen");
  assert.equal(resolveLocationSlug("Spui 70, 2511 BT Den Haag"), "den-haag-centrum");
  assert.equal(resolveLocationSlug("Amsterdam"), "amsterdam"); // bestaande stadsfallback-regel, ongewijzigd
});
