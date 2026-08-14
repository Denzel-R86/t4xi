// Pure regressietests voor de PDOK-woonplaats → zone-city_id-koppeling
// (hotfix 2026-08-14, city-wide economische zones Eindhoven/Roermond).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeOfficialWoonplaats,
  resolveZoneCityIdFromWoonplaats,
  resolveZoneCityIdFromPostcode4Fallback,
  extractPostcode4,
  EINDHOVEN_POSTCODE4_FALLBACK,
  ROERMOND_POSTCODE4_FALLBACK,
} from "./deadhead-zone";

const ZONE_MAP = new Map([
  ["eindhoven", "eindhoven-city-id"],
  ["roermond", "roermond-city-id"],
]);

test("normalizeOfficialWoonplaats: triviale normalisatie, geen fuzzy matching", () => {
  assert.equal(normalizeOfficialWoonplaats("Eindhoven"), "eindhoven");
  assert.equal(normalizeOfficialWoonplaats("  Roermond  "), "roermond");
  assert.equal(normalizeOfficialWoonplaats("EINDHOVEN"), "eindhoven");
});

test("resolveZoneCityIdFromWoonplaats: exacte match (na normalisatie) → city_id", () => {
  assert.equal(resolveZoneCityIdFromWoonplaats("Eindhoven", ZONE_MAP), "eindhoven-city-id");
  assert.equal(resolveZoneCityIdFromWoonplaats("Roermond", ZONE_MAP), "roermond-city-id");
});

test("resolveZoneCityIdFromWoonplaats: geen substring-/fuzzy-match — alleen exact", () => {
  assert.equal(resolveZoneCityIdFromWoonplaats("Herten", ZONE_MAP), null);
  assert.equal(resolveZoneCityIdFromWoonplaats("Swalmen", ZONE_MAP), null);
  assert.equal(resolveZoneCityIdFromWoonplaats("Montfort", ZONE_MAP), null);
  assert.equal(resolveZoneCityIdFromWoonplaats("Veldhoven", ZONE_MAP), null);
  assert.equal(resolveZoneCityIdFromWoonplaats("Best", ZONE_MAP), null);
  assert.equal(resolveZoneCityIdFromWoonplaats("Nuenen", ZONE_MAP), null);
  assert.equal(resolveZoneCityIdFromWoonplaats("Geldrop", ZONE_MAP), null);
  assert.equal(resolveZoneCityIdFromWoonplaats("Maastricht", ZONE_MAP), null);
  assert.equal(resolveZoneCityIdFromWoonplaats("Arnhem", ZONE_MAP), null);
  assert.equal(resolveZoneCityIdFromWoonplaats("Groningen", ZONE_MAP), null);
  assert.equal(resolveZoneCityIdFromWoonplaats("Breda", ZONE_MAP), null);
  // "Eindhove" (afgekapt) mag nooit matchen — geen prefix-/substring-logica.
  assert.equal(resolveZoneCityIdFromWoonplaats("Eindhove", ZONE_MAP), null);
  assert.equal(resolveZoneCityIdFromWoonplaats("Eindhoven-Airport", ZONE_MAP), null);
});

test("resolveZoneCityIdFromWoonplaats: lege allowlist-map → altijd null", () => {
  assert.equal(resolveZoneCityIdFromWoonplaats("Eindhoven", new Map()), null);
});

test("extractPostcode4: haalt de 4-cijferige prefix uit een volledig adres", () => {
  assert.equal(extractPostcode4("Luchthavenweg 25, 5657EA Eindhoven"), 5657);
  assert.equal(extractPostcode4("Stadsweide 2, 6041TD Roermond"), 6041);
  assert.equal(extractPostcode4("Eindhoven"), null); // geen postcode aanwezig
  assert.equal(extractPostcode4("Luchthavenweg 25, Eindhoven"), null); // geen postcode
});

test("resolveZoneCityIdFromPostcode4Fallback: individueel geverifieerde prefixen matchen", () => {
  assert.equal(
    resolveZoneCityIdFromPostcode4Fallback("Castendijkweg 1, 5657ER Eindhoven", ZONE_MAP),
    "eindhoven-city-id"
  );
  assert.equal(
    resolveZoneCityIdFromPostcode4Fallback("Abdijhof 1, 6041HG Roermond", ZONE_MAP),
    "roermond-city-id"
  );
});

test("resolveZoneCityIdFromPostcode4Fallback: NIET-geverifieerde prefixen matchen nooit, ook al liggen ze dichtbij", () => {
  // 5671 = Nuenen; 5664 = Geldrop; 5503 = Veldhoven; 5683 = Best — geen van
  // allen in de geverifieerde EINDHOVEN_POSTCODE4_FALLBACK-set.
  assert.equal(resolveZoneCityIdFromPostcode4Fallback("Park 1, 5671GA Nuenen", ZONE_MAP), null);
  assert.equal(resolveZoneCityIdFromPostcode4Fallback("Bogardeind 1, 5664EG Geldrop", ZONE_MAP), null);
  assert.equal(resolveZoneCityIdFromPostcode4Fallback("Kempenbaan 1, 5503NG Veldhoven", ZONE_MAP), null);
  assert.equal(resolveZoneCityIdFromPostcode4Fallback("Nazarethstraat 1, 5683AN Best", ZONE_MAP), null);
  // 6071 = Swalmen; 6049 (niet getest, maar illustratief) = Herten — niet in
  // de geverifieerde ROERMOND_POSTCODE4_FALLBACK-set (bewust smal: {6041}).
  assert.equal(resolveZoneCityIdFromPostcode4Fallback("Markt 1, 6071JD Swalmen", ZONE_MAP), null);
});

test("resolveZoneCityIdFromPostcode4Fallback: geen postcode in het adres → null, nooit een gok", () => {
  assert.equal(resolveZoneCityIdFromPostcode4Fallback("Eindhoven", ZONE_MAP), null);
  assert.equal(resolveZoneCityIdFromPostcode4Fallback("Luchthavenweg, Eindhoven", ZONE_MAP), null);
});

test("resolveZoneCityIdFromPostcode4Fallback: prefix geverifieerd, maar allowlist-map leeg (zone niet actief) → null", () => {
  assert.equal(
    resolveZoneCityIdFromPostcode4Fallback("Luchthavenweg 25, 5657EA Eindhoven", new Map()),
    null
  );
});

test("de geverifieerde fallback-sets bevatten uitsluitend PDOK-geverifieerde prefixen (geen bereik, individuele nummers)", () => {
  assert.deepEqual([...EINDHOVEN_POSTCODE4_FALLBACK].sort(), [5611, 5612, 5615, 5617, 5656, 5657]);
  assert.deepEqual([...ROERMOND_POSTCODE4_FALLBACK].sort(), [6041]);
  // Expliciet bewijs dat de buurplaatsen die de audit van 2026-08-12/13 vond
  // NOOIT in de fallback-sets zitten.
  for (const excluded of [5581, 5664, 5671, 5684, 5503, 5683]) {
    assert.equal(EINDHOVEN_POSTCODE4_FALLBACK.has(excluded), false, `${excluded} hoort niet in de Eindhoven-fallback`);
  }
  for (const excluded of [6049, 6065, 6071]) {
    assert.equal(ROERMOND_POSTCODE4_FALLBACK.has(excluded), false, `${excluded} hoort niet in de Roermond-fallback`);
  }
});
