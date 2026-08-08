// Persistentie-, failure-mode- + securitytests voor de snapshot-opslag
// (Sprint 7.6 — PR 7.6.3C + failure-mode review). TS-laag met geïnjecteerde fake
// RPC-client en geïnjecteerde logger. De DB-laag atomiciteit (parent+children in
// één transactie, duplicate, geen partial) is op staging bewezen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  persistPriceSnapshot,
  SNAPSHOT_PERSIST_FAILED,
  type SnapshotRpcClient,
  type SnapshotPersistFailure,
} from "@/lib/pricing/snapshot-store";
import { buildPriceSnapshot, type PriceSnapshot } from "@/lib/pricing/snapshot";
import { NO_AIRPORT, type PricingQuoteResult } from "@/lib/pricing/service";

type AvailableQuote = Extract<PricingQuoteResult, { available: true }>;

function availableQuote(price: number): AvailableQuote {
  return {
    available: true, source: "fixed_route_prices", price, singlePrice: price,
    returnPrice: null, returnApplied: false, currency: "EUR", vatRate: 9,
    distanceKm: 61, estimatedDurationMin: 54, vehicleClass: "executive-ev",
    route: { pickupSlug: "rotterdam", dropoffSlug: "schiphol", label: "RTM → AMS" },
    isAirportTransfer: true, airport: NO_AIRPORT, dataSource: "supabase",
    fingerprint: "rotterdam|schiphol|executive-ev|enkel",
  };
}

const NOW = new Date("2026-07-30T12:00:00.000Z");
const QID = "0192f0c0-0000-7000-8000-000000000abc";
const snap = () => buildPriceSnapshot(availableQuote(119), { quoteId: QID, now: NOW })!;

/** Fake client: legt rpc-aanroepen vast; kan een resultaat teruggeven óf gooien. */
function fakeClient(opts: { result?: unknown; throws?: unknown } = {}) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const rpc = (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    if ("throws" in opts) return Promise.reject(opts.throws);
    return Promise.resolve("result" in opts ? opts.result : { error: null });
  };
  return { client: { rpc } as unknown as SnapshotRpcClient, calls };
}

/** Capturing logger voor failure-events. */
function capture() {
  const events: SnapshotPersistFailure[] = [];
  return { logFailure: (f: SnapshotPersistFailure) => events.push(f), events };
}

function snapshotWithAdjustments(): PriceSnapshot {
  return {
    ...snap(),
    subtotalCents: 10000,
    adjustments: [
      { code: "airport_fee", label: "Luchthaven", amountCents: 750, taxable: true, vatRate: 9, sortOrder: 1 },
      { code: "promo", label: "Actie", amountCents: -250, taxable: false, vatRate: null, sortOrder: 2 },
    ],
    totalCents: 10500,
  };
}

// ── B. Persistentie (happy path) ─────────────────────────────────────────────

test("persist: succes → true, één RPC-aanroep met de parent-velden, GEEN failure gelogd", async () => {
  const { client, calls } = fakeClient();
  const { logFailure, events } = capture();
  const ok = await persistPriceSnapshot(snap(), { client, logFailure });
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.fn, "create_price_snapshot");
  assert.equal(events.length, 0);
  const a = calls[0]!.args;
  assert.equal(a.p_quote_id, QID);
  assert.equal(a.p_pricing_version, "2026.07.v1");
  assert.equal(a.p_pricing_source, "fixed_route_prices");
  assert.equal(a.p_total_cents, 11900);
  assert.equal(a.p_calculated_at, NOW.toISOString());
  assert.equal(a.p_expires_at, new Date(NOW.getTime() + 15 * 60_000).toISOString());
});

test("persist: adjustments worden meegegeven mét behoud van volgorde", async () => {
  const { client, calls } = fakeClient();
  await persistPriceSnapshot(snapshotWithAdjustments(), { client });
  const adj = calls[0]!.args.p_adjustments as Array<{ code: string; sortOrder: number }>;
  assert.deepEqual(adj.map((x) => x.code), ["airport_fee", "promo"]);
  assert.deepEqual(adj.map((x) => x.sortOrder), [1, 2]);
});

// ── Failure-modi — nooit stil, altijd false + gelogd ─────────────────────────

test("persist: ongeldige snapshot (gebroken invariant) → geen RPC, false, reason validation_failed", async () => {
  const { client, calls } = fakeClient();
  const { logFailure, events } = capture();
  const ok = await persistPriceSnapshot({ ...snapshotWithAdjustments(), totalCents: 99999 }, { client, logFailure });
  assert.equal(ok, false);
  assert.equal(calls.length, 0); // geweigerd vóór de insert
  assert.equal(events[0]!.reason, "validation_failed");
});

test("persist: ontbrekende client → false, reason no_service_role_client", async () => {
  const { logFailure, events } = capture();
  const ok = await persistPriceSnapshot(snap(), { client: null, logFailure });
  assert.equal(ok, false);
  assert.equal(events[0]!.reason, "no_service_role_client");
});

test("persist: RPC-fout (db error) → false, reason rpc_error, dbErrorCode uit error.code", async () => {
  const { client } = fakeClient({ result: { error: { code: "XX000", message: "boom" } } });
  const { logFailure, events } = capture();
  const ok = await persistPriceSnapshot(snap(), { client, logFailure });
  assert.equal(ok, false);
  assert.equal(events[0]!.reason, "rpc_error");
  assert.equal(events[0]!.dbErrorCode, "XX000");
});

test("persist: duplicate quoteId (unique_violation 23505) → false, schoon gelogd", async () => {
  const { client } = fakeClient({ result: { error: { code: "23505", message: "duplicate key" } } });
  const { logFailure, events } = capture();
  const ok = await persistPriceSnapshot(snap(), { client, logFailure });
  assert.equal(ok, false);
  assert.equal(events[0]!.dbErrorCode, "23505");
});

test("persist: RPC gooit een exception → false, reason rpc_exception, geen throw naar de caller", async () => {
  const err = Object.assign(new Error("connection reset"), { code: "ECONNRESET" });
  const { client } = fakeClient({ throws: err });
  const { logFailure, events } = capture();
  const ok = await persistPriceSnapshot(snap(), { client, logFailure });
  assert.equal(ok, false);
  assert.equal(events[0]!.reason, "rpc_exception");
  assert.equal(events[0]!.dbErrorCode, "ECONNRESET");
});

test("persist: ongeldige/ontbrekende RPC-response → false, reason invalid_rpc_response", async () => {
  for (const bad of [undefined, null, 42, {}]) {
    const { client } = fakeClient({ result: bad });
    const { logFailure, events } = capture();
    const ok = await persistPriceSnapshot(snap(), { client, logFailure });
    assert.equal(ok, false);
    assert.equal(events[0]!.reason, "invalid_rpc_response");
  }
});

// ── Log-veiligheid: vaste code, alleen veilige velden, GEEN PII/routeSnapshot ──

test("failure-log: vaste code + uitsluitend veilige velden, geen routeSnapshot/PII", async () => {
  const { client } = fakeClient({ result: { error: { code: "23514", message: "check" } } });
  const { logFailure, events } = capture();
  await persistPriceSnapshot(snapshotWithAdjustments(), { client, logFailure });
  const f = events[0]!;
  assert.equal(f.code, SNAPSHOT_PERSIST_FAILED);
  assert.equal(f.code, "PRICE_SNAPSHOT_PERSIST_FAILED");
  // exact deze veilige sleutels, niets meer
  assert.deepEqual(
    Object.keys(f).sort(),
    ["at", "code", "dbErrorCode", "pricingSource", "pricingVersion", "quoteId", "reason"]
  );
  assert.equal(f.quoteId, QID);
  assert.equal(f.pricingVersion, "2026.07.v1");
  assert.ok(typeof f.at === "string" && f.at.length > 0);
  // geen routeSnapshot, adressen of andere persoonsgegevens in de log
  const blob = JSON.stringify(f).toLowerCase();
  for (const bad of ["routesnapshot", "pickup", "dropoff", "address", "adres", "email", "e-mail", "phone", "telefoon", "customername", "label", "amountcents"]) {
    assert.ok(!blob.includes(bad), `log mag "${bad}" niet bevatten`);
  }
});

// ── D. Security ──────────────────────────────────────────────────────────────

test("persist: uitsluitend een RPC-aanroep — geen update-pad (immutabel)", async () => {
  const { client, calls } = fakeClient();
  await persistPriceSnapshot(snap(), { client });
  assert.ok(calls.every((c) => c.fn === "create_price_snapshot"));
});

test("persist: autoritatieve velden komen uit de server-snapshot, niet uit input", async () => {
  const { client, calls } = fakeClient();
  const s = snap();
  await persistPriceSnapshot(s, { client });
  const a = calls[0]!.args;
  assert.equal(a.p_quote_id, s.quoteId);
  assert.equal(a.p_total_cents, s.totalCents);
  assert.equal(a.p_pricing_version, s.pricingVersion);
  assert.equal(a.p_pricing_source, s.pricingSource);
});

const quoteRouteSrc = readFileSync(resolve(process.cwd(), "app/api/pricing/quote/route.ts"), "utf8");

test("quote-route: input alleen uit bekende velden; geen autoritatieve velden uit de body", () => {
  assert.match(quoteRouteSrc, /const \{ pickup, dropoff, vehicleClass, returnTrip, passengers, luggage, date, time \} = body/);
  assert.doesNotMatch(quoteRouteSrc, /body\.(quoteId|price|amount|total|pricingVersion|pricingSource|totalCents|subtotalCents)/);
});

test("quote-route: quoteId alleen bij bevestigde opslag; prijsvelden onafhankelijk van persist", () => {
  assert.match(quoteRouteSrc, /const stored = await persistPriceSnapshot\(snapshot\)/);
  assert.match(quoteRouteSrc, /if \(stored\) quoteId = snapshot\.quoteId/);
  assert.match(quoteRouteSrc, /\.\.\.\(quoteId \? \{ quoteId \} : \{\}\)/);
  // Prijsvelden komen uit de quote (`result`), niet uit de snapshot of persist-uitkomst.
  assert.match(quoteRouteSrc, /price: result\.price/);
});
