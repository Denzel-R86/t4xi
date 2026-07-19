import { test } from "node:test";
import assert from "node:assert/strict";
import { groupRoutes, type RawRateRow } from "./rate-card";

/** Steekproef uit de echte fixed_route_prices-data (genormaliseerd). */
const SAMPLE: RawRateRow[] = [
  // Amsterdam → Schiphol (stad + wijken)
  { pickupName: "Amsterdam", citySlug: "amsterdam", cityName: "Amsterdam", dropoffSlug: "schiphol-airport", dropoffName: "Schiphol Airport", serviceType: "airport", single: 69, retour: 124, distanceKm: 22 },
  { pickupName: "Amsterdam Zuidas", citySlug: "amsterdam", cityName: "Amsterdam", dropoffSlug: "schiphol-airport", dropoffName: "Schiphol Airport", serviceType: "airport", single: 50, retour: 90, distanceKm: 10 },
  { pickupName: "Amsterdam Noord", citySlug: "amsterdam", cityName: "Amsterdam", dropoffSlug: "schiphol-airport", dropoffName: "Schiphol Airport", serviceType: "airport", single: 65, retour: 117, distanceKm: 20 },
  // Amsterdam intercity
  { pickupName: "Amsterdam", citySlug: "amsterdam", cityName: "Amsterdam", dropoffSlug: "rotterdam", dropoffName: "Rotterdam", serviceType: "intercity", single: 109, retour: 196, distanceKm: 78 },
  { pickupName: "Amsterdam", citySlug: "amsterdam", cityName: "Amsterdam", dropoffSlug: "utrecht", dropoffName: "Utrecht", serviceType: "intercity", single: 69, retour: 124, distanceKm: 40 },
  // Amsterdam → Rotterdam Airport (secundaire luchthaven: hoort in GEEN van beide groepen)
  { pickupName: "Amsterdam", citySlug: "amsterdam", cityName: "Amsterdam", dropoffSlug: "rotterdam-airport", dropoffName: "Rotterdam The Hague Airport", serviceType: "airport", single: 119, retour: 214, distanceKm: 85 },
  // Almere wijken → Schiphol
  { pickupName: "Almere Poort", citySlug: "almere", cityName: "Almere", dropoffSlug: "schiphol-airport", dropoffName: "Schiphol Airport", serviceType: "airport", single: 102, retour: 184, distanceKm: 39 },
  { pickupName: "Almere Buiten", citySlug: "almere", cityName: "Almere", dropoffSlug: "schiphol-airport", dropoffName: "Schiphol Airport", serviceType: "airport", single: 110, retour: 198, distanceKm: 44 },
  // Almere intercity
  { pickupName: "Almere", citySlug: "almere", cityName: "Almere", dropoffSlug: "amsterdam", dropoffName: "Amsterdam", serviceType: "intercity", single: 45, retour: 81, distanceKm: 35 },
  // Utrecht wijken → Schiphol
  { pickupName: "Utrecht Centrum", citySlug: "utrecht", cityName: "Utrecht", dropoffSlug: "schiphol-airport", dropoffName: "Schiphol Airport", serviceType: "airport", single: 110, retour: 198, distanceKm: 44 },
  { pickupName: "Leidsche Rijn", citySlug: "utrecht", cityName: "Utrecht", dropoffSlug: "schiphol-airport", dropoffName: "Schiphol Airport", serviceType: "airport", single: 104, retour: 187, distanceKm: 40 },
  // Den Haag → Schiphol (vertrekstad zonder intercity in de data → fallback verwacht)
  { pickupName: "Den Haag", citySlug: "den-haag", cityName: "Den Haag", dropoffSlug: "schiphol-airport", dropoffName: "Schiphol Airport", serviceType: "airport", single: 107, retour: 193, distanceKm: 43 },
  // ongeldige prijs → mag niet verschijnen
  { pickupName: "Kapot", citySlug: "amsterdam", cityName: "Amsterdam", dropoffSlug: "schiphol-airport", dropoffName: "Schiphol Airport", serviceType: "airport", single: NaN, retour: null, distanceKm: 5 },
];

const grouped = groupRoutes(SAMPLE);
const city = (slug: string) => grouped.find((c) => c.citySlug === slug);
const allFroms = (slug: string) => [
  ...(city(slug)?.toSchiphol ?? []),
  ...(city(slug)?.intercity ?? []),
].map((e) => e.from);

test("1–3 · geen wijk verschijnt onder een verkeerde stad", () => {
  assert.ok(!allFroms("almere").some((f) => f.includes("Amsterdam")));
  assert.ok(!allFroms("utrecht").some((f) => f.includes("Amsterdam")));
  assert.ok(!allFroms("almere").some((f) => f.includes("Utrecht")));
});

test("5 · elke Schiphol-route staat onder zijn eigen vertrekstad", () => {
  assert.ok(city("almere")!.toSchiphol.every((e) => e.from.startsWith("Almere")));
  assert.ok(city("utrecht")!.toSchiphol.every((e) => ["Utrecht Centrum", "Leidsche Rijn"].includes(e.from)));
  assert.ok(city("amsterdam")!.toSchiphol.every((e) => e.from.startsWith("Amsterdam")));
});

test("4 · iedere route verschijnt maximaal één keer", () => {
  const keys = grouped.flatMap((c) =>
    [...c.toSchiphol, ...c.intercity].map((e) => `${c.citySlug}|${e.from}->${e.to}`)
  );
  assert.equal(keys.length, new Set(keys).size);
});

test("6 · Amsterdam, Rotterdam, Almere, Utrecht in vaste volgorde, elk eigen sectie", () => {
  const order = grouped.map((c) => c.citySlug);
  assert.equal(order[0], "amsterdam");
  assert.equal(order.indexOf("almere") < order.indexOf("utrecht") || order.indexOf("utrecht") === -1, true);
  // geen gecombineerde almere/utrecht-sectie
  assert.ok(!grouped.some((c) => c.citySlug.includes("/")));
});

test("7 · stad zonder intercity heeft lege intercity-groep (→ fallback in UI)", () => {
  assert.equal(city("den-haag")!.intercity.length, 0);
  assert.ok(city("den-haag")!.toSchiphol.length > 0);
  assert.ok(city("almere")!.intercity.length > 0);
});

test("8 + 11 · alleen geldige prijzen; NaN/lege prijs wordt geweigerd", () => {
  const all = grouped.flatMap((c) => [...c.toSchiphol, ...c.intercity]);
  assert.ok(all.every((e) => Number.isFinite(e.single) && e.single > 0));
  assert.ok(!all.some((e) => e.from === "Kapot"));
});

test("secundaire luchthaven (Rotterdam Airport) valt buiten Schiphol én intercity", () => {
  const ams = city("amsterdam")!;
  assert.ok(!ams.toSchiphol.some((e) => e.to.includes("Rotterdam")));
  assert.ok(!ams.intercity.some((e) => e.to.includes("Airport")));
});

test("Schiphol-groep is op prijs oplopend gesorteerd", () => {
  const s = city("amsterdam")!.toSchiphol.map((e) => e.single);
  assert.deepEqual(s, [...s].sort((a, b) => a - b));
});
