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

// Capaciteits-/voertuigklasse-validatie in de RPC (bron-guard: bewaakt dat de
// vereiste checks aanwezig en correct gestructureerd zijn; runtime-gedrag vergt een
// non-prod DB — apart verificatiepunt).
test("capaciteit: leest max_passengers én max_luggage uit vehicle_classes", () => {
  assert.match(sql, /select\s+vc\.max_passengers,\s*vc\.max_luggage\s+into\s+v_max_pax,\s*v_max_lug/i);
  assert.match(sql, /from\s+public\.vehicle_classes\s+vc/i);
});

test("voertuigklasse komt UITSLUITEND uit de snapshot en moet bestaan + actief zijn", () => {
  // Klasse uit de (fingerprint-gevalideerde) snapshot, niet uit een param.
  assert.match(sql, /vc\.code\s*=\s*\(v_snap\.route_snapshot->>'vehicleClass'\)\s+and\s+vc\.active/i);
  // Onbekend/inactief → INVALID_VEHICLE_CLASS (scenario 1 en 2).
  assert.match(sql, /if\s+not\s+found\s+then\s+raise\s+exception\s+'INVALID_VEHICLE_CLASS'/i);
});

test("scenario 3: te veel passagiers → CAPACITY_EXCEEDED", () => {
  assert.match(sql, /v_persons\s*>\s*v_max_pax\s+then\s+raise\s+exception\s+'CAPACITY_EXCEEDED'/i);
});

test("scenario 4: te veel bagage → CAPACITY_EXCEEDED (categorie → count)", () => {
  // Categorie-naar-count-mapping aanwezig voor de bekende categorieën.
  assert.match(sql, /when\s+'handbagage'\s+then\s+0/i);
  assert.match(sql, /when\s+'1-2-koffers'\s+then\s+2/i);
  assert.match(sql, /when\s+'3-koffers'\s+then\s+3/i);
  assert.match(sql, /v_luggage_count\s*>\s*v_max_lug\s+then\s+raise\s+exception\s+'CAPACITY_EXCEEDED'/i);
});

test("negatieve/onverwachte passagiers → INVALID_PERSONS (bestaande bookingvalidatie)", () => {
  assert.match(sql, /v_persons\s*<\s*1\s+then\s+raise\s+exception\s+'INVALID_PERSONS'/i);
});

test("scenario 5: geldige capaciteit passeert (guards + onbekende bagage blokkeert niet)", () => {
  // Onbekende/'overleg'-bagage → null → geen blokkade.
  assert.match(sql, /else\s+null\s*\n?\s*end;/i);
  // Bagage-check alleen bij een BEKENDE count binnen limiet → binnen limiet passeert.
  assert.match(sql, /v_luggage_count\s+is\s+not\s+null\s+and\s+v_max_lug\s+is\s+not\s+null\s+and\s+v_luggage_count\s*>\s*v_max_lug/i);
  // Na alle checks wordt de boeking daadwerkelijk aangemaakt.
  assert.match(sql, /from\s+public\.create_booking\(/i);
});

test("execute is gelockt: revoke van public/anon/authenticated, grant alleen service_role", () => {
  assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.create_booking_from_snapshot[\s\S]*?from\s+public,\s*anon,\s*authenticated/i);
  assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.create_booking_from_snapshot[\s\S]*?to\s+service_role/i);
  // Nooit execute aan anon/authenticated/public GRANTen.
  assert.doesNotMatch(sql, /grant\s+execute\s+on\s+function\s+public\.create_booking_from_snapshot[\s\S]*?to\s+(anon|authenticated|public)\b/i);
});
