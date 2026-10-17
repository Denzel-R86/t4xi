import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { POST as book } from "@/app/api/bookings/route";
import { amsterdamDepartureIso } from "@/lib/pricing/departure-time";
import { quoteFingerprint, type AirportContext } from "@/lib/pricing/service";
import { decideReplay } from "@/lib/bookings/replay";

/**
 * F-45 — replay van een quote-lock-boeking op de ECHTE boekingsroute.
 *
 * Supabase en Resend worden op het netwerk-seam vervangen (globalThis.fetch). De
 * nep-RPC gedraagt zich als `create_booking_from_snapshot`: de eerste aanroep
 * maakt de boeking (reused=false, vluchtnummer uit de RPC opgeslagen), elke
 * volgende met dezelfde quote geeft dezelfde boeking terug (reused=true).
 * Bewezen wordt dat een replay de bestaande boeking niet muteert: geen
 * bookings-PATCH, geen register_flight_monitoring, geen communicatie.
 */

const SUPABASE = "http://supabase.f45.test";
const RESEND = "https://api.resend.com";
const QID = "0192f0c0-0000-7000-8000-0000000f4501";
const BOOKING_ID = "45454545-4545-4545-8545-454545454545";
const BOOKING_REF = "T4XI-2099-0045";
const DATE = "2099-03-10";
const TIME = "10:00";
const RET_DATE = "2099-03-12";
const RET_TIME = "18:00";
const DEP = amsterdamDepartureIso(DATE, TIME)!;
const RET = amsterdamDepartureIso(RET_DATE, RET_TIME)!;

/** Brengen náár Schiphol: vertrekkende vlucht heen, aankomende vlucht retour. */
const TO_AIRPORT: AirportContext = {
  pickupIsAirport: false,
  dropoffIsAirport: true,
  isAirportPickup: false,
  isAirportDropoff: true,
  isAirportTransfer: true,
  flightDirection: "departure",
};

const retour = {
  rideType: "retour",
  pickup: "Almere Poort, Almere",
  dropoff: "Schiphol Airport",
  date: DATE,
  time: TIME,
  returnDate: RET_DATE,
  returnTime: RET_TIME,
  flightNumber: "KL1001",
  returnFlightNumber: "KL1002",
  // Simulatoradres: altijd toegestaan door de ontvangers-vangrail, ook buiten productie.
  customerName: "Test Klant",
  customerEmail: "delivered@resend.dev",
  customerPhone: "+31612345678",
  persons: 2,
  luggage: "handbagage",
  quoteId: QID,
};

type Call = { method: string; path: string; body: unknown };
let calls: Call[] = [];
/** De "database"-rij van de boeking (null = nog niet gemaakt). */
let bookingRow: Record<string, unknown> | null = null;
let snapshotRow: Record<string, unknown>;
const realFetch = globalThis.fetch;
const savedEnv = { ...process.env };
let ipSeq = 0;
let claimSeq = 0;
/** Optioneel: houdt de retourvelden-PATCH vast tot de test hem vrijgeeft. */
let holdReturnPatch: Promise<void> | null = null;
let releaseHold: (() => void) | null = null;

function snapshot(fingerprint: string, returnApplied: boolean) {
  return {
    quote_id: QID,
    pricing_version: "2026.07.v1",
    pricing_source: "dynamic",
    currency: "EUR",
    subtotal_cents: 19900,
    total_cents: 19900,
    route_snapshot: {
      pickupSlug: "almere-poort-almere",
      dropoffSlug: "schiphol-airport",
      vehicleClass: "executive-ev",
      distanceKm: 39,
      estimatedDurationMin: 38,
      source: "dynamic",
      sourceLabel: null,
      validFrom: null,
      returnApplied,
      vatRate: 9,
      fingerprint,
      airport: TO_AIRPORT,
    },
    calculated_at: "2099-01-01T00:00:00.000Z",
    expires_at: "2999-01-01T00:00:00.000Z",
  };
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** Laat de event loop draaien zodat gelijktijdige requests echt door elkaar lopen. */
const tick = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  process.env.RESEND_API_KEY = "re_test_offline_fixture";
  calls = [];
  bookingRow = null;
  claimSeq = 0;
  holdReturnPatch = null;
  snapshotRow = snapshot(
    quoteFingerprint({
      pickup: retour.pickup,
      dropoff: retour.dropoff,
      returnTrip: true,
      departureAt: DEP,
      returnDepartureAt: RET,
    }),
    true
  );

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const raw = typeof init?.body === "string" ? init.body : null;
    let body: unknown = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = raw;
    }
    calls.push({ method, path: url.origin + url.pathname + url.search, body });
    await tick();

    if (url.origin === RESEND) return jsonResponse(200, { id: `msg_${calls.length}` });
    if (url.origin !== SUPABASE) return jsonResponse(404, { error: "offline test" });

    const accept = new Headers(init?.headers).get("accept") ?? "";
    const one = (row: unknown) =>
      accept.includes("vnd.pgrst.object")
        ? row
          ? jsonResponse(200, row)
          : jsonResponse(406, { code: "PGRST116", message: "0 rows" })
        : jsonResponse(200, row ? [row] : []);

    if (url.pathname === "/rest/v1/price_snapshots" && method === "GET") {
      const hit = url.searchParams.get("quote_id") === `eq.${QID}` ? snapshotRow : null;
      return one(hit);
    }
    if (url.pathname === "/rest/v1/rpc/create_booking_from_snapshot") {
      const p = body as Record<string, unknown>;
      if (p.p_expected_fingerprint !== (snapshotRow.route_snapshot as { fingerprint: string }).fingerprint) {
        return jsonResponse(400, { code: "P0001", message: "QUOTE_MISMATCH" });
      }
      if (bookingRow) {
        return jsonResponse(200, [{ booking_ref: BOOKING_REF, booking_id: BOOKING_ID, price_euros: 199, reused: true }]);
      }
      // Zoals create_booking(): vluchtnummer + richting in dezelfde transactie;
      // de retourvelden komen pas in de nabewerking van de route.
      bookingRow = {
        id: BOOKING_ID,
        booking_ref: BOOKING_REF,
        flight_number: p.p_flight_number ?? null,
        flight_direction: p.p_flight_direction ?? null,
        return_date: null,
        return_time: null,
        return_flight_number: null,
        email_sent: false,
      };
      return jsonResponse(200, [{ booking_ref: BOOKING_REF, booking_id: BOOKING_ID, price_euros: 199, reused: false }]);
    }
    if (url.pathname === "/rest/v1/bookings") {
      if (method === "GET") return one(bookingRow);
      if (method === "PATCH" && bookingRow) {
        if (holdReturnPatch && (body as Record<string, unknown>)?.return_date !== undefined) await holdReturnPatch;
        Object.assign(bookingRow, body as Record<string, unknown>);
        return jsonResponse(204, undefined);
      }
    }
    if (url.pathname === "/rest/v1/rpc/claim_communication_delivery") {
      claimSeq += 1;
      return jsonResponse(200, { claimed: true, id: `delivery-${claimSeq}` });
    }
    // Overige best-effort writes (settle, monitoring).
    return jsonResponse(method === "GET" ? 200 : 204, method === "GET" ? [] : undefined);
  }) as typeof fetch;
});

afterEach(() => {
  releaseHold?.();
  releaseHold = null;
  globalThis.fetch = realFetch;
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
});

function post(body: Record<string, unknown>): Promise<Response> {
  ipSeq += 1;
  return book(
    new Request("https://www.t4xi.nl/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `198.51.100.${ipSeq}` },
      body: JSON.stringify(body),
    })
  );
}

const at = (suffix: string) => calls.filter((c) => c.path.startsWith(SUPABASE + suffix));
const lockCalls = () => at("/rest/v1/rpc/create_booking_from_snapshot");
const bookingWrites = () => at("/rest/v1/bookings").filter((c) => c.method !== "GET");
const monitoringCalls = () => at("/rest/v1/rpc/register_flight_monitoring");
const commCalls = () => [
  ...at("/rest/v1/rpc/claim_communication_delivery"),
  ...calls.filter((c) => c.path.startsWith(RESEND)),
];
const sideEffects = () => ({
  bookingWrites: bookingWrites().length,
  monitoring: monitoringCalls().length,
  communication: commCalls().length,
});

type Ok = { ok: true; bookingRef: string; bookingId: string; price: number; status: string; quoteOnRequest: boolean; returnApplied: boolean };
type Err = { ok: false; error: string; bookingId?: string; bookingRef?: string };

async function firstBooking(): Promise<Ok> {
  const res = await post(retour);
  assert.equal(res.status, 201);
  const out = (await res.json()) as Ok;
  assert.ok(monitoringCalls().length === 1 && bookingWrites().length >= 1, "eerste boeking doet de nabewerking");
  assert.ok(commCalls().length > 0, "eerste boeking publiceert booking.created");
  assert.equal(bookingRow?.return_flight_number, "KL1002");
  calls = [];
  return out;
}

// ── Replay met identieke gegevens ──────────────────────────────────────────────

test("F-45: replay met identieke gegevens → zelfde response, geen enkele nabewerking", async () => {
  const original = await firstBooking();
  const before = { ...bookingRow };

  const res = await post(retour);
  assert.equal(res.status, 201);
  const replay = (await res.json()) as Ok;
  assert.deepEqual(replay, original, "response identiek aan de oorspronkelijke (zelfde bookingId, prijs uit de DB)");
  assert.equal(replay.price, 199);

  assert.equal(lockCalls().length, 1);
  assert.deepEqual(sideEffects(), { bookingWrites: 0, monitoring: 0, communication: 0 });
  assert.deepEqual(bookingRow, before, "bestaande boeking ongewijzigd");
});

// ── Replay met gewijzigde vluchtgegevens ───────────────────────────────────────

test("F-45: replay met ander (retour)vluchtnummer → 409 booking_exists, boeking ongewijzigd, geen bookingId", async () => {
  await firstBooking();
  const before = { ...bookingRow };

  for (const changed of [
    { returnFlightNumber: "HV9999" },
    { flightNumber: "HV1234" },
    { flightNumber: "" },
    { flightNumber: "HV1234", returnFlightNumber: "HV9999" },
  ]) {
    calls = [];
    const res = await post({ ...retour, ...changed });
    assert.equal(res.status, 409, JSON.stringify(changed));
    const out = (await res.json()) as Err;
    assert.equal(out.ok, false);
    assert.equal(out.error, "booking_exists");
    assert.equal(out.bookingId, undefined, "geen betaalsleutel bij afwijkende replay");
    assert.equal(out.bookingRef, undefined);
    assert.deepEqual(sideEffects(), { bookingWrites: 0, monitoring: 0, communication: 0 }, JSON.stringify(changed));
    assert.deepEqual(bookingRow, before, `boeking ongewijzigd na ${JSON.stringify(changed)}`);
  }
});

test("F-45: vluchtnummer anders geschreven maar genormaliseerd gelijk → geldt als identieke replay", async () => {
  const original = await firstBooking();
  const res = await post({ ...retour, flightNumber: "kl 1001", returnFlightNumber: "KL-1002" });
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), original);
  assert.deepEqual(sideEffects(), { bookingWrites: 0, monitoring: 0, communication: 0 });
});

// ── Gelijktijdige dubbele submit ───────────────────────────────────────────────

test("F-45: twee gelijktijdige requests (enkele rit) → één boeking, één nabewerking, beide 201 met dezelfde boeking", async () => {
  const enkel = { ...retour, rideType: "enkel", returnDate: undefined, returnTime: undefined, returnFlightNumber: undefined };
  snapshotRow = snapshot(
    quoteFingerprint({ pickup: enkel.pickup, dropoff: enkel.dropoff, returnTrip: false, departureAt: DEP }),
    false
  );

  const [a, b] = await Promise.all([post(enkel), post(enkel)]);
  const outs = [(await a.json()) as Ok, (await b.json()) as Ok];
  assert.deepEqual([a.status, b.status], [201, 201]);
  assert.deepEqual(outs[0], outs[1], "beide responses identiek");
  assert.equal(outs[0].bookingId, BOOKING_ID);

  const results = lockCalls().length;
  assert.equal(results, 2, "beide requests bereiken de RPC");
  assert.equal(monitoringCalls().length, 1, "één monitoringregistratie");
  // Klantbericht wordt geclaimd; het ops-bericht stopt buiten productie al bij de allowlist.
  assert.equal(at("/rest/v1/rpc/claim_communication_delivery").length, 1, "één booking.created-dispatch");
  assert.equal(calls.filter((c) => c.path.startsWith(RESEND)).length, 1, "precies één mail naar de klant");
  assert.equal(bookingRow?.flight_number, "KL1001");
});

test("F-45: twee gelijktijdige retour-requests → één boeking en één nabewerking; de tweede krijgt de boeking of een 409 om opnieuw te proberen, nooit een mutatie", async () => {
  const [a, b] = await Promise.all([post(retour), post(retour)]);
  const responses = [
    { status: a.status, body: (await a.json()) as Ok | Err },
    { status: b.status, body: (await b.json()) as Ok | Err },
  ];
  const created = responses.filter((r) => r.status === 201);
  assert.ok(created.length >= 1);
  for (const r of created) assert.equal((r.body as Ok).bookingId, BOOKING_ID);
  for (const r of responses.filter((x) => x.status !== 201)) {
    assert.equal(r.status, 409);
    assert.equal((r.body as Err).error, "quote_conflict");
    assert.equal((r.body as Err).bookingId, undefined);
  }
  assert.equal(monitoringCalls().length, 1, "één monitoringregistratie");
  assert.equal(at("/rest/v1/rpc/claim_communication_delivery").length, 1, "één booking.created-dispatch");
  assert.equal(calls.filter((c) => c.path.startsWith(RESEND)).length, 1, "precies één mail");
  const retourPatches = bookingWrites().filter((c) => (c.body as Record<string, unknown>)?.return_date !== undefined);
  assert.equal(retourPatches.length, 1, "retourvelden één keer geschreven");
  assert.equal(bookingRow?.return_flight_number, "KL1002");

  // Daarna (nabewerking klaar) geeft een retry gewoon de bestaande boeking terug.
  calls = [];
  const retry = await post(retour);
  assert.equal(retry.status, 201);
  assert.equal(((await retry.json()) as Ok).bookingId, BOOKING_ID);
  assert.deepEqual(sideEffects(), { bookingWrites: 0, monitoring: 0, communication: 0 });
});

test("F-45: replay terwijl de eerste request zijn retourvelden nog schrijft → 409 quote_conflict, geen bookingId, geen mutatie", { timeout: 10_000 }, async () => {
  let release!: () => void;
  holdReturnPatch = new Promise<void>((resolve) => (release = resolve));
  releaseHold = release;

  const first = post(retour);
  // Wacht tot de eerste request de boeking heeft gemaakt en aan de nabewerking hangt.
  while (!bookingRow) await tick();

  const second = await post(retour);
  assert.equal(second.status, 409);
  const out = (await second.json()) as Err;
  assert.equal(out.error, "quote_conflict");
  assert.equal(out.bookingId, undefined, "zolang niet te verifiëren: geen betaalsleutel");

  release();
  const firstRes = await first;
  assert.equal(firstRes.status, 201);
  assert.equal(((await firstRes.json()) as Ok).bookingId, BOOKING_ID);
  assert.equal(monitoringCalls().length, 1, "alleen de eerste request registreert monitoring");
  assert.equal(at("/rest/v1/rpc/claim_communication_delivery").length, 1, "alleen de eerste request dispatcht");
  assert.equal(bookingRow?.return_flight_number, "KL1002");
});

// ── Andere rit ─────────────────────────────────────────────────────────────────

test("F-45: replay met een andere rit → 409 quote_mismatch zoals vandaag, geen bookingId, geen mutatie", async () => {
  await firstBooking();
  const before = { ...bookingRow };
  for (const tampered of [{ time: "11:00" }, { returnTime: "19:00" }, { pickup: "Amsterdam Centrum" }]) {
    calls = [];
    const res = await post({ ...retour, ...tampered });
    assert.equal(res.status, 409, JSON.stringify(tampered));
    const out = (await res.json()) as Err;
    assert.equal(out.error, "quote_mismatch");
    assert.equal(out.bookingId, undefined);
    assert.equal(lockCalls().length, 0, "app-check stopt vóór de RPC");
    assert.deepEqual(sideEffects(), { bookingWrites: 0, monitoring: 0, communication: 0 });
  }
  assert.deepEqual(bookingRow, before);
});

// ── Pure beslisregel ───────────────────────────────────────────────────────────

test("F-45 decideReplay: gelijk / afwijkend / retourvelden nog niet geschreven", () => {
  const stored = { flight_number: "KL1001", return_date: "2099-03-12", return_flight_number: "KL1002" };
  const same = { flightNumber: "KL1001", returnTrip: true, returnFlightNumber: "KL1002" };
  assert.deepEqual(decideReplay(stored, same), { kind: "return_existing" });
  assert.deepEqual(decideReplay(stored, { ...same, returnFlightNumber: "" }), { kind: "conflict" });
  assert.deepEqual(decideReplay(stored, { ...same, flightNumber: "" }), { kind: "conflict" });
  assert.deepEqual(decideReplay({ ...stored, return_date: null }, same), { kind: "pending" });
  assert.deepEqual(
    decideReplay({ flight_number: null, return_date: null, return_flight_number: null }, { flightNumber: "", returnTrip: false, returnFlightNumber: "" }),
    { kind: "return_existing" }
  );
});
