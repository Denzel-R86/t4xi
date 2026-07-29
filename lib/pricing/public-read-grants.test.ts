import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Regressie — publieke read-grants + pricing-blocker fix (Sprint 7.5).
 * Statische borging (geen live DB): de grant-migratie, de RLS-policies, de
 * seed-route en de booking-tab-i18n. Bewaakt dat een verse DB de vaste route
 * via de anon read-laag kan vinden en dat interne tabellen niet publiek worden.
 */

const grantSql = readFileSync("supabase/migrations/20260725100000_grant_public_read_access.sql", "utf8");
const pricingSql = readFileSync("supabase/migrations/20260705230000_pricing_engine_integrated.sql", "utf8");
const bookingSrc = readFileSync("components/booking/BookingSection.tsx", "utf8");
const nl = JSON.parse(readFileSync("messages/nl.json", "utf8")) as Record<string, Record<string, string>>;
const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as Record<string, Record<string, string>>;

const GRANTED = ["locations", "vehicle_classes", "fixed_route_prices", "cities"];
const NOT_GRANTED = [
  "districts", "airports", "vehicles", "pricing_rules", "price_adjustments",
  "addresses", "popular_locations", "address_search_cache", "bookings", "pricing_quote_logs",
];

// 1. anon/authenticated krijgen SELECT op de vereiste publieke pricing-tabellen
test("1 · grant-migratie geeft SELECT aan anon+authenticated op de required tabellen", () => {
  for (const t of GRANTED) {
    assert.match(grantSql, new RegExp(`public\\.${t}\\b`), `${t} moet in de grant staan`);
  }
  assert.match(grantSql, /grant\s+select\s+on[\s\S]*to\s+anon,\s*authenticated/i);
});

// 2. fixed-route lookup kan slagen met public read-permissions: RLS-policy bestaat
test("2 · RLS SELECT-policies bestaan voor de public read-tabellen (active-only)", () => {
  for (const t of ["locations", "vehicle_classes", "fixed_route_prices", "cities"]) {
    assert.match(pricingSql, new RegExp(`create policy[\\s\\S]*pricing_read_active_${t}`), `policy voor ${t}`);
  }
  // zichtbaarheid beperkt tot active-rijen
  assert.match(pricingSql, /using\s*\(\s*active\s*=\s*true\s*\)/i);
});

// 3. GEEN write-grants op de pricing-tabellen
test("3 · grant-migratie bevat uitsluitend SELECT (geen INSERT/UPDATE/DELETE/ALL)", () => {
  // strip SQL-commentaar (-- ...) zodat toelichtingen als "GRANT is herhaalbaar"
  // de scan niet vervuilen.
  const code = grantSql
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(code, /grant\s+(insert|update|delete|all)\b/i);
  const grants = code.match(/grant\s+\w+/gi) ?? [];
  assert.ok(grants.length > 0, "verwacht ten minste één GRANT");
  for (const g of grants) assert.match(g, /grant\s+select/i, `onverwachte grant: ${g}`);
});

// 4. interne/service-only tabellen krijgen GEEN overbodige SELECT-grant
test("4 · interne tabellen staan niet in de grant-migratie", () => {
  for (const t of NOT_GRANTED) {
    assert.doesNotMatch(grantSql, new RegExp(`public\\.${t}\\b`), `${t} mag GEEN publieke grant krijgen`);
  }
});

// 5. Amsterdam Centrum → Schiphol blijft €57 / €103 in de seed
test("5 · seed bevat amsterdam-centrum → schiphol-airport €57/€103", () => {
  assert.match(
    pricingSql,
    /'amsterdam-centrum'\s*,\s*'schiphol-airport'\s*,\s*57\s*,\s*103\b/,
    "seed-tuple 57/103 moet ongewijzigd zijn"
  );
});

// 6. booking-tabs renderen geen letterlijke placeholder meer
test("6 · BookingSection rendert {t(x.labelKey)} en niet __TABLABEL__", () => {
  assert.doesNotMatch(bookingSrc, /__TABLABEL__/, "placeholder moet weg zijn");
  assert.match(bookingSrc, /\{t\(x\.labelKey\)\}/, "tab-label via i18n-expressie");
});

// 7/8. tab-labels bestaan en zijn niet-leeg in NL en EN
test("7 · NL tab-labels aanwezig en niet-leeg", () => {
  for (const k of ["tabEnkel", "tabRetour", "tabLuchthaven", "tabDagtocht"]) {
    assert.ok(nl.booking?.[k]?.trim(), `nl.booking.${k}`);
  }
});

test("8 · EN tab-labels aanwezig en niet-leeg", () => {
  for (const k of ["tabEnkel", "tabRetour", "tabLuchthaven", "tabDagtocht"]) {
    assert.ok(en.booking?.[k]?.trim(), `en.booking.${k}`);
  }
});
