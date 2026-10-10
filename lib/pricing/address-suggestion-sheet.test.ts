import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  prioritizeKnownPlaces,
  queryNamesKnownPlace,
  suggestionKind,
  suggestionParts,
} from "@/components/shared/address-suggestions";
import type { AddressSuggestion } from "@/components/shared/AddressAutocomplete";
import { addressLabelFor, searchLocalLocations } from "@/lib/pricing/local-locations";

/**
 * Experience 2.0 PR 2.2 — suggestie-sheet van de gedeelde AddressAutocomplete.
 * Alleen publieke locaties (luchthavens, stations, openbare straten); geen
 * klantadressen.
 */

const local = (query: string, index = 0): AddressSuggestion => {
  const loc = searchLocalLocations(query)[index];
  assert.ok(loc, `lokale locatie voor "${query}" ontbreekt`);
  return { id: loc.id, label: addressLabelFor(loc), source: "local", location: loc };
};
const pdok = (id: string, label: string): AddressSuggestion => ({ id, label, source: "pdok" });

// Een straatadres vóór de luchthaven: precies het F-16-beeld.
const street = pdok("pdok-street", "Evert van de Beekstraat 202, 1118CP Schiphol");
const town = pdok("pdok-town", "Schiphol, Haarlemmermeer, Noord-Holland");

test("F-16: 'Schiphol' zet de luchthaven vóór straatadressen", () => {
  const airport = local("Schiphol");
  const ranked = prioritizeKnownPlaces("Schiphol", [street, town, airport]);
  assert.equal(ranked[0]?.id, "airport-ams");
  assert.deepEqual(ranked.slice(1).map((s) => s.id), ["pdok-street", "pdok-town"]);
});

test("F-16: 'schiphol airport' (alias, kleine letters) geeft dezelfde voorrang", () => {
  const ranked = prioritizeKnownPlaces("schiphol airport", [street, local("Schiphol")]);
  assert.equal(ranked[0]?.id, "airport-ams");
});

test("F-16: 'Eindhoven Airport' zet Eindhoven Airport bovenaan", () => {
  const airport = local("Eindhoven Airport");
  const ranked = prioritizeKnownPlaces("Eindhoven Airport", [
    pdok("pdok-weg", "Luchthavenweg, Eindhoven"),
    airport,
  ]);
  assert.equal(ranked[0]?.id, "airport-ein");
});

test("F-16: een stationsnaam zet het station bovenaan", () => {
  const station = local("Utrecht Centraal");
  assert.equal(suggestionKind(station), "station");
  const ranked = prioritizeKnownPlaces("Utrecht Centraal", [
    pdok("pdok-plein", "Stationsplein, Utrecht"),
    station,
  ]);
  assert.equal(ranked[0]?.id, station.id);
});

test("specifieke straatzoekopdracht houdt de bestaande volgorde", () => {
  const input = [street, local("Schiphol")];
  const query = "Evert van de Beekstraat Schiphol";
  assert.equal(queryNamesKnownPlace(query, input[1]!.location!), false);
  assert.deepEqual(prioritizeKnownPlaces(query, input), input);
});

test("huisnummer of postcode in de term houdt de bestaande volgorde", () => {
  const input = [street, local("Schiphol")];
  assert.deepEqual(prioritizeKnownPlaces("Schiphol 202", input), input);
  assert.deepEqual(prioritizeKnownPlaces("1118 CP Schiphol", input), input);
});

test("gewoon adres zonder bekende locatie: volgorde onveranderd", () => {
  const input = [pdok("a", "Damrak 1, 1012LG Amsterdam"), pdok("b", "Damrak, Amsterdam")];
  assert.deepEqual(prioritizeKnownPlaces("Damrak 1 Amsterdam", input), input);
  assert.deepEqual(prioritizeKnownPlaces("Damrak", input), input);
});

test("voorrang is stabiel en verliest of verdubbelt geen suggesties", () => {
  const station = local("Amsterdam Centraal");
  const airport = local("Schiphol");
  const input = [pdok("x", "Amsterdam"), airport, station];
  const ranked = prioritizeKnownPlaces("Amsterdam", input);
  assert.deepEqual(ranked.map((s) => s.id), [airport.id, station.id, "x"]);
});

test("type-label: luchthaven, station, bestemming, adres", () => {
  assert.equal(suggestionKind(local("Schiphol")), "airport");
  assert.equal(suggestionKind(local("Utrecht Centraal")), "station");
  assert.equal(suggestionKind(local("Rijksmuseum")), "destination");
  assert.equal(suggestionKind(street), "address");
  assert.equal(suggestionKind({ id: "g", label: "Hilton Schiphol, Schiphol", source: "google" }), "address");
});

test("titel + adresregel; het veldlabel zelf verandert niet", () => {
  const airport = local("Schiphol");
  assert.deepEqual(suggestionParts(airport), {
    title: "Amsterdam Airport Schiphol (AMS)",
    detail: "Evert van de Beekstraat 202, 1118 CP Schiphol",
  });
  assert.equal(airport.label, "Evert van de Beekstraat 202, 1118 CP Schiphol");
  assert.deepEqual(suggestionParts(street), { title: "Evert van de Beekstraat 202", detail: "1118CP Schiphol" });
  assert.deepEqual(suggestionParts(pdok("w", "Amsterdam")), { title: "Amsterdam", detail: "" });
  // Station: `address` is de stationsnaam → adresregel toont de plaats, geen herhaling.
  const station = suggestionParts(local("Utrecht Centraal"));
  assert.equal(station.title, "Utrecht Centraal");
  assert.notEqual(station.detail, station.title);
  assert.equal(station.detail, "Utrecht");
});

// ── Broncode-lock: WAI-ARIA 1.2 combobox-contract (geen DOM-runner in deze suite) ──
const src = readFileSync("components/shared/AddressAutocomplete.tsx", "utf8");

test("combobox-contract: rollen, relaties en actieve optie", () => {
  assert.match(src, /role="combobox"/);
  assert.match(src, /aria-expanded=\{expanded\}/);
  assert.match(src, /aria-controls=\{listId\}/);
  assert.match(src, /aria-autocomplete="list"/);
  assert.match(src, /aria-activedescendant=\{expanded && activeIndex >= 0/);
  assert.match(src, /role="listbox"/);
  assert.match(src, /role="option"[\s\S]*?aria-selected=\{active\}/);
  // Unieke id per instantie (niet afgeleid van het label: twee velden met hetzelfde label botsen anders).
  assert.match(src, /useId\(\)/);
  // Klikken op een optie neemt de focus niet van het veld.
  assert.match(src, /onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/);
});

test("combobox-contract: toetsen pijlen, Enter, Escape, Tab", () => {
  for (const key of ["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab"]) {
    assert.match(src, new RegExp(`e\\.key === "${key}"`), key);
  }
});

test("F-17/F-18: lijst en zoekstatus alleen zichtbaar zolang het veld focus heeft", () => {
  assert.match(src, /const expanded = focused && openList && suggestions\.length > 0/);
  assert.match(src, /\{focused && status === "empty" && t\("leeg"\)\}/);
});

test("mobiel: lijst begrensd tot de viewport, opties ≥ 44px", () => {
  assert.match(src, /max-h-\[min\(22rem,55svh\)\] w-full overflow-y-auto/);
  assert.match(src, /role="option"[\s\S]*?flex min-h-11/);
  // Type-label boven de titel: volle breedte voor naam en adres in smalle kolommen.
});

test("transactioneel: geen serif in de suggestielijst (design-specs §13f)", () => {
  assert.doesNotMatch(src, /font-display-serif|font-playfair/);
});

test("listbox heeft een eigen toegankelijke naam, niet die van het invoerveld", () => {
  const src = readFileSync("components/shared/AddressAutocomplete.tsx", "utf8");
  const listbox = src.slice(src.indexOf('role="listbox"'), src.indexOf('role="listbox"') + 200);
  assert.doesNotMatch(listbox, /aria-label=\{label\}/);
  assert.match(listbox, /aria-label=\{t\("lijstLabel"/);
});

test("F-16 hero (PR 2.6): gekozen luchthaven toont de naam, niet het straatadres; label blijft het volledige adres", async () => {
  const { sentenceDisplayLabel } = await import("@/components/shared/address-suggestions");
  const airport = local("Schiphol");
  assert.equal(airport.label, "Evert van de Beekstraat 202, 1118 CP Schiphol");
  assert.equal(sentenceDisplayLabel(airport), "Amsterdam Airport Schiphol (AMS)");
  assert.doesNotMatch(sentenceDisplayLabel(airport), /Beekstraat/);
  // Gewoon adres: ongewijzigde weergave (deel vóór de eerste komma).
  assert.equal(sentenceDisplayLabel(street), "Evert van de Beekstraat 202");
  assert.equal(sentenceDisplayLabel(pdok("p", "Zonder komma")), "Zonder komma");
});
