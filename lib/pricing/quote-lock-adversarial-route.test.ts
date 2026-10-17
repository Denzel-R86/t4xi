import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { POST as book } from "@/app/api/bookings/route";
import { amsterdamDepartureIso } from "@/lib/pricing/departure-time";
import { NO_AIRPORT, quoteFingerprint } from "@/lib/pricing/service";

/**
 * S3 (masterplan §9) — adversarial tests op de ECHTE boekingsroute.
 *
 * Supabase wordt op het netwerk-seam vervangen (globalThis.fetch → nep-PostgREST),
 * dus de route, resolveBookingPrice, readPriceSnapshot en de supabase-js-client
 * draaien ongewijzigd. Bewezen wordt wat de ROUTE doet met vijandige invoer:
 *   · welke parameters naar create_booking_from_snapshot gaan (nooit een prijs);
 *   · dat een gewijzigde rit / verlopen / onbekende quote vóór de RPC stopt;
 *   · dat het bedrag in de response uit de database (snapshot) komt.
 * De SQL-kant (vergrendeling, consumptie, hergebruik) is als broncode-lock
 * vastgelegd in quote-lock-adversarial.test.ts.
 */

const SUPABASE = "http://supabase.s3.test";
const QID = "0192f0c0-0000-7000-8000-0000000053a1";
const DATE = "2099-03-10";
const TIME = "10:00";
const RET_DATE = "2099-03-12";
const RET_TIME = "18:00";
const DEP = amsterdamDepartureIso(DATE, TIME)!;
const RET = amsterdamDepartureIso(RET_DATE, RET_TIME)!;

const base = {
  rideType: "enkel",
  pickup: "Almere Poort, Almere",
  dropoff: "Almere Buiten, Almere",
  date: DATE,
  time: TIME,
  customerName: "Test Klant",
  customerEmail: "test@example.com",
  customerPhone: "+31612345678",
  persons: 2,
  luggage: "handbagage",
  quoteId: QID,
};

type Call = { method: string; path: string; body: unknown };
let calls: Call[] = [];
let snapshotRow: Record<string, unknown> | null = null;
let rpcResult: { status: number; body: unknown } = { status: 200, body: [] };
const realFetch = globalThis.fetch;
let ipSeq = 0;

function row(over: { fingerprint?: string; expiresAt?: string; totalCents?: number; returnApplied?: boolean } = {}) {
  return {
    quote_id: QID,
    pricing_version: "2026.07.v1",
    pricing_source: "dynamic",
    currency: "EUR",
    subtotal_cents: over.totalCents ?? 3300,
    total_cents: over.totalCents ?? 3300,
    route_snapshot: {
      pickupSlug: "almere-poort-almere",
      dropoffSlug: "almere-buiten-almere",
      vehicleClass: "executive-ev",
      distanceKm: 13.7,
      estimatedDurationMin: 12,
      source: "dynamic",
      sourceLabel: null,
      validFrom: null,
      returnApplied: over.returnApplied ?? false,
      vatRate: 9,
      fingerprint:
        over.fingerprint ??
        quoteFingerprint({ pickup: base.pickup, dropoff: base.dropoff, returnTrip: false, departureAt: DEP }),
      airport: NO_AIRPORT,
    },
    calculated_at: "2099-01-01T00:00:00.000Z",
    expires_at: over.expiresAt ?? "2999-01-01T00:00:00.000Z",
  };
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  calls = [];
  snapshotRow = row();
  rpcResult = {
    status: 200,
    body: [{ booking_ref: "T4XI-2099-0001", booking_id: "11111111-1111-4111-8111-111111111111", price_euros: 33, reused: false }],
  };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const raw = typeof init?.body === "string" ? init.body : null;
    calls.push({ method, path: url.pathname + url.search, body: raw ? JSON.parse(raw) : null });
    if (url.origin !== SUPABASE) return jsonResponse(404, { error: "offline test" });
    if (url.pathname === "/rest/v1/price_snapshots" && method === "GET") {
      const wanted = url.searchParams.get("quote_id");
      const hit = snapshotRow && wanted === `eq.${String(snapshotRow.quote_id)}` ? snapshotRow : null;
      const accept = new Headers(init?.headers).get("accept") ?? "";
      if (accept.includes("vnd.pgrst.object")) {
        return hit ? jsonResponse(200, hit) : jsonResponse(406, { code: "PGRST116", message: "0 rows" });
      }
      return jsonResponse(200, hit ? [hit] : []);
    }
    if (url.pathname === "/rest/v1/rpc/create_booking_from_snapshot") {
      return jsonResponse(rpcResult.status, rpcResult.body);
    }
    if (url.pathname === "/rest/v1/rpc/create_booking") {
      return jsonResponse(200, [{ booking_ref: "T4XI-2099-0002", booking_id: "22222222-2222-4222-8222-222222222222" }]);
    }
    if (url.pathname === "/rest/v1/bookings" && method === "GET") {
      // F-45: de route leest bij reused=true alleen de vluchtvelden van de
      // bestaande boeking. Deze rit (geen luchthaven, enkel) heeft er geen.
      const stored = { flight_number: null, return_date: null, return_flight_number: null };
      const accept = new Headers(init?.headers).get("accept") ?? "";
      return jsonResponse(200, accept.includes("vnd.pgrst.object") ? stored : [stored]);
    }
    // Overige best-effort writes (communicatielog, retourvelden, monitoring).
    return jsonResponse(method === "GET" ? 200 : 204, method === "GET" ? [] : undefined);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function post(body: Record<string, unknown>): Promise<Response> {
  ipSeq += 1;
  return book(
    new Request("https://www.t4xi.nl/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `192.0.2.${ipSeq}` },
      body: JSON.stringify(body),
    })
  );
}

const lockCalls = () => calls.filter((c) => c.path === "/rest/v1/rpc/create_booking_from_snapshot");
const plainCreateCalls = () => calls.filter((c) => c.path === "/rest/v1/rpc/create_booking");
const PRICE_KEY = /price|total|subtotal|amount|discount|korting|event|breakdown|adjust|cents|vat|btw|source/i;

// ── Prijsvelden in de payload worden genegeerd ─────────────────────────────────

test("S3 route: prijs-, totaal-, korting-, event- en breakdownvelden in de body bereiken de RPC niet", async () => {
  const res = await post({
    ...base,
    price: 1,
    priceEuros: 1,
    price_euros: 1,
    total: 1,
    totalCents: 100,
    subtotalCents: 100,
    discount: 32,
    discountCents: 3200,
    eventFee: -10,
    eventFeeCents: -1000,
    pricingSource: "promotion",
    vatRate: 0,
    priceBreakdown: {
      subtotalCents: 100,
      totalCents: 100,
      adjustments: [{ kind: "discount", amountCents: -3200 }],
    },
  });
  assert.equal(res.status, 201);
  const out = (await res.json()) as { price: number; quoteOnRequest: boolean };
  assert.equal(out.price, 33, "bedrag in de response komt uit de snapshot-RPC, niet uit de body");
  assert.equal(out.quoteOnRequest, false);

  assert.equal(lockCalls().length, 1);
  const params = lockCalls()[0].body as Record<string, unknown>;
  const leaked = Object.keys(params).filter((k) => PRICE_KEY.test(k));
  assert.deepEqual(leaked, [], `prijsachtige parameters naar de RPC: ${leaked.join(",")}`);
  assert.equal(params.p_quote_id, QID);
  assert.equal(plainCreateCalls().length, 0, "met quoteId nooit het create_booking-pad (met p_price_euros)");
});

test("S3 route: de response-prijs volgt de database, ook als die afwijkt van de app-snapshot", async () => {
  // Race: tussen app-check en RPC kan de DB het enige gezag zijn — de route neemt price_euros uit de RPC-rij.
  rpcResult = { status: 200, body: [{ booking_ref: "T4XI-2099-0003", booking_id: "33333333-3333-4333-8333-333333333333", price_euros: 41.5, reused: false }] };
  const res = await post({ ...base, price: 1 });
  assert.equal(res.status, 201);
  assert.equal(((await res.json()) as { price: number }).price, 41.5);
});

// ── Rit gewijzigd na de offerte ────────────────────────────────────────────────

test("S3 route: andere route, datum of tijd dan in de quote → 409 quote_mismatch, geen RPC", async () => {
  for (const tampered of [
    { dropoff: "Schiphol Airport" },
    { pickup: "Amsterdam Centrum" },
    { date: "2099-03-11" },
    { time: "23:30" },
    { rideType: "retour", returnDate: RET_DATE, returnTime: RET_TIME },
  ]) {
    calls = [];
    const res = await post({ ...base, ...tampered });
    assert.equal(res.status, 409, JSON.stringify(tampered));
    assert.equal(((await res.json()) as { error: string }).error, "quote_mismatch");
    assert.equal(lockCalls().length + plainCreateCalls().length, 0, `geen boeking bij ${JSON.stringify(tampered)}`);
  }
});

test("S3 route (F-29/F-31): retour met gewijzigde returnDate/returnTime na de quote → 409, geen RPC", async () => {
  snapshotRow = row({
    returnApplied: true,
    totalCents: 6000,
    fingerprint: quoteFingerprint({
      pickup: base.pickup,
      dropoff: base.dropoff,
      returnTrip: true,
      departureAt: DEP,
      returnDepartureAt: RET,
    }),
  });
  const retour = { ...base, rideType: "retour", returnDate: RET_DATE, returnTime: RET_TIME };

  const ok = await post(retour);
  assert.equal(ok.status, 201, "ongewijzigde retour boekt");
  assert.equal(lockCalls().length, 1);
  assert.equal(
    (lockCalls()[0].body as Record<string, unknown>).p_expected_fingerprint,
    snapshotRow.route_snapshot && (snapshotRow.route_snapshot as { fingerprint: string }).fingerprint,
    "RPC krijgt dezelfde vingerafdruk inclusief retourmoment"
  );

  for (const tampered of [{ returnTime: "23:30" }, { returnDate: "2099-03-13" }]) {
    calls = [];
    const res = await post({ ...retour, ...tampered });
    assert.equal(res.status, 409, JSON.stringify(tampered));
    assert.equal(((await res.json()) as { error: string }).error, "quote_mismatch");
    assert.equal(lockCalls().length, 0);
  }
});

test("S3 route: passagiers/bagage wijzigen verandert de prijs niet; capaciteit gaat mee naar de RPC", async () => {
  const res = await post({ ...base, persons: 4, luggage: "1-2-koffers" });
  assert.equal(res.status, 201);
  assert.equal(((await res.json()) as { price: number }).price, 33);
  const params = lockCalls()[0].body as Record<string, unknown>;
  assert.equal(params.p_persons, 4, "DB controleert capaciteit op de werkelijke passagiers");
  assert.equal(params.p_luggage, "1-2-koffers");
});

test("S3 route: 3 koffers bij > 3 passagiers → offerte op aanvraag, snapshot NIET geconsumeerd", async () => {
  const res = await post({ ...base, persons: 4, luggage: "3-koffers", price: 33 });
  assert.equal(res.status, 201);
  const out = (await res.json()) as { price: number | null; quoteOnRequest: boolean };
  assert.equal(out.quoteOnRequest, true);
  assert.equal(out.price, null);
  assert.equal(lockCalls().length, 0);
  assert.equal(plainCreateCalls().length, 1);
  assert.equal((plainCreateCalls()[0].body as Record<string, unknown>).p_price_euros, null);
});

// ── Verlopen / onbekend / misvormd ─────────────────────────────────────────────

test("S3 route: verlopen quoteId → 409 quote_expired, geen RPC", async () => {
  snapshotRow = row({ expiresAt: "2000-01-01T00:00:00.000Z" });
  const res = await post(base);
  assert.equal(res.status, 409);
  assert.equal(((await res.json()) as { error: string }).error, "quote_expired");
  assert.equal(lockCalls().length + plainCreateCalls().length, 0);
});

test("S3 route: onbekende of misvormde quoteId → 409 quote_not_found, geen RPC", async () => {
  for (const quoteId of [
    "0192f0c0-0000-7000-8000-00000000ffff",
    "geen-uuid",
    "' or 1=1 --",
    `${QID},${QID}`,
    "x".repeat(600),
  ]) {
    calls = [];
    const res = await post({ ...base, quoteId });
    assert.equal(res.status, 409, quoteId.slice(0, 40));
    assert.equal(((await res.json()) as { error: string }).error, "quote_not_found");
    assert.equal(lockCalls().length + plainCreateCalls().length, 0);
  }
});

test("S3 route: niet-string quoteId geldt als afwezig → nooit het lock-pad, nooit een clientprijs", async () => {
  for (const quoteId of [12345, { id: QID }, [QID], true]) {
    calls = [];
    const res = await post({ ...base, quoteId, price: 1, totalCents: 100 });
    assert.equal(lockCalls().length, 0, `quoteId ${JSON.stringify(quoteId)} mag geen lock openen`);
    // Geen vaste route in de nep-DB → offerte op aanvraag (prijs null), nooit de body-prijs.
    assert.equal(res.status, 201);
    assert.equal(((await res.json()) as { quoteOnRequest: boolean }).quoteOnRequest, true);
    assert.equal(plainCreateCalls().length, 1);
    assert.equal((plainCreateCalls()[0].body as Record<string, unknown>).p_price_euros, null);
  }
});

// ── Race / hergebruik: de DB is de laatste verdedigingslinie ───────────────────

test("S3 route: DB-weigering na een geslaagde app-check wordt een nette 409/422, geen boeking", async () => {
  const cases: Array<[string, number, string]> = [
    ["QUOTE_EXPIRED", 409, "quote_expired"],
    ["QUOTE_MISMATCH", 409, "quote_mismatch"],
    ["QUOTE_NOT_FOUND", 409, "quote_not_found"],
    ["QUOTE_CONSUMED_NO_BOOKING", 409, "quote_conflict"],
    ["CAPACITY_EXCEEDED", 422, "capacity_exceeded"],
  ];
  for (const [dbError, status, code] of cases) {
    rpcResult = { status: 400, body: { code: "P0001", message: dbError, details: null, hint: null } };
    const res = await post(base);
    assert.equal(res.status, status, dbError);
    const out = (await res.json()) as { ok: boolean; error: string; bookingRef?: string };
    assert.equal(out.ok, false);
    assert.equal(out.error, code);
    assert.equal(out.bookingRef, undefined);
  }
});

test("S3 route: replay van dezelfde POST → dezelfde boeking en dezelfde prijs (DB geeft reused=true)", async () => {
  const first = await post(base);
  const firstOut = (await first.json()) as { bookingRef: string; price: number };
  rpcResult = {
    status: 200,
    body: [{ booking_ref: firstOut.bookingRef, booking_id: "11111111-1111-4111-8111-111111111111", price_euros: 33, reused: true }],
  };
  const replay = await post({ ...base, price: 1 });
  const replayOut = (await replay.json()) as { bookingRef: string; price: number };
  assert.equal(replayOut.bookingRef, firstOut.bookingRef);
  assert.equal(replayOut.price, 33);
  assert.equal(plainCreateCalls().length, 0, "replay valt nooit terug op create_booking");
  // Beide pogingen sturen dezelfde quoteId; de unieke consumptie zit in SQL (zie broncode-lock).
  assert.deepEqual(lockCalls().map((c) => (c.body as { p_quote_id: string }).p_quote_id), [QID, QID]);
});

// F-45 (docs/experience-2.0/baseline/findings.md), opgelost in fix/f45-booking-replay:
// bij reused=true voert de route geen nabewerking meer uit. Een replay met een
// ander retourvluchtnummer wordt geweigerd zonder de bestaande boeking te raken.
// Uitgebreide replay- en gelijktijdigheidstests: lib/bookings/replay-route.test.ts.
test("F-45: replay met reused=true en een ander retourvluchtnummer → 409 booking_exists, geen bookings-update, geen register_flight_monitoring", async () => {
  snapshotRow = row({
    returnApplied: true,
    totalCents: 6000,
    fingerprint: quoteFingerprint({
      pickup: base.pickup,
      dropoff: base.dropoff,
      returnTrip: true,
      departureAt: DEP,
      returnDepartureAt: RET,
    }),
  });
  // Brengen naar een luchthaven: het retourvluchtnummer (aankomst) is verplicht en wordt opgeslagen.
  (snapshotRow.route_snapshot as { airport: unknown }).airport = {
    pickupIsAirport: false,
    dropoffIsAirport: true,
    isAirportPickup: false,
    isAirportDropoff: true,
    isAirportTransfer: true,
    flightDirection: "departure",
  };
  const retour = { ...base, rideType: "retour", returnDate: RET_DATE, returnTime: RET_TIME, returnFlightNumber: "KL1002" };
  const first = await post(retour);
  assert.equal(first.status, 201);
  const firstOut = (await first.json()) as { bookingRef: string; bookingId: string };

  // De bestaande boeking: retourvelden zijn na de eerste request geschreven.
  const realFakeFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname === "/rest/v1/bookings" && (init?.method ?? "GET").toUpperCase() === "GET") {
      calls.push({ method: "GET", path: url.pathname + url.search, body: null });
      const stored = { flight_number: null, return_date: RET_DATE, return_flight_number: "KL1002" };
      const accept = new Headers(init?.headers).get("accept") ?? "";
      return jsonResponse(200, accept.includes("vnd.pgrst.object") ? stored : [stored]);
    }
    return realFakeFetch(input, init);
  }) as typeof fetch;

  calls = [];
  rpcResult = {
    status: 200,
    body: [{ booking_ref: firstOut.bookingRef, booking_id: firstOut.bookingId, price_euros: 60, reused: true }],
  };
  const replay = await post({ ...retour, returnFlightNumber: "KL1234" });
  assert.equal(replay.status, 409);
  const out = (await replay.json()) as { ok: boolean; error: string; bookingId?: string };
  assert.equal(out.ok, false);
  assert.equal(out.error, "booking_exists");
  assert.equal(out.bookingId, undefined, "geen betaalsleutel bij een afwijkende replay");
  assert.equal(lockCalls().length, 1);
  assert.equal(plainCreateCalls().length, 0, "geen tweede boeking");
  assert.deepEqual(
    calls.filter((c) => c.path.startsWith("/rest/v1/bookings") && c.method !== "GET").map((c) => c.method),
    [],
    "geen schrijfactie op bookings"
  );
  assert.equal(calls.filter((c) => c.path === "/rest/v1/rpc/register_flight_monitoring").length, 0);
});
