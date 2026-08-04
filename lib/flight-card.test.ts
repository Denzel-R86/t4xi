/**
 * Tests voor de pure Flight-Card-helpers (Sprint 7.9A). Geen React/netwerk.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeFlightInput, isValidFlightNumber, flightVisual, delayMinutes,
  primaryTimeIso, iataCity, routeEndpoints, airlineName,
} from "./flight-card";
import type { NormalizedFlight } from "@/lib/schiphol/types";

function f(over: Partial<NormalizedFlight> = {}): NormalizedFlight {
  return {
    flightNumber: "KL1234", direction: "arrival", scheduleDate: "2026-08-06",
    scheduledDateTime: "2026-08-06T15:42:00.000+02:00", estimatedDateTime: "2026-08-06T15:42:00.000+02:00",
    actualDateTime: null, status: { codes: ["SCH"], label: "Scheduled" },
    isDelayed: false, isCancelled: false, isLanded: false, isDeparted: false,
    routeIata: ["GOT"], gate: "D12", pier: "D", terminal: "3", aircraftType: "73H",
    mainFlight: null, lastUpdatedAt: "2026-08-06T13:40:00.000Z", ...over,
  };
}

test("normalize + validatie", () => {
  assert.equal(normalizeFlightInput("kl 1234"), "KL1234");
  assert.equal(isValidFlightNumber("kl-1234"), true);
  assert.equal(isValidFlightNumber("X"), false);
  assert.equal(isValidFlightNumber(""), false);
});

test("flightVisual — prioriteit cancelled > delayed > landed > departed > scheduled", () => {
  assert.equal(flightVisual(f()).statusKey, "scheduled");
  assert.equal(flightVisual(f({ isDelayed: true })).tone, "amber");
  assert.equal(flightVisual(f({ isDelayed: true })).statusKey, "delayed");
  assert.equal(flightVisual(f({ isCancelled: true, isDelayed: true })).statusKey, "cancelled");
  assert.equal(flightVisual(f({ isCancelled: true })).tone, "red");
  assert.equal(flightVisual(f({ isLanded: true })).statusKey, "landed");
  assert.equal(flightVisual(f({ isDeparted: true })).statusKey, "departed");
  assert.equal(flightVisual(f()).tone, "green");
});

test("delayMinutes — positief verschil, anders null", () => {
  assert.equal(delayMinutes(f({ scheduledDateTime: "2026-08-06T15:42:00Z", estimatedDateTime: "2026-08-06T16:27:00Z" })), 45);
  assert.equal(delayMinutes(f({ scheduledDateTime: "2026-08-06T15:42:00Z", estimatedDateTime: "2026-08-06T15:42:00Z" })), null);
  assert.equal(delayMinutes(f({ estimatedDateTime: null })), null);
});

test("primaryTimeIso — actual > estimated > scheduled", () => {
  assert.equal(primaryTimeIso(f({ actualDateTime: "A", estimatedDateTime: "E", scheduledDateTime: "S" })), "A");
  assert.equal(primaryTimeIso(f({ actualDateTime: null, estimatedDateTime: "E", scheduledDateTime: "S" })), "E");
  assert.equal(primaryTimeIso(f({ actualDateTime: null, estimatedDateTime: null, scheduledDateTime: "S" })), "S");
});

test("iataCity + routeEndpoints (Schiphol op vaste zijde)", () => {
  assert.equal(iataCity("GOT"), "Göteborg");
  assert.equal(iataCity("ZZZ"), "ZZZ"); // onbekend → code
  assert.deepEqual(routeEndpoints(f({ direction: "arrival", routeIata: ["GOT"] })), { origin: "Göteborg", destination: "Amsterdam Schiphol" });
  assert.deepEqual(routeEndpoints(f({ direction: "departure", routeIata: ["JFK"] })), { origin: "Amsterdam Schiphol", destination: "New York JFK" });
  assert.deepEqual(routeEndpoints(f({ direction: "arrival", routeIata: [] })), { origin: "—", destination: "Amsterdam Schiphol" });
});

test("airlineName — prefix-map met fallback null", () => {
  assert.equal(airlineName("KL1234"), "KLM Royal Dutch Airlines");
  assert.equal(airlineName("hv 5321"), "Transavia");
  assert.equal(airlineName("ZZ9999"), null);
});
