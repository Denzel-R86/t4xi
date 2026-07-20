/**
 * Tests voor de luchthaven- en richtinglogica (Sprint 11.1, Fase C).
 *
 * `airportContext()` is de ENIGE plek waar wordt bepaald of een rit een
 * luchthavenrit is en welke richting de vlucht heeft. De quote-API, het
 * boekingsformulier en de booking-route lezen allemaal dit object. Deze tests
 * bewaken dat die ene definitie klopt — en dus dat de drie afnemers niet uit
 * elkaar kunnen lopen.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { airportContext, NO_AIRPORT } from "./service";

/** Zoals `locations` ze aanlevert: alleen location_type doet ertoe. */
const luchthaven = { location_type: "airport" };
const stad = { location_type: "city" };
const wijk = { location_type: "district" };

// ── Richting ────────────────────────────────────────────────────────────────

test("Schiphol → Amsterdam is een aankomst", () => {
  const ctx = airportContext(luchthaven, stad);
  assert.equal(ctx.flightDirection, "arrival");
  assert.equal(ctx.isAirportPickup, true);
  assert.equal(ctx.isAirportDropoff, false);
  assert.equal(ctx.isAirportTransfer, true);
  assert.equal(ctx.pickupIsAirport, true);
  assert.equal(ctx.dropoffIsAirport, false);
});

test("Amsterdam → Schiphol is een vertrek", () => {
  const ctx = airportContext(stad, luchthaven);
  assert.equal(ctx.flightDirection, "departure");
  assert.equal(ctx.isAirportPickup, false);
  assert.equal(ctx.isAirportDropoff, true);
  assert.equal(ctx.isAirportTransfer, true);
});

test("wijk → Schiphol is óók een vertrek (wijken zijn geen luchthaven)", () => {
  const ctx = airportContext(wijk, luchthaven);
  assert.equal(ctx.flightDirection, "departure");
  assert.equal(ctx.isAirportTransfer, true);
});

test("Schiphol → wijk is een aankomst", () => {
  const ctx = airportContext(luchthaven, wijk);
  assert.equal(ctx.flightDirection, "arrival");
  assert.equal(ctx.isAirportPickup, true);
});

test("luchthaven → luchthaven telt als aankomst", () => {
  // Bij een transfer tussen twee luchthavens is de OPHALING operationeel bepalend:
  // daar staat de chauffeur te wachten op een landing.
  const ctx = airportContext(luchthaven, luchthaven);
  assert.equal(ctx.flightDirection, "arrival");
  assert.equal(ctx.isAirportPickup, true);
  assert.equal(ctx.isAirportDropoff, true);
});

// ── Gewone ritten ───────────────────────────────────────────────────────────

test("gewone stadsrit heeft geen richting en geen vluchtnummerplicht", () => {
  const ctx = airportContext(stad, stad);
  assert.equal(ctx.flightDirection, null);
  assert.equal(ctx.isAirportTransfer, false);
  assert.equal(ctx.isAirportPickup, false);
  assert.equal(ctx.isAirportDropoff, false);
});

test("wijk → wijk is evenmin een luchthavenrit", () => {
  const ctx = airportContext(wijk, wijk);
  assert.equal(ctx.isAirportTransfer, false);
  assert.equal(ctx.flightDirection, null);
});

// ── Onbekende locaties ──────────────────────────────────────────────────────

test("onbekende locaties leveren geen luchthavencontext op", () => {
  assert.deepEqual(airportContext(null, null), NO_AIRPORT);
  assert.equal(airportContext(null, luchthaven).flightDirection, "departure");
  assert.equal(airportContext(luchthaven, null).flightDirection, "arrival");
});

test("NO_AIRPORT is volledig leeg — geen enkele vlag staat aan", () => {
  assert.equal(NO_AIRPORT.isAirportTransfer, false);
  assert.equal(NO_AIRPORT.isAirportPickup, false);
  assert.equal(NO_AIRPORT.isAirportDropoff, false);
  assert.equal(NO_AIRPORT.pickupIsAirport, false);
  assert.equal(NO_AIRPORT.dropoffIsAirport, false);
  assert.equal(NO_AIRPORT.flightDirection, null);
});

// ── Consistentie: één definitie, geen afwijkende afgeleiden ────────────────

test("isAirportPickup en pickupIsAirport zijn altijd gelijk", () => {
  for (const [p, d] of [
    [luchthaven, stad], [stad, luchthaven], [stad, stad], [luchthaven, luchthaven],
  ] as const) {
    const ctx = airportContext(p, d);
    assert.equal(ctx.isAirportPickup, ctx.pickupIsAirport);
    assert.equal(ctx.isAirportDropoff, ctx.dropoffIsAirport);
  }
});

test("isAirportTransfer is waar precies wanneer er een richting is", () => {
  for (const [p, d] of [
    [luchthaven, stad], [stad, luchthaven], [stad, stad],
    [luchthaven, luchthaven], [wijk, wijk], [null, null],
  ] as const) {
    const ctx = airportContext(p, d);
    assert.equal(
      ctx.isAirportTransfer,
      ctx.flightDirection !== null,
      `inconsistent voor ${p?.location_type ?? "null"} → ${d?.location_type ?? "null"}`
    );
  }
});

// ── Vluchtnummerformaat ─────────────────────────────────────────────────────

/** Zelfde patroon als in app/api/bookings/route.ts en in de create_booking RPC. */
const VLUCHT_RE = /^[A-Z0-9]{2,3}[0-9]{1,4}[A-Z]?$/;

test("geldige vluchtnummers worden geaccepteerd", () => {
  for (const code of ["KL1234", "U24321", "BA2760A", "HV5321", "EZY88", "TO123"]) {
    assert.ok(VLUCHT_RE.test(code), `${code} zou geldig moeten zijn`);
  }
});

test("ongeldige vluchtnummers worden geweigerd", () => {
  for (const code of ["XX", "1234567890", "KL", "K", "", "KL-1234", "kl1234"]) {
    assert.ok(!VLUCHT_RE.test(code), `${code} zou geweigerd moeten worden`);
  }
});

test("normalisatie maakt van 'kl 1234' een geldig nummer", () => {
  const genormaliseerd = "kl 1234".toUpperCase().replace(/[^A-Z0-9]/g, "");
  assert.equal(genormaliseerd, "KL1234");
  assert.ok(VLUCHT_RE.test(genormaliseerd));
});
