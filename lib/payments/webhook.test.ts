import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Stripe from "stripe";
import { handleStripeEvent, mapEventToStatus, type ProcessEventFn } from "@/lib/payments/webhook";

const migration = readFileSync("supabase/migrations/20260724120000_stripe_payment_status.sql", "utf8");
const webhookRouteSrc = readFileSync("app/api/stripe/webhook/route.ts", "utf8");
const createIntentRouteSrc = readFileSync("app/api/payments/create-intent/route.ts", "utf8");
const allMigrations = readFileSync("supabase/migrations/20260707120000_bookings_schema_baseline.sql", "utf8") + migration;

// Stripe-instance zonder netwerk: alleen voor HMAC-signatureberekening.
const stripe = new Stripe("sk_test_dummy_for_signature_only", { apiVersion: "2026-06-24.dahlia" });
const WHSEC = "whsec_test_secret";

function piEvent(type: string, over: Partial<Stripe.PaymentIntent> = {}, id = "evt_1"): Stripe.Event {
  return {
    id,
    type,
    data: { object: { id: "pi_x", amount: 7900, amount_received: 7900, currency: "eur", ...over } as Stripe.PaymentIntent },
  } as Stripe.Event;
}

function capture() {
  const calls: Parameters<ProcessEventFn>[0][] = [];
  const fn: ProcessEventFn = async (a) => { calls.push(a); return "paid"; };
  return { calls, fn };
}

// ── 1/2/3. signature-verificatie ───────────────────────────────────────────────

test("1 · geldige signature → constructEvent slaagt", () => {
  const payload = JSON.stringify({ id: "evt_1", type: "payment_intent.succeeded" });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WHSEC });
  const event = stripe.webhooks.constructEvent(payload, header, WHSEC);
  assert.equal(event.type, "payment_intent.succeeded");
});

test("2 · ongeldige signature → gooit (route → 400)", () => {
  const payload = JSON.stringify({ id: "evt_1" });
  assert.throws(() => stripe.webhooks.constructEvent(payload, "t=1,v1=deadbeef", WHSEC));
  // getamperde payload met geldige oude header → ook fout
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WHSEC });
  assert.throws(() => stripe.webhooks.constructEvent(payload + "x", header, WHSEC));
});

test("3 · ontbrekende signature wordt door de route als 400 afgevangen", () => {
  assert.match(webhookRouteSrc, /if \(!sig\)/);
  assert.match(webhookRouteSrc, /missing_signature/);
  assert.match(webhookRouteSrc, /status: 400/);
});

// ── 4-7. event → status mapping ────────────────────────────────────────────────

test("4-7 · payment_intent-events mappen naar de juiste status", async () => {
  const cases: [string, string][] = [
    ["payment_intent.succeeded", "paid"],
    ["payment_intent.processing", "processing"],
    ["payment_intent.payment_failed", "failed"],
    ["payment_intent.canceled", "canceled"],
  ];
  for (const [type, status] of cases) {
    assert.equal(mapEventToStatus(type), status);
    const { calls, fn } = capture();
    const res = await handleStripeEvent(piEvent(type), fn);
    assert.equal(res.handled, true);
    assert.equal(calls[0].newStatus, status);
    assert.equal(calls[0].paymentIntentId, "pi_x");
    assert.equal(calls[0].currency, "eur");
  }
});

// ── 8. onbekend event veilig genegeerd ─────────────────────────────────────────

test("8 · onbekend event wordt genegeerd (geen processEvent-call)", async () => {
  const { calls, fn } = capture();
  const res = await handleStripeEvent(piEvent("payment_intent.amount_capturable_updated"), fn);
  assert.equal(res.handled, false);
  assert.equal(calls.length, 0);
  assert.equal(mapEventToStatus("charge.refunded"), null);
});

// ── 9. succeeded geeft amount_received door voor server-side verificatie ────────

test("9 · succeeded geeft amount_received mee (server verifieert het bedrag)", async () => {
  const { calls, fn } = capture();
  await handleStripeEvent(piEvent("payment_intent.succeeded", { amount: 7900, amount_received: 7900 }), fn);
  assert.equal(calls[0].amountReceivedCents, 7900);
});

// ── SQL-guards (DB-afgedwongen; geverifieerd op de migratie) ───────────────────

test("9b · idempotency: unique event-PK + duplicate-afhandeling", () => {
  assert.match(migration, /create table if not exists public\.stripe_webhook_events/);
  assert.match(migration, /stripe_event_id\s+text primary key/);
  assert.match(migration, /on conflict \(stripe_event_id\) do nothing/);
  assert.match(migration, /return 'duplicate'/);
});

test("10/11 · paid is terminaal (processing/failed downgraden paid niet)", () => {
  // guard: bij v_current = 'paid' → noop_terminal voor niet-paid transities
  assert.match(migration, /if v_current = 'paid' then return 'noop_terminal'/);
});

test("12/13 · succeeded verifieert currency=eur én bedrag vóór paid", () => {
  assert.match(migration, /lower\(coalesce\(p_currency, ''\)\) <> 'eur'/);
  assert.match(migration, /p_amount_received_cents <> v_due/);
  assert.match(migration, /return 'amount_mismatch'/);
});

test("14 · onbekende PaymentIntent → geen mutatie (no_booking)", () => {
  assert.match(migration, /where b\.stripe_payment_intent_id = p_payment_intent_id/);
  assert.match(migration, /return 'no_booking'/);
});

test("17 · bestaande non-Stripe bookings blijven geldig (default 'unpaid')", () => {
  assert.match(migration, /payment_status text not null default 'unpaid'/);
});

test("18 · geen anon/authenticated UPDATE-policy waarmee clients status kunnen zetten", () => {
  assert.doesNotMatch(allMigrations, /for update\s+to\s+(anon|authenticated)/i);
  assert.doesNotMatch(migration, /to anon[\s\S]*payment_status/i);
  // RPC-execute alleen voor service_role
  assert.match(migration, /grant execute on function public\.process_stripe_payment_event[\s\S]*to service_role/);
});

// ── 15/16. webhook-route lekt geen secrets / logt geen raw payload ─────────────

test("15/16 · webhook-route logt geen raw body/secret en geeft generieke responses", () => {
  assert.doesNotMatch(webhookRouteSrc, /console\.\w+\([^)]*rawBody/);
  assert.doesNotMatch(webhookRouteSrc, /console\.\w+\([^)]*event\.data/);
  assert.doesNotMatch(webhookRouteSrc, /whsec_|STRIPE_WEBHOOK_SECRET\s*[},]/);
  // RAW body wordt gebruikt voor constructEvent (geen JSON-parsing vooraf)
  assert.match(webhookRouteSrc, /request\.text\(\)/);
  assert.match(webhookRouteSrc, /constructEvent/);
});

// ── 19/20. create-intent koppelt alleen server-trusted; bedrag van de server ───

test("19/20 · create-intent zoekt de boeking server-side op (op UUID) en gebruikt geen clientbedrag", () => {
  assert.match(createIntentRouteSrc, /\.eq\("id", input\.bookingId\)/);
  assert.match(createIntentRouteSrc, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(createIntentRouteSrc, /link_booking_payment/);
  assert.match(migration, /link_booking_payment/);
});

// ── BLOCKER 1 — booking_id (UUID) is de capability, booking_ref niet ───────────

const bookingsRouteSrc = readFileSync("app/api/bookings/route.ts", "utf8");
const paymentStepSrc = readFileSync("components/booking/PaymentStep.tsx", "utf8");
const flowSrc = readFileSync("lib/payments/payment-flow.ts", "utf8");

test("B1 · sequentiële booking_ref wordt NIET als lookup-sleutel gebruikt", () => {
  // create-intent zoekt op id, niet op booking_ref
  assert.doesNotMatch(createIntentRouteSrc, /\.eq\("booking_ref"/);
  // link-RPC neemt het interne UUID (p_booking_id), niet de publieke ref
  assert.match(migration, /link_booking_payment\(\s*p_booking_id uuid/);
  assert.match(migration, /where b\.id = p_booking_id/);
});

test("B1 · booking_id (UUID) loopt via bookings → PaymentStep → create-intent", () => {
  assert.match(bookingsRouteSrc, /bookingId/);              // response geeft het UUID mee
  assert.match(flowSrc, /bookingId: ride\.bookingId/);      // body stuurt bookingId
  assert.match(paymentStepSrc, /buildCreateIntentBody\(ride\)/);
});

test("B1 · onbekend UUID → 404 zonder data-lek", () => {
  assert.match(createIntentRouteSrc, /if \(!row\)/);
  assert.match(createIntentRouteSrc, /json\(404, \{ error: "booking_not_found"/);
});

// ── BLOCKER 2 — SECURITY DEFINER hardening ────────────────────────────────────

test("B2 · beide SECURITY DEFINER functies gebruiken lege search_path", () => {
  const empties = migration.match(/set search_path = ''/g) ?? [];
  assert.equal(empties.length, 2);
  assert.doesNotMatch(migration, /search_path to 'public'/);
});

test("B2 · alle relatie-referenties in de functies zijn schema-qualified", () => {
  assert.match(migration, /update public\.bookings/);
  assert.match(migration, /from public\.bookings/);
  assert.match(migration, /insert into public\.stripe_webhook_events/);
  // geen impliciete (ongekwalificeerde) resolutie van deze tabellen
  assert.doesNotMatch(migration, /from bookings\b/);
  assert.doesNotMatch(migration, /update bookings\b/);
  assert.doesNotMatch(migration, /into stripe_webhook_events\b/);
});

test("B2 · execute geweigerd voor public/anon/authenticated, alleen service_role", () => {
  assert.match(migration, /revoke execute on function public\.link_booking_payment\(uuid, text, integer, text\) from public, anon, authenticated/);
  assert.match(migration, /revoke execute on function public\.process_stripe_payment_event\(text, text, text, text, integer, text\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.link_booking_payment\(uuid, text, integer, text\) to service_role/);
});

// ── link_booking_payment concurrency-hardening ────────────────────────────────

test("C1 · link gebruikt row-lock (FOR UPDATE) en overschrijft geen andere PI", () => {
  // row lock in beide functies (link + process)
  assert.ok((migration.match(/for update/gi) ?? []).length >= 2);
  // weigert een andere reeds gekoppelde PaymentIntent
  assert.match(migration, /v_existing_pi is not null and v_existing_pi <> p_payment_intent_id/);
  assert.match(migration, /return 'pi_conflict'/);
  // downgradet paid niet; idempotent bij dezelfde PI ('linked')
  assert.match(migration, /if v_status = 'paid' then return 'already_paid'/);
  assert.match(migration, /return 'linked'/);
});

test("C2 · route accepteert uitsluitend outcome 'linked'", () => {
  assert.match(createIntentRouteSrc, /data !== "linked"/);
});

// ── CHECK-constraints ─────────────────────────────────────────────────────────

test("C3 · negatieve bedragen onmogelijk, currency=eur, paid_at alleen bij paid", () => {
  assert.match(migration, /check \(amount_due_cents is null or amount_due_cents > 0\)/);
  assert.match(migration, /check \(amount_paid_cents is null or amount_paid_cents >= 0\)/);
  assert.match(migration, /check \(payment_currency is null or payment_currency = 'eur'\)/);
  assert.match(migration, /check \(paid_at is null or payment_status = 'paid'\)/);
});

// ── out-of-order / transitions ────────────────────────────────────────────────

test("C4 · paid is terminaal; failed/canceled → paid mag bij geldige succeeded", () => {
  // processing/failed/canceled downgraden paid niet
  assert.equal((migration.match(/if v_current = 'paid' then return 'noop_terminal'/g) ?? []).length, 3);
  // de paid-tak blokkeert alleen wanneer al paid; failed/canceled current → gaat door
  // (na currency/amount-verificatie) naar paid — er is GEEN guard tegen failed/canceled.
  assert.doesNotMatch(migration, /v_current in \('failed', 'canceled'\)/);
  assert.match(migration, /if v_current = 'paid' then\s*\n\s*return 'already_paid'/);
});
