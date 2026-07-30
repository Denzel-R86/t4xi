// Persistentie- + securitytests voor de snapshot-opslag (Sprint 7.6 — PR 7.6.3C).
// TS-laag met een geïnjecteerde fake RPC-client. De DB-laag atomiciteit (parent+
// children in één transactie, duplicate, geen partial) wordt op staging bewezen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { persistPriceSnapshot, type SnapshotRpcClient } from "@/lib/pricing/snapshot-store";
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
  };
}

const NOW = new Date("2026-07-30T12:00:00.000Z");
const QID = "0192f0c0-0000-7000-8000-000000000abc";

/** Fake client die elke rpc-aanroep vastlegt en een instelbaar resultaat teruggeeft. */
function fakeClient(result: { error: { code?: string; message: string } | null } = { error: null }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const rpc = (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    return Promise.resolve(result);
  };
  const client = { rpc } as unknown as SnapshotRpcClient;
  return { client, calls };
}

function snapshotWithAdjustments(): PriceSnapshot {
  const base = buildPriceSnapshot(availableQuote(100), { quoteId: QID, now: NOW })!;
  return {
    ...base,
    subtotalCents: 10000,
    adjustments: [
      { code: "airport_fee", label: "Luchthaven", amountCents: 750, taxable: true, vatRate: 9, sortOrder: 1 },
      { code: "promo", label: "Actie", amountCents: -250, taxable: false, vatRate: null, sortOrder: 2 },
    ],
    totalCents: 10500,
  };
}

// ── B. Persistentie (TS-laag) ────────────────────────────────────────────────

test("persist: roept create_price_snapshot precies één keer met de parent-velden", async () => {
  const { client, calls } = fakeClient();
  const snap = buildPriceSnapshot(availableQuote(119), { quoteId: QID, now: NOW })!;
  const ok = await persistPriceSnapshot(snap, { client });
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.fn, "create_price_snapshot");
  const a = calls[0]!.args;
  assert.equal(a.p_quote_id, QID);
  assert.equal(a.p_pricing_version, "2026.07.v1");
  assert.equal(a.p_pricing_source, "fixed_route_prices");
  assert.equal(a.p_subtotal_cents, 11900);
  assert.equal(a.p_total_cents, 11900);
  assert.equal(a.p_currency, "EUR");
  assert.equal(a.p_calculated_at, NOW.toISOString());
  assert.equal(a.p_expires_at, new Date(NOW.getTime() + 15 * 60_000).toISOString());
});

test("persist: adjustments worden meegegeven mét behoud van volgorde", async () => {
  const { client, calls } = fakeClient();
  await persistPriceSnapshot(snapshotWithAdjustments(), { client });
  const adj = calls[0]!.args.p_adjustments as Array<{ code: string; sortOrder: number }>;
  assert.equal(adj.length, 2);
  assert.deepEqual(adj.map((x) => x.code), ["airport_fee", "promo"]);
  assert.deepEqual(adj.map((x) => x.sortOrder), [1, 2]);
});

test("persist: ongeldige snapshot (gebroken invariant) → geen RPC-aanroep, false", async () => {
  const { client, calls } = fakeClient();
  const broken = { ...snapshotWithAdjustments(), totalCents: 99999 };
  const ok = await persistPriceSnapshot(broken, { client });
  assert.equal(ok, false);
  assert.equal(calls.length, 0); // geweigerd vóór de insert
});

test("persist: ontbrekende client → false (best-effort, geen throw)", async () => {
  const snap = buildPriceSnapshot(availableQuote(119), { quoteId: QID, now: NOW })!;
  const ok = await persistPriceSnapshot(snap, { client: null });
  assert.equal(ok, false);
});

test("persist: RPC-fout → false, geen throw (preview blijft werken)", async () => {
  const { client } = fakeClient({ error: { code: "XX000", message: "boom" } });
  const snap = buildPriceSnapshot(availableQuote(119), { quoteId: QID, now: NOW })!;
  const ok = await persistPriceSnapshot(snap, { client });
  assert.equal(ok, false);
});

test("persist: duplicate quoteId (unique_violation) faalt schoon → false", async () => {
  const { client } = fakeClient({ error: { code: "23505", message: "duplicate key value violates unique constraint" } });
  const snap = buildPriceSnapshot(availableQuote(119), { quoteId: QID, now: NOW })!;
  const ok = await persistPriceSnapshot(snap, { client });
  assert.equal(ok, false);
});

// ── D. Security ──────────────────────────────────────────────────────────────

test("persist: uitsluitend een RPC-aanroep — geen update-pad (immutabel)", async () => {
  const { client, calls } = fakeClient();
  // De client-vorm is Pick<..., 'rpc'> → er ís geen .from/.update op de injecteerbare
  // client. Bevestig bovendien dat elke aanroep de insert-RPC is, nooit iets anders.
  await persistPriceSnapshot(buildPriceSnapshot(availableQuote(119), { quoteId: QID, now: NOW })!, { client });
  assert.ok(calls.every((c) => c.fn === "create_price_snapshot"));
});

test("persist: autoritatieve velden komen uit de server-snapshot, niet uit input", async () => {
  const { client, calls } = fakeClient();
  const snap = buildPriceSnapshot(availableQuote(119), { quoteId: QID, now: NOW })!;
  await persistPriceSnapshot(snap, { client });
  const a = calls[0]!.args;
  // quoteId/bedragen/pricingVersion/pricingSource = server-bepaald (uit snapshot).
  assert.equal(a.p_quote_id, snap.quoteId);
  assert.equal(a.p_total_cents, snap.totalCents);
  assert.equal(a.p_pricing_version, snap.pricingVersion);
  assert.equal(a.p_pricing_source, snap.pricingSource);
});

const quoteRouteSrc = readFileSync(resolve(process.cwd(), "app/api/pricing/quote/route.ts"), "utf8");

test("quote-route: input komt alleen uit de bekende velden; geen autoritatieve velden uit de body", () => {
  // De route destructureert uitsluitend de bestaande, bekende invoervelden.
  assert.match(quoteRouteSrc, /const \{ pickup, dropoff, vehicleClass, returnTrip, passengers, luggage \} = body/);
  // De client kan quoteId/bedragen/pricingVersion/pricingSource NIET uit de body afdwingen:
  // die worden nergens uit `body` gelezen.
  assert.doesNotMatch(quoteRouteSrc, /body\.(quoteId|price|amount|total|pricingVersion|pricingSource|totalCents|subtotalCents)/);
});
