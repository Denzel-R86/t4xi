/**
 * Tests voor de Schiphol-service: vluchtnummer-normalisatie, de pure
 * `normalizeFlight`-vertaling, de HTTP→toestand-mapping van `getFlightStatus` en
 * de `checkSchipholHealth`-interpretatie. Geen echt netwerk: de client krijgt een
 * gestubde `fetchImpl` en injecteerde credentials mee.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeFlightNumber,
  isValidFlightNumber,
  normalizeFlight,
  getFlightStatus,
  checkSchipholHealth,
} from "./service";
import { fetchSchipholFlights } from "./client";
import type { RawSchipholFlight } from "./types";

const CREDS = { appId: "test-id", apiKey: "test-key" };

/** Bouwt een fetchImpl die één vaste Response teruggeeft. */
function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}
/** fetchImpl die een netwerkfout gooit. */
const throwingFetch = (async () => {
  throw new Error("network down");
}) as unknown as typeof fetch;

// ── Vluchtnummer-normalisatie ────────────────────────────────────────────────

test("normalizeFlightNumber verwijdert scheidingstekens en maakt hoofdletters", () => {
  assert.equal(normalizeFlightNumber("kl 1234"), "KL1234");
  assert.equal(normalizeFlightNumber("KL-1234"), "KL1234");
  assert.equal(normalizeFlightNumber("  hv5321 "), "HV5321");
});

test("isValidFlightNumber accepteert geldige en weigert ongeldige nummers", () => {
  for (const ok of ["KL1234", "U24321", "BA2760A", "kl 1234"]) {
    assert.ok(isValidFlightNumber(ok), `${ok} zou geldig moeten zijn`);
  }
  for (const bad of ["", "XX", "K", "1234567890", "KL"]) {
    assert.ok(!isValidFlightNumber(bad), `${bad} zou ongeldig moeten zijn`);
  }
});

// ── normalizeFlight (puur) ───────────────────────────────────────────────────

const RAW_ARRIVAL: RawSchipholFlight = {
  flightName: "KL1234",
  flightNumber: 1234,
  flightDirection: "A",
  scheduleDate: "2026-08-02",
  scheduleTime: "14:30:00",
  scheduleDateTime: "2026-08-02T14:30:00.000+02:00",
  estimatedLandingTime: "2026-08-02T14:45:00.000+02:00",
  actualLandingTime: "2026-08-02T14:47:00.000+02:00",
  publicFlightState: { flightStates: ["DEL", "LND"] },
  route: { destinations: ["LHR"], eu: "E", visa: false },
  aircraftType: { iataMain: "73H", iataSub: "73H" },
  gate: undefined,
  pier: "D",
  terminal: 2,
  mainFlight: "KL1234",
  lastUpdatedAt: "2026-08-02T14:47:30.000+02:00",
};

const RAW_DEPARTURE: RawSchipholFlight = {
  flightName: "KL0602",
  flightDirection: "D",
  scheduleDate: "2026-08-02",
  scheduleDateTime: "2026-08-02T10:00:00.000+02:00",
  publicEstimatedOffBlockTime: "2026-08-02T10:20:00.000+02:00",
  publicFlightState: { flightStates: ["GTO", "BRD"] },
  route: { destinations: ["JFK"] },
  gate: "E18",
  pier: "E",
  terminal: 2,
};

test("normalizeFlight — aankomst: landingstijden, delay/landed en label", () => {
  const f = normalizeFlight(RAW_ARRIVAL);
  assert.equal(f.flightNumber, "KL1234");
  assert.equal(f.direction, "arrival");
  assert.equal(f.estimatedDateTime, "2026-08-02T14:45:00.000+02:00");
  assert.equal(f.actualDateTime, "2026-08-02T14:47:00.000+02:00");
  assert.equal(f.isDelayed, true);
  assert.equal(f.isLanded, true);
  assert.equal(f.isDeparted, false);
  assert.equal(f.status.label, "Delayed"); // eerste bekende code wint
  assert.deepEqual(f.status.codes, ["DEL", "LND"]);
  assert.deepEqual(f.routeIata, ["LHR"]);
  assert.equal(f.terminal, "2");
  assert.equal(f.pier, "D");
  assert.equal(f.gate, null);
  assert.equal(f.aircraftType, "73H");
});

test("normalizeFlight — vertrek: off-block-tijden, gate en label", () => {
  const f = normalizeFlight(RAW_DEPARTURE);
  assert.equal(f.direction, "departure");
  assert.equal(f.estimatedDateTime, "2026-08-02T10:20:00.000+02:00");
  assert.equal(f.actualDateTime, null);
  assert.equal(f.status.label, "Gate open");
  assert.equal(f.gate, "E18");
  assert.equal(f.isDelayed, false);
});

test("normalizeFlight — defensief bij lege/gedeeltelijke ruwe data", () => {
  const f = normalizeFlight({});
  assert.equal(f.flightNumber, "");
  assert.equal(f.direction, "departure"); // onbekende richting → departure
  assert.deepEqual(f.status.codes, []);
  assert.equal(f.status.label, "Unknown");
  assert.deepEqual(f.routeIata, []);
  assert.equal(f.gate, null);
  assert.equal(f.terminal, null);
  assert.equal(f.aircraftType, null);
});

// ── getFlightStatus (client geïnjecteerd) ────────────────────────────────────

test("getFlightStatus — ongeldig vluchtnummer → invalid_input (geen netwerk)", async () => {
  let called = false;
  const spyFetch = (async () => {
    called = true;
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  const r = await getFlightStatus("XX", {}, { fetchImpl: spyFetch, credentials: CREDS });
  assert.equal(r.status, "invalid_input");
  assert.equal(called, false, "de upstream mag niet geraakt worden");
});

test("getFlightStatus — geen treffers → not_found", async () => {
  const r = await getFlightStatus("KL1234", {}, {
    fetchImpl: fakeFetch(200, { flights: [] }),
    credentials: CREDS,
  });
  assert.equal(r.status, "not_found");
});

test("getFlightStatus — treffer → ok met genormaliseerde vlucht en matches", async () => {
  const r = await getFlightStatus("kl 1234", {}, {
    fetchImpl: fakeFetch(200, { flights: [RAW_ARRIVAL, RAW_ARRIVAL] }),
    credentials: CREDS,
  });
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.matches, 2);
  assert.equal(r.flight.flightNumber, "KL1234");
  assert.equal(r.flight.direction, "arrival");
});

test("getFlightStatus — 401 → unauthorized", async () => {
  const r = await getFlightStatus("KL1234", {}, {
    fetchImpl: fakeFetch(401, { message: "nope" }),
    credentials: CREDS,
  });
  assert.equal(r.status, "unauthorized");
});

test("getFlightStatus — 500 → upstream_error met upstreamStatus", async () => {
  const r = await getFlightStatus("KL1234", {}, {
    fetchImpl: fakeFetch(500, {}),
    credentials: CREDS,
  });
  assert.equal(r.status, "upstream_error");
  if (r.status !== "upstream_error") return;
  assert.equal(r.upstreamStatus, 500);
});

test("getFlightStatus — netwerkfout → upstream_error zonder status", async () => {
  const r = await getFlightStatus("KL1234", {}, { fetchImpl: throwingFetch, credentials: CREDS });
  assert.equal(r.status, "upstream_error");
  if (r.status !== "upstream_error") return;
  assert.equal(r.upstreamStatus, null);
});

test("getFlightStatus — ontbrekende credentials → not_configured", async () => {
  const saved = { id: process.env.SCHIPHOL_APP_ID, key: process.env.SCHIPHOL_API_KEY };
  delete process.env.SCHIPHOL_APP_ID;
  delete process.env.SCHIPHOL_API_KEY;
  try {
    // Geen credentials meegegeven → client valt terug op (lege) env.
    const r = await getFlightStatus("KL1234", {}, { fetchImpl: fakeFetch(200, { flights: [] }) });
    assert.equal(r.status, "not_configured");
  } finally {
    if (saved.id !== undefined) process.env.SCHIPHOL_APP_ID = saved.id;
    if (saved.key !== undefined) process.env.SCHIPHOL_API_KEY = saved.key;
  }
});

// ── client: request-opbouw ───────────────────────────────────────────────────

test("fetchSchipholFlights zet auth-headers, ResourceVersion en query", async () => {
  let captured: { url: string; headers: Record<string, string> } | null = null;
  const capturing = (async (url: string, init: RequestInit) => {
    const h = (init.headers ?? {}) as Record<string, string>;
    captured = { url: String(url), headers: h };
    return new Response(JSON.stringify({ flights: [] }), { status: 200 });
  }) as unknown as typeof fetch;

  await fetchSchipholFlights(
    { flightName: "KL1234", scheduleDate: "2026-08-02" },
    { fetchImpl: capturing, credentials: CREDS }
  );

  assert.ok(captured, "fetch is aangeroepen");
  const c = captured as { url: string; headers: Record<string, string> };
  assert.match(c.url, /\/public-flights\/flights\?/);
  assert.match(c.url, /flightName=KL1234/);
  assert.match(c.url, /scheduleDate=2026-08-02/);
  assert.equal(c.headers.app_id, "test-id");
  assert.equal(c.headers.app_key, "test-key");
  assert.equal(c.headers.ResourceVersion, "v4");
});

// ── checkSchipholHealth ──────────────────────────────────────────────────────

test("checkSchipholHealth — 200 → ok", async () => {
  const h = await checkSchipholHealth({ fetchImpl: fakeFetch(200, { flights: [] }), credentials: CREDS });
  assert.equal(h.ok, true);
  assert.equal(h.status, "ok");
  assert.equal(h.upstreamStatus, 200);
});

test("checkSchipholHealth — 403 → unauthorized", async () => {
  const h = await checkSchipholHealth({ fetchImpl: fakeFetch(403, {}), credentials: CREDS });
  assert.equal(h.ok, false);
  assert.equal(h.status, "unauthorized");
  assert.equal(h.upstreamStatus, 403);
});

test("checkSchipholHealth — 500 → unreachable", async () => {
  const h = await checkSchipholHealth({ fetchImpl: fakeFetch(500, {}), credentials: CREDS });
  assert.equal(h.ok, false);
  assert.equal(h.status, "unreachable");
  assert.equal(h.upstreamStatus, 500);
});

test("checkSchipholHealth — geen credentials → not_configured (geen netwerk)", async () => {
  let called = false;
  const spyFetch = (async () => {
    called = true;
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  const saved = { id: process.env.SCHIPHOL_APP_ID, key: process.env.SCHIPHOL_API_KEY };
  delete process.env.SCHIPHOL_APP_ID;
  delete process.env.SCHIPHOL_API_KEY;
  try {
    const h = await checkSchipholHealth({ fetchImpl: spyFetch });
    assert.equal(h.status, "not_configured");
    assert.equal(called, false);
  } finally {
    if (saved.id !== undefined) process.env.SCHIPHOL_APP_ID = saved.id;
    if (saved.key !== undefined) process.env.SCHIPHOL_API_KEY = saved.key;
  }
});
