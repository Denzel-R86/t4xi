import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Bron-/migratieguard: bewaakt de search_path- en grant-hardening van de
// quote-lock-RPC (create_booking_from_snapshot). Voorkomt dat later opnieuw een
// brede/muteerbare search_path of een te ruime grant wordt geïntroduceerd.
const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260807120000_booking_quote_lock.sql"),
  "utf8"
);

test("RPC gebruikt een LEGE search_path (geen brede/muteerbare)", () => {
  assert.match(sql, /set\s+search_path\s*=\s*''/i, "verwacht: set search_path = ''");
  // Geen brede 'public'-search_path (in welke vorm dan ook) in dit migratiebestand.
  assert.doesNotMatch(sql, /search_path\s+to\s+'?public'?/i, "brede search_path 'public' is verboden");
  assert.doesNotMatch(sql, /search_path\s*=\s*'?public'?/i, "brede search_path 'public' is verboden");
});

test("RPC schema-kwalificeert alle gebruikte user-objecten met public.", () => {
  for (const ref of [
    "public.price_snapshots%rowtype",
    "from public.price_snapshots",
    "from public.bookings",
    "from public.vehicle_classes",
    "update public.bookings",
    "update public.price_snapshots",
    "from public.create_booking(",
  ]) {
    assert.ok(sql.includes(ref), `verwacht schema-gekwalificeerde referentie: ${ref}`);
  }
});

test("aangeroepen built-in functies zijn pg_catalog-gekwalificeerd (now/round + cast)", () => {
  assert.match(sql, /pg_catalog\.now\(\)/, "verwacht pg_catalog.now()");
  assert.match(sql, /pg_catalog\.round\(/, "verwacht pg_catalog.round(");
  assert.match(sql, /::pg_catalog\.numeric/, "verwacht ::pg_catalog.numeric");
});

test("execute is gelockt: revoke van public/anon/authenticated, grant alleen service_role", () => {
  assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.create_booking_from_snapshot[\s\S]*?from\s+public,\s*anon,\s*authenticated/i);
  assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.create_booking_from_snapshot[\s\S]*?to\s+service_role/i);
  // Nooit execute aan anon/authenticated/public GRANTen.
  assert.doesNotMatch(sql, /grant\s+execute\s+on\s+function\s+public\.create_booking_from_snapshot[\s\S]*?to\s+(anon|authenticated|public)\b/i);
});
