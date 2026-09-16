import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { amsterdamDepartureIso } from "@/lib/pricing/departure-time";
import { quoteFingerprint } from "@/lib/pricing/service";
import { classifyLuggage } from "@/lib/pricing/luggage";
import { isBookingStatus } from "@/lib/bookings/lifecycle";
import { normalizeLocale } from "@/lib/notifications/booking-email";
import { buildTripMonitoringRegistration } from "@/lib/flight-monitoring/service";

// Frozen, unedited pre-refactor route. Test-only oracle, never imported by runtime.
const original = readFileSync("lib/bookings/fixtures/create-route-1ebf31c.ts.txt", "utf8");
const route = readFileSync("app/api/bookings/route.ts", "utf8");
const service = readFileSync("lib/bookings/create.ts", "utf8");
const compile = (source: string) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiled = { original: compile(original), route: compile(route), service: compile(service) };
const NOW = Date.parse("2026-09-09T10:00:00Z");
class FrozenDate extends Date {
  constructor(value: string | number = NOW) { super(value); }
  static now() { return NOW; }
}
const clean = (value: unknown) => JSON.parse(JSON.stringify(value));
const base = {
  pickup: " Amsterdam Centrum ", dropoff: " Utrecht Centrum ", date: "2026-10-10", time: "09:00",
  customerName: " Test Klant ", customerEmail: " TEST@example.com ", customerPhone: "+31612345678",
  persons: 2, luggage: "handbagage", rideType: "enkel", locale: "en",
};
const noAirport = {
  isAirportTransfer: false, pickupIsAirport: false, dropoffIsAirport: false,
  isAirportPickup: false, isAirportDropoff: false, flightDirection: null,
};
type Scenario = {
  name: string;
  body?: Record<string, unknown>;
  raw?: string;
  kind?: "priced" | "on_request" | "error";
  airport?: "arrival" | "departure";
  locked?: boolean;
  configured?: boolean;
  rpcError?: string;
  rpcThrows?: boolean;
  priceThrows?: boolean;
  row?: unknown;
  updateErrors?: string[];
  dispatchThrows?: boolean;
  delivered?: boolean;
  requireQuoteLock?: boolean;
  repeat?: number;
  storedStatus?: string | null;
  statusError?: boolean;
  statusThrows?: boolean;
};

// Every external effect is stubbed; unknown imports fail instead of touching a provider.
// Pure production validators are shared by both executions, not reimplemented.
async function execute(which: "original" | "route", scenario: Scenario) {
  const effects: unknown[] = [];
  let count = 0;
  let updates = 0;
  const db = {
    async rpc(name: string, args: unknown) {
      effects.push(["rpc", name, args]);
      if (scenario.rpcThrows) throw new Error("rpc offline");
      return {
        data: scenario.row === undefined ? [{ booking_ref: "T4XI-TEST", booking_id: "booking-test", price_euros: 123.45 }] : scenario.row,
        error: scenario.rpcError ? { message: scenario.rpcError } : null,
      };
    },
    from(table: string) {
      return { select(columns: string) { return { eq(column: string, value: string) { return { async single() {
        effects.push(["status-read", table, columns, column, value]);
        if (scenario.statusThrows) throw new Error("read offline");
        return { data: { status: scenario.storedStatus === undefined ? "inquiry" : scenario.storedStatus }, error: scenario.statusError ? { message: "read offline" } : null };
      } }; } }; }, update(values: unknown) { return { async eq(column: string, value: string) {
        effects.push(["update", table, values, column, value]);
        const message = scenario.updateErrors?.[updates++];
        return { error: message ? { message } : null };
      } }; } };
    },
  };
  const deps: Record<string, unknown> = {
    "@/lib/bookings/lifecycle": { isBookingStatus },
    "next/server": { NextResponse: { json: (value: unknown, init: ResponseInit) => Response.json(value, init) } },
    "@supabase/supabase-js": { createClient: (...args: unknown[]) => { effects.push(["client", ...args]); return db; } },
    "@/lib/pricing/engine": { resolveBookingPrice: async (input: unknown, options: { now: Date }) => {
      effects.push(["price", input, options.now]);
      if (scenario.priceThrows) throw new Error("pricing offline");
      if (scenario.kind === "error") return { kind: "error", status: 409, error: "quote_expired", message: "Quote expired" };
      const airport = scenario.airport ? {
        ...noAirport, isAirportTransfer: true, flightDirection: scenario.airport,
        pickupIsAirport: scenario.airport === "arrival", isAirportPickup: scenario.airport === "arrival",
        dropoffIsAirport: scenario.airport === "departure", isAirportDropoff: scenario.airport === "departure",
      } : noAirport;
      return scenario.kind === "on_request" ? { kind: "on_request", airport } : {
        kind: "priced", airport, priceEuros: 99.5, returnApplied: scenario.body?.rideType === "retour",
        lockedQuoteId: scenario.locked ? "quote-test" : null,
      };
    } },
    "@/lib/pricing/departure-time": { amsterdamDepartureIso },
    "@/lib/pricing/service": { quoteFingerprint },
    "@/lib/pricing/luggage": { classifyLuggage },
    "@/lib/pricing/snapshot-store": { readPriceSnapshot: () => { throw new Error("Unexpected snapshot access"); } },
    "@/lib/notifications/booking-email": { normalizeLocale },
    "@/lib/communication/orchestrator": { dispatch: async (event: unknown) => {
      effects.push(["dispatch", event]);
      if (scenario.dispatchThrows) throw new Error("mail offline");
      return { delivered: scenario.delivered !== false };
    } },
    "@/lib/communication/delivery-log": { supabaseDeliveryLog: () => { effects.push(["delivery-log"]); return {}; } },
    "@/lib/flight-monitoring/service": {
      buildTripMonitoringRegistration,
      registerFlightMonitoring: async (_db: unknown, input: unknown) => { effects.push(["monitor", input]); },
    },
    "@/lib/security/rate-limit": {
      clientIp: () => "192.0.2.1",
      rateLimit: (...args: unknown[]) => { effects.push(["rate-limit", ...args]); return { limited: ++count > 5, retryAfterSec: 600 }; },
    },
  };
  const evaluate = (code: string) => {
    const exports: Record<string, (...args: never[]) => Promise<Response>> = {};
    runInNewContext(code, {
      exports,
      require: (id: string) => { if (!(id in deps)) throw new Error(`Unexpected dependency ${id}`); return deps[id]; },
      Date: FrozenDate, Buffer, process: { env: scenario.configured === false ? {} : {
        NEXT_PUBLIC_SUPABASE_URL: "https://local-test.invalid", SUPABASE_SERVICE_ROLE_KEY: "test-only",
      } },
      console: { warn: (...args: unknown[]) => effects.push(["warn", ...args]), error: (...args: unknown[]) => effects.push(["error", ...args]) },
    });
    return exports;
  };
  const evaluatedService = evaluate(compiled.service);
  deps["@/lib/bookings/create"] = scenario.requireQuoteLock
    ? { createBooking: (body: never) => evaluatedService.createBooking(body, { requireQuoteLock: true } as never) }
    : evaluatedService;
  const handler = evaluate(compiled[which]).POST as (request: Request) => Promise<Response>;
  const responses: unknown[] = [];
  for (let i = 0; i < (scenario.repeat ?? 1); i++) {
    try {
      const response = await handler(new Request("https://local-test.invalid/api/bookings", {
        method: "POST", body: scenario.raw ?? JSON.stringify({ ...base, ...scenario.body }),
      }));
      responses.push({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.json() });
    } catch (error) {
      responses.push({ thrown: (error as Error).message });
    }
  }
  return clean({ responses, effects });
}

const scenarios: Scenario[] = [
  { name: "fixed price, normalized customer fields and communication" },
  { name: "snapshot RPC price overrides resolver price", locked: true, body: { quoteId: "quote-test" } },
  { name: "same quote retried", locked: true, repeat: 2, body: { quoteId: "quote-test" } },
  { name: "on request", kind: "on_request" },
  { name: "manual luggage skips snapshot", locked: true, body: { luggage: "overleg" } },
  { name: "three suitcases four passengers", locked: true, body: { luggage: "3-koffers", persons: 4 } },
  { name: "return trip", locked: true, body: { rideType: "retour", returnDate: "2026-10-11", returnTime: "23:30" } },
  { name: "return fields fallback", updateErrors: ["column missing"], body: { rideType: "retour", returnDate: "2026-10-11", returnTime: "10:00" } },
  { name: "return fallback also fails", updateErrors: ["column missing", "fallback failed"], body: { rideType: "retour", returnDate: "2026-10-11", returnTime: "10:00" } },
  { name: "airport arrival", airport: "arrival", body: { flightNumber: "kl-1234" } },
  { name: "airport arrival missing flight", airport: "arrival" },
  { name: "airport on request still requires flight", airport: "arrival", kind: "on_request" },
  { name: "return airport flight", airport: "departure", body: { rideType: "retour", returnDate: "2026-10-11", returnTime: "10:00", returnFlightNumber: "kl 1234" } },
  { name: "return airport flight missing", airport: "departure", body: { rideType: "retour", returnDate: "2026-10-11", returnTime: "10:00" } },
  { name: "nonairport flight discarded", body: { flightNumber: "KL1234" } },
  { name: "coordinates and client price/vehicle ignored", body: { fromLat: 52.1, fromLon: "4.5", toLat: 51.9, toLon: 4.2, price: 0.01, vehicle: "Ferrari", locale: "xx" } },
  { name: "defaults", body: { persons: undefined, rideType: undefined } },
  { name: "missing DB config", configured: false },
  { name: "resolver error", kind: "error" },
  { name: "resolver throws", priceThrows: true },
  { name: "RPC throws", rpcThrows: true },
  { name: "known RPC error", rpcError: "Ongeldig veld" },
  { name: "unknown RPC error", rpcError: "private internal error" },
  { name: "missing booking result", row: null },
  { name: "object RPC result", row: { booking_ref: "T4XI-OBJECT", booking_id: "object-id" } },
  { name: "reference without id", row: { booking_ref: "T4XI-NO-ID" } },
  { name: "communication throws", dispatchThrows: true },
  { name: "communication not delivered", delivered: false },
  { name: "email_sent update fails", updateErrors: ["update failed"] },
  { name: "honeypot", body: { website: "spam" } },
  { name: "oversized before honeypot", body: { website: "spam", pad: "x".repeat(5000) } },
  { name: "rate limit", repeat: 6, raw: "{}" },
  ...["null", "[]", "not-json", '"text"'].map(raw => ({ name: `invalid JSON ${raw}`, raw })),
  ...Object.entries({ pickup: "a", dropoff: "b", date: "2026-02-31", time: "25:00", customerName: "x", customerEmail: "bad", customerPhone: "1", luggage: "mystery", persons: 9, rideType: "dagtocht", flightNumber: "bad" }).map(([key, value]) => ({ name: `invalid ${key}`, body: { [key]: value } })),
  { name: "past departure", body: { date: "2026-09-09", time: "11:00" } },
  { name: "DST gap", body: { date: "2027-03-28", time: "02:30" } },
  { name: "return before outward", body: { rideType: "retour", returnDate: "2026-10-09", returnTime: "09:00" } },
  { name: "return fields on one-way", body: { returnDate: "2026-10-11" } },
  ...["QUOTE_NOT_FOUND", "QUOTE_EXPIRED", "QUOTE_MISMATCH", "QUOTE_INVALID_SOURCE", "INVALID_VEHICLE_CLASS", "INVALID_LUGGAGE", "CAPACITY_EXCEEDED", "INVALID_PERSONS", "QUOTE_CONSUMED_NO_BOOKING"].map(rpcError => ({ name: rpcError, locked: true, rpcError })),
];

for (const scenario of scenarios) {
  test(`booking parity: ${scenario.name}`, async () => {
    const actual = await execute("route", scenario);
    const prior = await execute("original", scenario);
    // Approved contract delta only: persisted status + one read, or UNKNOWN
    // when the original RPC omitted the identifier needed for that read.
    for (const response of prior.responses) {
      if (response.body?.ok && response.body.bookingRef && !scenario.body?.website) {
        if (scenario.name === "reference without id") {
          response.status = 503;
          response.body = { ok: false, error: "booking_outcome_unknown", bookingRef: "T4XI-NO-ID", message: "De boeking is mogelijk vastgelegd, maar de status kon niet worden bevestigd. Neem contact met ons op voordat u opnieuw boekt." };
        } else response.body.status = "inquiry";
      }
    }
    assert.deepEqual({ ...actual, effects: actual.effects.filter((e: unknown[]) => e[0] !== "status-read") }, prior);
  });
}

test("booking parity oracle is the unchanged route from commit 1ebf31c", () => {
  assert.equal(createHash("sha256").update(original).digest("hex"), "412dafcfa72e0bbca7cdb7568885b23df2cd7e2f38d6f477903422f5e5fff1d8");
});

test("booking success writes one RPC then communication and monitoring with authoritative price", async () => {
  const result = await execute("route", { name: "success", locked: true });
  assert.equal(result.responses[0].status, 201);
  assert.equal(result.responses[0].body.price, 123.45);
  assert.equal(result.responses[0].body.status, "inquiry");
  assert.deepEqual(result.effects.map((e: unknown[]) => e[0]), ["rate-limit", "price", "client", "rpc", "delivery-log", "dispatch", "update", "monitor", "status-read"]);
  const rpc = result.effects.find((e: unknown[]) => e[0] === "rpc");
  assert.equal(rpc[1], "create_booking_from_snapshot");
  assert.equal(rpc[2].p_customer_email, "test@example.com");
  assert.equal(rpc[2].p_vehicle, "Premium voertuig");
  assert.equal(result.effects.find((e: unknown[]) => e[0] === "dispatch")[1].booking.price, 123.45);
});

test("rejected input produces no pricing, persistence or communication effects", async () => {
  const result = await execute("route", { name: "invalid", body: { pickup: "" } });
  assert.equal(result.responses[0].status, 400);
  assert.deepEqual(result.effects.map((e: unknown[]) => e[0]), ["rate-limit"]);
});

for (const storedStatus of ["inquiry", "quoted", "confirmed", "assigned", "in_progress", "completed", "cancelled"]) {
  test(`booking response uses persisted ${storedStatus}, including reused bookings`, async () => {
    const result = await execute("route", { name: "persisted", locked: true, storedStatus });
    assert.equal(result.responses[0].body.status, storedStatus);
    assert.equal(result.effects.filter((e: unknown[]) => e[0] === "rpc").length, 1);
    assert.equal(result.effects.filter((e: unknown[]) => e[0] === "status-read").length, 1);
  });
}
for (const failure of [{ storedStatus: null }, { storedStatus: "pending" }, { statusError: true }, { statusThrows: true }]) {
  test(`unavailable/invalid persisted status is UNKNOWN: ${JSON.stringify(failure)}`, async () => {
    const result = await execute("route", { name: "unknown", locked: true, ...failure });
    assert.equal(result.responses[0].status, 503);
    assert.equal(result.responses[0].body.error, "booking_outcome_unknown");
    assert.equal(result.responses[0].body.status, undefined);
    assert.equal(result.effects.filter((e: unknown[]) => e[0] === "rpc").length, 1);
  });
}

for (const body of [{ luggage: "overleg" }, { luggage: "3-koffers", persons: 4 }]) {
  test(`required quote lock never falls back to unkeyed creation: ${JSON.stringify(body)}`, async () => {
    const result = await execute("route", { name: "lock required", locked: true, requireQuoteLock: true, body });
    assert.equal(result.responses[0].status, 409);
    assert.equal(result.responses[0].body.error, "quote_lock_required");
    assert.equal(result.effects.filter((e: unknown[]) => e[0] === "rpc" || e[0] === "dispatch").length, 0);
  });
}
