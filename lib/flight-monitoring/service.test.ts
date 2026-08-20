/**
 * Tests voor de flight-monitoring service (Sprint 7.8A, B1–B3).
 * Pure kern + de batched pollronde met geïnjecteerde fakes — geen DB, geen netwerk.
 * Dekt: concurrency/claiming, landed-timeout, max-age expiry, 429-backoff, >100 vluchten.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRegistration,
  buildTripMonitoringRegistration,
  isTerminalFlight,
  backoffSeconds,
  landedTimeoutElapsed,
  isPastMaxAge,
  decidePatch,
  pollActiveFlights,
  type PollDeps,
} from "./service";
import type { PollConfig, ClaimedFlightRow, MonitoringUpdate } from "./types";
import type { NormalizedFlight, FlightLookupResult } from "@/lib/schiphol/types";

const CONFIG: PollConfig = {
  pollIntervalSec: 300,
  landedTimeoutMinutes: 90,
  maxAgeDays: 2,
  backoffBaseSec: 60,
  backoffMaxSec: 3600,
  batchSize: 50,
  maxBatches: 20,
};

const NOW = new Date("2026-08-02T12:00:00.000Z");
const NOW_FN = () => NOW;

function makeFlight(over: Partial<NormalizedFlight> = {}): NormalizedFlight {
  return {
    flightNumber: "KL1234", direction: "arrival", scheduleDate: "2026-08-02",
    scheduledDateTime: "2026-08-02T13:30:00.000Z", estimatedDateTime: "2026-08-02T13:45:00.000Z",
    actualDateTime: null, status: { codes: ["SCH"], label: "Scheduled" },
    isDelayed: false, isCancelled: false, isLanded: false, isDeparted: false,
    routeIata: ["LHR"], gate: null, pier: null, terminal: null, aircraftType: null,
    mainFlight: null, lastUpdatedAt: null, ...over,
  };
}
const ok = (f: NormalizedFlight): FlightLookupResult => ({ status: "ok", flight: f, matches: 1 });
const row = (over: Partial<ClaimedFlightRow> = {}): ClaimedFlightRow => ({
  id: "r1", booking_id: "b1", flight_number: "KL1234", schedule_date: "2026-08-02",
  direction: "arrival", created_at: "2026-08-02T06:00:00.000Z", retry_count: 0, ...over,
});

// ── buildRegistration ────────────────────────────────────────────────────────

test("buildRegistration — geldig levert params zonder is_active", () => {
  assert.deepEqual(
    buildRegistration({ bookingId: "b1", flightNumber: "kl 1234", scheduleDate: "2026-08-02", direction: "arrival" }),
    { booking_id: "b1", flight_number: "KL1234", schedule_date: "2026-08-02", direction: "arrival" }
  );
});
test("buildRegistration — ongeldig/ontbrekend → null", () => {
  assert.equal(buildRegistration({ bookingId: "", flightNumber: "KL1234", scheduleDate: null, direction: null }), null);
  assert.equal(buildRegistration({ bookingId: "b1", flightNumber: "XX", scheduleDate: null, direction: null }), null);
});

test("buildTripMonitoringRegistration — aankomende retourvlucht krijgt prioriteit", () => {
  assert.deepEqual(
    buildTripMonitoringRegistration({
      bookingId: "b1",
      outbound: {
        flightNumber: "KL1000",
        scheduleDate: "2026-09-01",
        direction: "departure",
      },
      returnLeg: {
        flightNumber: "KL2000",
        scheduleDate: "2026-09-05",
        direction: "arrival",
      },
    }),
    {
      booking_id: "b1",
      flight_number: "KL2000",
      schedule_date: "2026-09-05",
      direction: "arrival",
    },
  );
});

test("buildTripMonitoringRegistration — valt zonder geldige aankomst terug op outbound", () => {
  assert.deepEqual(
    buildTripMonitoringRegistration({
      bookingId: "b1",
      outbound: {
        flightNumber: "KL1000",
        scheduleDate: "2026-09-01",
        direction: "departure",
      },
      returnLeg: {
        flightNumber: "",
        scheduleDate: "2026-09-05",
        direction: "arrival",
      },
    }),
    {
      booking_id: "b1",
      flight_number: "KL1000",
      schedule_date: "2026-09-01",
      direction: "departure",
    },
  );
});

// ── backoff / lifecycle pure helpers ─────────────────────────────────────────

test("backoffSeconds — exponentieel met plafond", () => {
  assert.equal(backoffSeconds(1, CONFIG), 60);
  assert.equal(backoffSeconds(2, CONFIG), 120);
  assert.equal(backoffSeconds(3, CONFIG), 240);
  assert.equal(backoffSeconds(20, CONFIG), 3600); // gecapt
});

test("landedTimeoutElapsed — pas ná de timeout verstreken", () => {
  assert.equal(landedTimeoutElapsed(makeFlight({ actualDateTime: "2026-08-02T12:00:00.000Z" }), NOW, CONFIG), false); // net geland
  assert.equal(landedTimeoutElapsed(makeFlight({ actualDateTime: "2026-08-02T10:29:00.000Z" }), NOW, CONFIG), true);  // 91 min geleden
  assert.equal(landedTimeoutElapsed(makeFlight({ actualDateTime: null, estimatedDateTime: null }), NOW, CONFIG), false); // geen tijd → blijf volgen
});

test("isPastMaxAge — schedule_date ouder dan maxAgeDays", () => {
  assert.equal(isPastMaxAge({ schedule_date: "2026-07-30", created_at: NOW.toISOString() }, NOW, CONFIG), true);
  assert.equal(isPastMaxAge({ schedule_date: "2026-08-01", created_at: NOW.toISOString() }, NOW, CONFIG), false);
});

// ── decidePatch — lifecycle ──────────────────────────────────────────────────

test("decidePatch — actief (scheduled) → updated, actief, next_check gezet, retry 0", () => {
  const { patch, category } = decidePatch({ row: row(), result: ok(makeFlight()), now: NOW, config: CONFIG });
  assert.equal(category, "updated");
  assert.equal(patch.is_active, true);
  assert.equal(patch.retry_count, 0);
  assert.equal(patch.next_check_at, "2026-08-02T12:05:00.000Z"); // +300s
});

test("decidePatch — cancelled en departed stoppen direct", () => {
  for (const f of [makeFlight({ isCancelled: true }), makeFlight({ isDeparted: true })]) {
    const { patch, category } = decidePatch({ row: row(), result: ok(f), now: NOW, config: CONFIG });
    assert.equal(category, "deactivated");
    assert.equal(patch.is_active, false);
    assert.equal(patch.next_check_at, null);
  }
});

test("decidePatch — landed blijft actief vóór timeout, stopt erná", () => {
  const justLanded = decidePatch({ row: row(), result: ok(makeFlight({ isLanded: true, actualDateTime: "2026-08-02T12:00:00.000Z", status: { codes: ["LND"], label: "Landed" } })), now: NOW, config: CONFIG });
  assert.equal(justLanded.category, "updated");
  assert.equal(justLanded.patch.is_active, true);

  const longLanded = decidePatch({ row: row(), result: ok(makeFlight({ isLanded: true, actualDateTime: "2026-08-02T10:00:00.000Z", status: { codes: ["LND"], label: "Landed" } })), now: NOW, config: CONFIG });
  assert.equal(longLanded.category, "deactivated");
  assert.equal(longLanded.patch.is_active, false);
});

test("decidePatch — not_found: actief tenzij te oud", () => {
  const fresh = decidePatch({ row: row({ schedule_date: "2026-08-02" }), result: { status: "not_found" }, now: NOW, config: CONFIG });
  assert.equal(fresh.category, "notFound");
  assert.equal(fresh.patch.is_active, true);

  const stale = decidePatch({ row: row({ schedule_date: "2026-07-25" }), result: { status: "not_found" }, now: NOW, config: CONFIG });
  assert.equal(stale.category, "deactivated");
  assert.equal(stale.patch.is_active, false);
});

test("decidePatch — max-age overrulet zelfs een actieve ok-vlucht", () => {
  const { patch, category } = decidePatch({ row: row({ schedule_date: "2026-07-20" }), result: ok(makeFlight()), now: NOW, config: CONFIG });
  assert.equal(category, "deactivated");
  assert.equal(patch.is_active, false);
});

// ── decidePatch — fouten & 429 ───────────────────────────────────────────────

test("decidePatch — upstream 500 → error, backoff, retry_count++", () => {
  const { patch, category } = decidePatch({ row: row({ retry_count: 1 }), result: { status: "upstream_error", upstreamStatus: 500 }, now: NOW, config: CONFIG });
  assert.equal(category, "error");
  assert.equal(patch.is_active, true);
  assert.equal(patch.retry_count, 2);
  assert.equal(patch.next_check_at, "2026-08-02T12:02:00.000Z"); // +backoff(2)=120s
});

test("decidePatch — 429 respecteert Retry-After (ondergrens = backoff-basis)", () => {
  const big = decidePatch({ row: row(), result: { status: "upstream_error", upstreamStatus: 429, retryAfterSeconds: 120 }, now: NOW, config: CONFIG });
  assert.equal(big.category, "rateLimited");
  assert.equal(big.patch.next_check_at, "2026-08-02T12:02:00.000Z"); // max(120,60)=120s

  const small = decidePatch({ row: row(), result: { status: "upstream_error", upstreamStatus: 429, retryAfterSeconds: 5 }, now: NOW, config: CONFIG });
  assert.equal(small.patch.next_check_at, "2026-08-02T12:01:00.000Z"); // max(5,60)=60s
});

// ── isTerminalFlight ─────────────────────────────────────────────────────────

test("isTerminalFlight", () => {
  assert.equal(isTerminalFlight(makeFlight({ isLanded: true })), true);
  assert.equal(isTerminalFlight(makeFlight()), false);
});

// ── pollActiveFlights — batched draining + concurrency ───────────────────────

function harness(batches: ClaimedFlightRow[][], resultFor: (fn: string) => FlightLookupResult, applyImpl?: (id: string, p: MonitoringUpdate) => Promise<void>) {
  const updates: Array<{ id: string; patch: MonitoringUpdate }> = [];
  let call = 0;
  let getFlightCalls = 0;
  const deps: PollDeps = {
    claimBatch: async () => batches[call++] ?? [],
    applyUpdate: async (id, patch) => { if (applyImpl) return applyImpl(id, patch); updates.push({ id, patch }); },
    getFlight: async (fn) => { getFlightCalls += 1; return resultFor(fn); },
    now: NOW_FN,
  };
  return { deps, updates, stats: () => ({ getFlightCalls }) };
}

test("pollActiveFlights — >100 actieve vluchten worden gedraineerd (geen limit=100)", async () => {
  const rows = Array.from({ length: 150 }, (_, i) => row({ id: `r${i}`, flight_number: "KL1234" }));
  const batches = [rows.slice(0, 50), rows.slice(50, 100), rows.slice(100, 150)]; // batchSize 50
  const { deps, updates } = harness(batches, () => ok(makeFlight()));
  const s = await pollActiveFlights(deps, CONFIG);
  assert.equal(s.claimed, 150);
  assert.equal(s.updated, 150);
  assert.equal(s.batches, 3);
  assert.equal(updates.length, 150);
});

test("pollActiveFlights — concurrency: reeds-geclaimde rijen (lege claim) → niets gedaan", async () => {
  // Simuleert een tweede, gelijktijdige run: de claim levert niets (andere run had ze).
  const { deps, updates, stats } = harness([[]], () => ok(makeFlight()));
  const s = await pollActiveFlights(deps, CONFIG);
  assert.deepEqual({ claimed: s.claimed, updated: s.updated, batches: s.batches }, { claimed: 0, updated: 0, batches: 0 });
  assert.equal(updates.length, 0);
  assert.equal(stats().getFlightCalls, 0, "geen enkele Schiphol-call zonder geclaimde rijen");
});

test("pollActiveFlights — mix: updated/deactivated/notFound/rateLimited/error", async () => {
  const rows = [
    row({ id: "a", flight_number: "AA1" }),
    row({ id: "b", flight_number: "BB2" }),
    row({ id: "c", flight_number: "CC3" }),
    row({ id: "d", flight_number: "DD4" }),
    row({ id: "e", flight_number: "EE5" }),
  ];
  const map: Record<string, FlightLookupResult> = {
    AA1: ok(makeFlight()),
    BB2: ok(makeFlight({ isLanded: true, actualDateTime: "2026-08-02T09:00:00.000Z" })), // >90min → deactiveren
    CC3: { status: "not_found" },
    DD4: { status: "upstream_error", upstreamStatus: 429, retryAfterSeconds: 30 },
    EE5: { status: "upstream_error", upstreamStatus: 503 },
  };
  const { deps } = harness([rows], (fn) => map[fn]);
  const s = await pollActiveFlights(deps, CONFIG);
  assert.deepEqual(s, { claimed: 5, updated: 1, deactivated: 1, notFound: 1, errors: 1, rateLimited: 1, batches: 1 });
});

test("pollActiveFlights — not_configured breekt af, geen updates", async () => {
  const { deps, updates } = harness([[row({ id: "a", flight_number: "AA1" })]], () => ({ status: "not_configured" }));
  const s = await pollActiveFlights(deps, CONFIG);
  assert.equal(s.aborted, "not_configured");
  assert.equal(updates.length, 0);
});

test("pollActiveFlights — unauthorized breekt af", async () => {
  const { deps } = harness([[row({ id: "a", flight_number: "AA1" })]], () => ({ status: "unauthorized" }));
  const s = await pollActiveFlights(deps, CONFIG);
  assert.equal(s.aborted, "unauthorized");
});

test("pollActiveFlights — DB-fout op een rij telt als error en breekt de ronde niet", async () => {
  const rows = [row({ id: "a", flight_number: "AA1" }), row({ id: "b", flight_number: "BB2" })];
  const { deps } = harness([rows], () => ok(makeFlight()), async (id) => { if (id === "a") throw new Error("db down"); });
  const s = await pollActiveFlights(deps, CONFIG);
  assert.equal(s.errors, 1);
  assert.equal(s.updated, 1);
});
