/**
 * Tests voor de flight-monitoring service (Sprint 7.8A). Pure kern + de
 * pollronde met geïnjecteerde fakes — geen DB, geen netwerk.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMonitoringInsert,
  isTerminalFlight,
  monitoringUpdateFromFlight,
  pollActiveFlights,
  type PollDeps,
} from "./service";
import type { NormalizedFlight, FlightLookupResult } from "@/lib/schiphol/types";
import type { ActiveFlightRow, MonitoringUpdate } from "./types";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeFlight(over: Partial<NormalizedFlight> = {}): NormalizedFlight {
  return {
    flightNumber: "KL1234",
    direction: "arrival",
    scheduleDate: "2026-08-02",
    scheduledDateTime: "2026-08-02T14:30:00.000+02:00",
    estimatedDateTime: "2026-08-02T14:45:00.000+02:00",
    actualDateTime: null,
    status: { codes: ["SCH"], label: "Scheduled" },
    isDelayed: false,
    isCancelled: false,
    isLanded: false,
    isDeparted: false,
    routeIata: ["LHR"],
    gate: null,
    pier: null,
    terminal: null,
    aircraftType: null,
    mainFlight: null,
    lastUpdatedAt: null,
    ...over,
  };
}
const ok = (flight: NormalizedFlight): FlightLookupResult => ({ status: "ok", flight, matches: 1 });

const ROW = (over: Partial<ActiveFlightRow> = {}): ActiveFlightRow => ({
  id: "row-1",
  booking_id: "book-1",
  flight_number: "KL1234",
  schedule_date: "2026-08-02",
  direction: "arrival",
  ...over,
});

const NOW = () => new Date("2026-08-02T12:00:00.000Z");
const NOW_ISO = "2026-08-02T12:00:00.000Z";

// ── buildMonitoringInsert ────────────────────────────────────────────────────

test("buildMonitoringInsert — geldige luchthavenrit levert een insert", () => {
  const ins = buildMonitoringInsert({
    bookingId: "book-1",
    flightNumber: "kl 1234",
    scheduleDate: "2026-08-02",
    direction: "arrival",
  });
  assert.deepEqual(ins, {
    booking_id: "book-1",
    flight_number: "KL1234", // genormaliseerd
    schedule_date: "2026-08-02",
    direction: "arrival",
    is_active: true,
  });
});

test("buildMonitoringInsert — geen booking_id of ongeldig vluchtnummer → null", () => {
  assert.equal(
    buildMonitoringInsert({ bookingId: "", flightNumber: "KL1234", scheduleDate: null, direction: "arrival" }),
    null
  );
  assert.equal(
    buildMonitoringInsert({ bookingId: "book-1", flightNumber: "", scheduleDate: null, direction: null }),
    null
  );
  assert.equal(
    buildMonitoringInsert({ bookingId: "book-1", flightNumber: "XX", scheduleDate: null, direction: null }),
    null
  );
});

// ── terminale status + update-mapping ────────────────────────────────────────

test("isTerminalFlight — geland/vertrokken/geannuleerd is terminaal", () => {
  assert.equal(isTerminalFlight(makeFlight({ isLanded: true })), true);
  assert.equal(isTerminalFlight(makeFlight({ isDeparted: true })), true);
  assert.equal(isTerminalFlight(makeFlight({ isCancelled: true })), true);
  assert.equal(isTerminalFlight(makeFlight()), false);
});

test("monitoringUpdateFromFlight — actieve vlucht blijft actief", () => {
  const p = monitoringUpdateFromFlight(makeFlight({ status: { codes: ["DEL"], label: "Delayed" }, isDelayed: true }), NOW_ISO);
  assert.deepEqual(p, {
    current_status: "Delayed",
    estimated_time: "2026-08-02T14:45:00.000+02:00",
    actual_time: null,
    is_active: true,
    last_checked_at: NOW_ISO,
  });
});

test("monitoringUpdateFromFlight — geland → is_active=false, actual_time gezet", () => {
  const p = monitoringUpdateFromFlight(
    makeFlight({ status: { codes: ["LND"], label: "Landed" }, isLanded: true, actualDateTime: "2026-08-02T14:47:00.000+02:00" }),
    NOW_ISO
  );
  assert.equal(p.is_active, false);
  assert.equal(p.current_status, "Landed");
  assert.equal(p.actual_time, "2026-08-02T14:47:00.000+02:00");
});

// ── pollActiveFlights ────────────────────────────────────────────────────────

/** Bouwt PollDeps met vaste rijen + een getFlight-map, en vangt de patches op. */
function harness(
  rows: ActiveFlightRow[],
  resultsById: Record<string, FlightLookupResult>,
  applyImpl?: (id: string, patch: MonitoringUpdate) => Promise<void>
) {
  const updates: Array<{ id: string; patch: MonitoringUpdate }> = [];
  const deps: PollDeps = {
    fetchActive: async () => rows,
    applyUpdate: async (id, patch) => {
      if (applyImpl) return applyImpl(id, patch);
      updates.push({ id, patch });
    },
    getFlight: async (_flightNumber, _opts) => resultsById[rows.find((r) => r.flight_number === _flightNumber)?.id ?? ""] ?? { status: "not_found" },
    now: NOW,
  };
  return { deps, updates };
}

test("pollActiveFlights — mix: actief bijwerken, deactiveren, not_found, error", async () => {
  const rows = [
    ROW({ id: "a", flight_number: "KL1111" }),
    ROW({ id: "b", flight_number: "KL2222" }),
    ROW({ id: "c", flight_number: "KL3333" }),
    ROW({ id: "d", flight_number: "KL4444" }),
  ];
  const results: Record<string, FlightLookupResult> = {
    a: ok(makeFlight({ flightNumber: "KL1111" })), // actief
    b: ok(makeFlight({ flightNumber: "KL2222", isLanded: true, status: { codes: ["LND"], label: "Landed" } })), // deactiveren
    c: { status: "not_found" },
    d: { status: "upstream_error", upstreamStatus: 500 },
  };
  const { deps, updates } = harness(rows, results);

  const summary = await pollActiveFlights(deps);
  assert.deepEqual(summary, { checked: 4, updated: 2, deactivated: 1, notFound: 1, errors: 1 });

  // a: volledige patch, actief
  assert.equal(updates.find((u) => u.id === "a")?.patch.is_active, true);
  // b: gedeactiveerd
  assert.equal(updates.find((u) => u.id === "b")?.patch.is_active, false);
  // c + d: alleen last_checked_at
  const c = updates.find((u) => u.id === "c")!;
  assert.deepEqual(Object.keys(c.patch), ["last_checked_at"]);
  assert.equal(c.patch.last_checked_at, NOW_ISO);
  const d = updates.find((u) => u.id === "d")!;
  assert.deepEqual(Object.keys(d.patch), ["last_checked_at"]);
});

test("pollActiveFlights — not_configured breekt de ronde af", async () => {
  const rows = [ROW({ id: "a", flight_number: "KL1111" }), ROW({ id: "b", flight_number: "KL2222" })];
  const results: Record<string, FlightLookupResult> = {
    a: { status: "not_configured" },
    b: ok(makeFlight()),
  };
  const { deps, updates } = harness(rows, results);
  const summary = await pollActiveFlights(deps);
  assert.equal(summary.aborted, "not_configured");
  assert.equal(summary.updated, 0);
  assert.equal(updates.length, 0, "geen enkele rij bijgewerkt bij afbreken");
});

test("pollActiveFlights — unauthorized breekt de ronde af", async () => {
  const rows = [ROW({ id: "a", flight_number: "KL1111" })];
  const { deps } = harness(rows, { a: { status: "unauthorized" } });
  const summary = await pollActiveFlights(deps);
  assert.equal(summary.aborted, "unauthorized");
});

test("pollActiveFlights — DB-fout op een rij telt als error en stopt de ronde niet", async () => {
  const rows = [ROW({ id: "a", flight_number: "KL1111" }), ROW({ id: "b", flight_number: "KL2222" })];
  const results: Record<string, FlightLookupResult> = { a: ok(makeFlight()), b: ok(makeFlight()) };
  const { deps } = harness(rows, results, async (id) => {
    if (id === "a") throw new Error("db down");
  });
  const summary = await pollActiveFlights(deps);
  assert.equal(summary.checked, 2);
  assert.equal(summary.errors, 1); // rij a faalde
  assert.equal(summary.updated, 1); // rij b lukte
});

test("pollActiveFlights — lege set levert een nul-samenvatting", async () => {
  const { deps } = harness([], {});
  const summary = await pollActiveFlights(deps);
  assert.deepEqual(summary, { checked: 0, updated: 0, deactivated: 0, notFound: 0, errors: 0 });
});
