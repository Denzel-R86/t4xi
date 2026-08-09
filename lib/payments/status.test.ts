import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseBookingIdParam, shapeStatusResponse, type BookingStatusRow } from "@/lib/payments/status";

const BID = "11111111-1111-4111-8111-111111111111";
const statusRouteSrc = readFileSync("app/api/payments/status/route.ts", "utf8");

// ── 1. invalid/ontbrekende UUID ────────────────────────────────────────────────

test("1 · ongeldige of ontbrekende bookingId → null (route → 400)", () => {
  for (const raw of [null, "", "not-a-uuid", "123", "T4XI-2026-1000", BID.replace(/-/g, "")]) {
    assert.equal(parseBookingIdParam(raw), null, `raw=${String(raw)}`);
  }
  assert.equal(parseBookingIdParam(BID.toUpperCase()), BID); // genormaliseerd
});

// ── 2. unknown booking → 404 (route) ───────────────────────────────────────────

test("2 · onbekende booking → generieke 404 zonder data-lek", () => {
  assert.match(statusRouteSrc, /if \(!row\)/);
  assert.match(statusRouteSrc, /json\(404, \{ error: "not_found" \}\)/);
  assert.match(statusRouteSrc, /Cache-Control": "private, no-store, max-age=0"/);
});

// ── 3/4. pending & paid shaping ────────────────────────────────────────────────

test("3 · pending-status wordt correct gevormd", () => {
  const row: BookingStatusRow = { payment_status: "pending", amount_due_cents: 7900, amount_paid_cents: null, payment_currency: "eur", paid_at: null };
  assert.deepEqual(shapeStatusResponse(row), { status: "pending", amountDue: 7900, amountPaid: null, currency: "eur", paidAt: null });
});

test("4 · paid-status bevat amountPaid + paidAt", () => {
  const row: BookingStatusRow = { payment_status: "paid", amount_due_cents: 7900, amount_paid_cents: 7900, payment_currency: "eur", paid_at: "2026-07-24T10:00:00Z" };
  const r = shapeStatusResponse(row);
  assert.equal(r.status, "paid");
  assert.equal(r.amountPaid, 7900);
  assert.equal(r.paidAt, "2026-07-24T10:00:00Z");
});

// ── 5. geen PII / geen volledige row ───────────────────────────────────────────

test("5 · respons bevat uitsluitend niet-PII statusvelden", () => {
  const row = {
    payment_status: "paid", amount_due_cents: 7900, amount_paid_cents: 7900, payment_currency: "eur", paid_at: "x",
    // velden die NOOIT mee mogen:
    customer_name: "Jan", customer_email: "jan@example.com", customer_phone: "+31612345678", from_address: "Huisadres 1",
  } as unknown as BookingStatusRow;
  const r = shapeStatusResponse(row);
  assert.deepEqual(Object.keys(r).sort(), ["amountDue", "amountPaid", "currency", "paidAt", "status"]);
  const blob = JSON.stringify(r);
  assert.ok(!blob.includes("@"));
  assert.ok(!blob.includes("Jan"));
  assert.ok(!blob.includes("Huisadres"));
  // de route selecteert ook alleen die 5 velden (geen PII-kolommen)
  assert.match(statusRouteSrc, /\.select\("payment_status, amount_due_cents, amount_paid_cents, payment_currency, paid_at"\)/);
  assert.doesNotMatch(statusRouteSrc, /customer_(name|email|phone)/);
});

// ── endpoint: capability is booking_id (UUID), lookup op id ─────────────────────

test("endpoint · lookup op het interne booking_id (UUID), niet op booking_ref", () => {
  assert.match(statusRouteSrc, /\.eq\("id", bookingId\)/);
  assert.doesNotMatch(statusRouteSrc, /booking_ref/);
  assert.match(statusRouteSrc, /SUPABASE_SERVICE_ROLE_KEY/); // server-only
});
