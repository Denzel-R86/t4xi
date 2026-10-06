import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  isMissingColumnError,
  persistSourceQuoteId,
  resetSourceQuoteWarningForTests,
  resolveQuoteLink,
  type BookingPatcher,
} from "@/lib/bookings/quote-link";

/**
 * H-3 (F-04): welke boekingspaden welke quote vastleggen.
 *
 * - `lockedQuoteId` MOET exact de bestaande quote-lockregel van de route volgen
 *   (achterwaartse compatibiliteit: dezelfde RPC met dezelfde snapshot).
 * - `sourceQuoteId` is de attributie die 0.4a gebruikt; nooit een unieke lock.
 */

const Q = "11111111-2222-4333-8444-555555555555";

// ── Pad-afleiding ────────────────────────────────────────────────────────────

test("snapshot-lock: gevalideerde quote zonder bagagereview → lock + attributie", () => {
  const link = resolveQuoteLink({
    outcome: { kind: "priced", lockedQuoteId: Q },
    luggageNeedsManualReview: false,
  });
  assert.deepEqual(link, { path: "snapshot_lock", lockedQuoteId: Q, sourceQuoteId: Q });
});

test("aanvraag na getoonde prijs (bagagereview): geen lock, wél attributie", () => {
  const link = resolveQuoteLink({
    outcome: { kind: "priced", lockedQuoteId: Q },
    luggageNeedsManualReview: true,
  });
  assert.deepEqual(link, { path: "quote_on_request_review", lockedQuoteId: null, sourceQuoteId: Q });
});

test("vaste route zonder quoteId: geen snapshot, dus geen koppeling", () => {
  const link = resolveQuoteLink({
    outcome: { kind: "priced", lockedQuoteId: null },
    luggageNeedsManualReview: false,
  });
  assert.deepEqual(link, { path: "fixed_route_without_quote", lockedQuoteId: null, sourceQuoteId: null });
});

test("vaste route zonder quoteId + bagagereview → aanvraag zonder koppeling", () => {
  const link = resolveQuoteLink({
    outcome: { kind: "priced", lockedQuoteId: null },
    luggageNeedsManualReview: true,
  });
  assert.deepEqual(link, { path: "on_request", lockedQuoteId: null, sourceQuoteId: null });
});

test("offerte op aanvraag: geen quote", () => {
  for (const review of [false, true]) {
    const link = resolveQuoteLink({ outcome: { kind: "on_request" }, luggageNeedsManualReview: review });
    assert.deepEqual(link, { path: "on_request", lockedQuoteId: null, sourceQuoteId: null });
  }
});

test("lockedQuoteId is identiek aan de bestaande routeregel voor alle combinaties", () => {
  // Spiegel van app/api/bookings/route.ts: lock alleen bij priced && !review.
  const legacyRule = (o: { kind: "priced"; lockedQuoteId: string | null } | { kind: "on_request" }, review: boolean) =>
    o.kind === "priced" && !review ? o.lockedQuoteId : null;
  const outcomes = [
    { kind: "priced" as const, lockedQuoteId: Q },
    { kind: "priced" as const, lockedQuoteId: null },
    { kind: "on_request" as const },
  ];
  for (const outcome of outcomes) {
    for (const review of [false, true]) {
      const link = resolveQuoteLink({ outcome, luggageNeedsManualReview: review });
      assert.equal(link.lockedQuoteId, legacyRule(outcome, review));
      // Attributie bestaat alleen als er een gevalideerde quote was.
      if (link.sourceQuoteId !== null) assert.equal(link.sourceQuoteId, Q);
    }
  }
});

// ── Persistentie (best-effort, degradeert zonder kolom) ──────────────────────

type Call = { id: string; patch: { source_quote_id: string } };
function patcher(result: { error: { code?: string; message?: string } | null } | Error) {
  const calls: Call[] = [];
  const fn: BookingPatcher = async (id, patch) => {
    calls.push({ id, patch });
    if (result instanceof Error) throw result;
    return result;
  };
  return { fn, calls };
}

function captureConsole() {
  const out: { level: "warn" | "error"; msg: string }[] = [];
  const warn = console.warn;
  const error = console.error;
  console.warn = (...a: unknown[]) => void out.push({ level: "warn", msg: a.map(String).join(" ") });
  console.error = (...a: unknown[]) => void out.push({ level: "error", msg: a.map(String).join(" ") });
  return {
    out,
    restore() {
      console.warn = warn;
      console.error = error;
    },
  };
}

afterEach(() => resetSourceQuoteWarningForTests());

test("persist: zet source_quote_id op exact de geboekte rij", async () => {
  const p = patcher({ error: null });
  const r = await persistSourceQuoteId(p.fn, "booking-uuid", Q);
  assert.equal(r, "linked");
  assert.deepEqual(p.calls, [{ id: "booking-uuid", patch: { source_quote_id: Q } }]);
});

test("persist: zonder quote of zonder booking-id geen DB-aanroep", async () => {
  const p = patcher({ error: null });
  assert.equal(await persistSourceQuoteId(p.fn, "booking-uuid", null), "skipped");
  assert.equal(await persistSourceQuoteId(p.fn, undefined, Q), "skipped");
  assert.equal(p.calls.length, 0);
});

test("persist: ontbrekende kolom (migratie niet toegepast) → geen fout, één waarschuwing", async () => {
  const c = captureConsole();
  try {
    const p = patcher({ error: { code: "PGRST204", message: "Could not find the 'source_quote_id' column" } });
    assert.equal(await persistSourceQuoteId(p.fn, "b1", Q), "schema_missing");
    assert.equal(await persistSourceQuoteId(p.fn, "b2", Q), "schema_missing");
  } finally {
    c.restore();
  }
  assert.equal(c.out.length, 1);
  assert.equal(c.out[0].level, "warn");
});

test("persist: overige fout → alleen foutcode gelogd, geen ids", async () => {
  const c = captureConsole();
  try {
    const p = patcher({ error: { code: "23503", message: `insert or update violates fk, key=(${Q})` } });
    assert.equal(await persistSourceQuoteId(p.fn, "booking-uuid", Q), "error");
  } finally {
    c.restore();
  }
  assert.equal(c.out.length, 1);
  assert.match(c.out[0].msg, /code=23503/);
  assert.ok(!c.out[0].msg.includes(Q));
  assert.ok(!c.out[0].msg.includes("booking-uuid"));
});

test("persist: uitzondering wordt nooit doorgegooid", async () => {
  const c = captureConsole();
  try {
    const p = patcher(new TypeError("network down"));
    assert.equal(await persistSourceQuoteId(p.fn, "booking-uuid", Q), "error");
  } finally {
    c.restore();
  }
  assert.ok(!c.out[0].msg.includes("network down"));
});

test("isMissingColumnError herkent PostgREST- en Postgres-codes", () => {
  assert.equal(isMissingColumnError({ code: "PGRST204" }), true);
  assert.equal(isMissingColumnError({ code: "42703" }), true);
  assert.equal(isMissingColumnError({ code: "23505" }), false);
  assert.equal(isMissingColumnError({}), false);
});

// ── Wiring-lock op de route ──────────────────────────────────────────────────

test("route: attributie loopt via resolveQuoteLink/persistSourceQuoteId en raakt de lock-RPC niet", () => {
  const src = readFileSync("app/api/bookings/route.ts", "utf8");
  assert.match(src, /resolveQuoteLink\(\{ outcome, luggageNeedsManualReview \}\)/);
  assert.match(src, /persistSourceQuoteId\([\s\S]*?\.from\("bookings"\)\.update\(patch\)\.eq\("id", id\)[\s\S]*?quoteLink\.sourceQuoteId/);
  // Lock-pad ongewijzigd: de RPC krijgt nog steeds lockedQuoteId.
  assert.match(src, /create_booking_from_snapshot", \{\s*p_quote_id: lockedQuoteId,/);
  // Attributie komt nooit in een RPC-aanroep en niet in quote_id.
  assert.ok(!/p_source_quote_id/.test(src));
  assert.ok(!/quote_id:\s*quoteLink/.test(src));
});

// ── Migratievoorstel: betaalstart zonder gedragswijziging ────────────────────

function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `${name} niet gevonden`);
  const end = sql.indexOf("$function$;", start);
  return sql
    .slice(start, end)
    .split("\n")
    .map((l) => l.replace(/--.*$/, "").trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

const MIGRATION = readdirSync("supabase/migrations").find((f) =>
  f.endsWith("_h3_booking_quote_source_and_payment_start.sql")
);

test("migratie: link_booking_payment wijzigt alleen door payment_started_at toe te voegen", () => {
  assert.ok(MIGRATION, "migratievoorstel ontbreekt");
  const original = functionBody(
    readFileSync("supabase/migrations/20260724120000_stripe_payment_status.sql", "utf8"),
    "link_booking_payment"
  );
  const proposed = functionBody(readFileSync(`supabase/migrations/${MIGRATION}`, "utf8"), "link_booking_payment");

  const added = "payment_started_at = coalesce(payment_started_at, pg_catalog.now())";
  assert.ok(proposed.includes(added), "betaalstart moet het eerste moment bewaren (coalesce)");
  const normalized = proposed
    .replace(/,\npayment_started_at = coalesce\(payment_started_at, pg_catalog\.now\(\)\)/, "")
    .trim();
  assert.equal(normalized, original.trim());
});

test("migratie: additief, idempotent en rechten gelijk", () => {
  const sql = readFileSync(`supabase/migrations/${MIGRATION}`, "utf8");
  const code = sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
  assert.match(code, /add column if not exists source_quote_id uuid/);
  assert.match(code, /add column if not exists payment_started_at timestamptz/);
  assert.match(code, /create index if not exists bookings_source_quote_id_idx/);
  // Geen unieke index op attributie en geen destructieve stap buiten de rollback-notitie.
  assert.ok(!/create unique index[^;]*source_quote_id/i.test(code));
  assert.ok(!/\bdrop\b/i.test(code));
  assert.ok(!/not null/i.test(code.replace(/is not null/gi, "")));
  assert.match(code, /revoke execute on function public\.link_booking_payment\(uuid, text, integer, text\) from public, anon, authenticated/);
  assert.match(code, /grant execute on function public\.link_booking_payment\(uuid, text, integer, text\) to service_role/);
  // De quote-lock-RPC wordt niet aangeraakt.
  assert.ok(!/create_booking_from_snapshot/.test(code));
});
