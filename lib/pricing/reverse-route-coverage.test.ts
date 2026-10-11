import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

/**
 * Migratiebrontests voor de pricingketen (2026-10-10).
 *
 * Achtergrond. Vaste routes bestonden uitsluitend in de richting
 * STAD -> LUCHTHAVEN: 44 van de 59 actieve routes eindigden op een luchthaven,
 * 0 begonnen er. Een rit die OP een luchthaven begon had daardoor geen
 * prijsbron en viel altijd terug op "Offerte op aanvraag".
 *
 * De lookup in service.ts is bewust strikt gericht (pickup -> dropoff) en
 * blijft dat: een stilzwijgende omgekeerde lookup zou betekenen dat de
 * prijsmotor een prijs verzint die niet in de tarieventabel staat. De borging
 * zit daarom in de DATA, via migraties die hard falen bij iedere afwijking.
 * Deze tests bewaken dat die guards aanwezig blijven.
 */

const MIGRATIES = new URL("../../supabase/migrations/", import.meta.url);

const SPIEGEL = "20261010120500_reverse_fixed_routes.sql";
const TOESLAG = "20261010120000_airport_arrival_surcharge.sql";
const BASELINE_V2 = "20261010211234_pricing_canonical_baseline_v2.sql";
const NIEUWE_MIGRATIES = [TOESLAG, SPIEGEL, BASELINE_V2];

const lees = (naam: string) => readFileSync(new URL(naam, MIGRATIES), "utf8");

/** SQL zonder `--`-commentaar, zodat toelichtingen de scans niet vervuilen. */
const code = (naam: string) =>
  lees(naam)
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");

// ── Spiegelmigratie: invoegen én heractiveren ───────────────────────────────

test("de spiegelmigratie bestaat precies één keer", () => {
  const spiegel = readdirSync(MIGRATIES).filter((n) => n.includes("reverse_fixed_routes"));
  assert.deepEqual(spiegel, [SPIEGEL]);
});

test("exact 48 invoegingen en 5 heractiveringen", () => {
  const sql = code(SPIEGEL);
  assert.match(sql, /if inserted_count <> 48 then/, "aantalcontrole op 48 inserts");
  assert.match(sql, /if reactivated_count <> 5 then/, "aantalcontrole op 5 heractiveringen");
});

test("heractivering raakt UITSLUITEND active en updated_at", () => {
  const sql = code(SPIEGEL);
  const update = sql.slice(sql.indexOf("update public.fixed_route_prices x"));
  const tot = update.slice(0, update.indexOf(";"));
  assert.match(tot, /set\s+active\s*=\s*true/);
  assert.match(tot, /updated_at\s*=\s*now\(\)/);
  for (const veld of ["price", "return_price", "distance_km", "service_type", "source_label", "id ="]) {
    assert.doesNotMatch(tot, new RegExp(`set[\\s\\S]*${veld}\\s*=`), `${veld} mag niet overschreven worden`);
  }
});

test("geen generieke ON CONFLICT DO UPDATE die afwijkende data overschrijft", () => {
  assert.doesNotMatch(code(SPIEGEL), /on conflict[\s\S]{0,40}do update/i);
});

test("expliciete conflictguards vóór elke schrijfactie", () => {
  const sql = code(SPIEGEL);
  const guardPos = sql.indexOf("pricing_reverse_price_mismatch");
  const insertPos = sql.indexOf("insert into public.fixed_route_prices");
  assert.ok(guardPos > -1 && insertPos > -1, "guard en insert moeten beide bestaan");
  assert.ok(guardPos < insertPos, "de prijsguard moet vóór de insert staan");
  assert.match(sql, /pricing_reverse_key_mismatch/, "guard op locaties en voertuigklasse");
  assert.match(sql, /pricing_reverse_already_active/, "guard tegen een reeds actieve rij in de werkset");
});

test("afwijkende prijs leidt tot exception, niet tot overschrijven", () => {
  const sql = code(SPIEGEL);
  assert.match(sql, /bestaande_price\s+is distinct from s\.price/);
  assert.match(sql, /bestaande_return\s+is distinct from s\.return_price/);
  assert.match(sql, /raise exception[\s\S]{0,120}pricing_reverse_price_mismatch/i);
});

test("de guard werkt op een expliciete eligible bronset", () => {
  const sql = code(SPIEGEL);
  assert.match(sql, /create temporary table _eligible/i);
  assert.match(sql, /eligible bronroutes zonder tegenrichting/i);
});

test("precies één tegenrichting per bronroute, niet nul en niet twee", () => {
  const sql = code(SPIEGEL);
  assert.match(sql, /if zonder_tegen <> 0 then/);
  assert.match(sql, /if dubbele_tegen <> 0 then/);
});

test("geen onverwachte tegenrichting zonder bronroute", () => {
  assert.match(code(SPIEGEL), /if onverwacht <> 0 then/);
});

test("Antwerpen en Brussel zijn expliciet en controleerbaar uitgesloten", () => {
  const sql = code(SPIEGEL);
  assert.match(sql, /not in \('antwerp-airport', 'brussels-airport'\)/);
  assert.match(sql, /if uitgesloten_fout <> 0 then/);
});

test("de bestaande wederkerige routes blijven onaangeroerd", () => {
  // Amsterdam<->Utrecht en Amsterdam<->Rotterdam: 2 wederkerige paren,
  // samen 4 GERICHTE rijen in fixed_route_prices.
  assert.match(code(SPIEGEL), /if unchanged_existing_count <> 4 then/);
});

// ── Baseline v2 ─────────────────────────────────────────────────────────────

test("baseline v2 bestaat en staat ná de twee aankomstritmigraties", () => {
  const alle = readdirSync(MIGRATIES).filter((n) => n.endsWith(".sql")).sort();
  const i = (n: string) => alle.indexOf(n);
  assert.ok(i(BASELINE_V2) > i(SPIEGEL), "v2 moet na de spiegeling draaien");
  assert.ok(i(SPIEGEL) > i(TOESLAG), "de spiegeling moet na de toeslagconfig draaien");
});

test("baseline v2 legt de volledige verwachte eindstaat vast", () => {
  const sql = code(BASELINE_V2);
  const rijen = (sql.match(/^\s*\('/gm) ?? []).length;
  assert.equal(rijen, 137, "89 bestaande + 48 nieuwe tegenrichtingen");
  assert.match(sql, /if verwacht <> 137 then/);
  assert.match(sql, /if actief <> 112 then/, "59 bestaand + 48 nieuw + 5 geheractiveerd");
  assert.match(sql, /if gespiegeld <> 48 then/);
});

test("baseline v2 markeert de 48 nieuwe en 5 geheractiveerde expliciet", () => {
  const ruw = lees(BASELINE_V2);
  assert.equal((ruw.match(/-- nieuw$/gm) ?? []).length, 48);
  assert.equal((ruw.match(/-- geheractiveerd$/gm) ?? []).length, 5);
});

test("baseline v2 faalt bij prijs- of activatieafwijking", () => {
  const sql = code(BASELINE_V2);
  assert.match(sql, /pricing_canonical_v2_mismatch/);
  assert.match(sql, /f\.active\s+is distinct from w\.active/);
  assert.match(sql, /f\.price\s+is distinct from w\.price/);
});

test("baseline v2 verwijdert of deactiveert niets", () => {
  const sql = code(BASELINE_V2);
  for (const woord of ["delete from", "truncate", "drop table", "update public.fixed_route_prices"]) {
    assert.doesNotMatch(sql, new RegExp(woord, "i"), `v2 mag geen ${woord} bevatten`);
  }
  assert.match(sql, /raise warning[\s\S]{0,120}extra_rows/i, "extra rijen worden gemeld, niet verwijderd");
});

test("baseline v2 bewijst dat Antwerpen/Brussel uitgesloten blijven", () => {
  assert.match(code(BASELINE_V2), /pricing_canonical_v2_excluded_airport_active/);
});

// ── Toeslagconfiguratie: beveiliging ────────────────────────────────────────

test("de toeslagtabel is service-role-only, zonder publieke policy", () => {
  const sql = code(TOESLAG);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on public\.pricing_airport_arrival_surcharge from anon, authenticated/i);
  assert.doesNotMatch(sql, /create policy/i);
});

test("hoogstens één actieve toeslag per luchthaven, plus dekkende FK-index", () => {
  const sql = code(TOESLAG);
  assert.match(sql, /create unique index[\s\S]*?airport_location_id\)\s*\n\s*where active/i);
  assert.match(sql, /create index[\s\S]*?airport_location_id_idx/i);
});

test("bedrag is niet-negatief en begrensd", () => {
  const sql = code(TOESLAG);
  assert.match(sql, /check \(surcharge_cents >= 0/);
  assert.match(sql, /surcharge_cents <= 10000/);
});

test("conflictguard: identiek bestaand = no-op, afwijkend = exception", () => {
  const sql = code(TOESLAG);
  assert.doesNotMatch(sql, /on conflict do nothing/i);
  assert.match(sql, /elsif bestaand <> seed\.surcharge_cents then[\s\S]*?raise exception/i);
});

// ── Statische destructiviteitscontrole over de hele nieuwe keten ────────────

test("geen SECURITY DEFINER in de nieuwe migraties", () => {
  for (const f of NIEUWE_MIGRATIES) {
    assert.doesNotMatch(code(f), /security\s+definer/i, `${f}`);
  }
});

test("geen CASCADE in de nieuwe migraties", () => {
  for (const f of NIEUWE_MIGRATIES) {
    assert.doesNotMatch(code(f), /\bcascade\b/i, `${f}`);
  }
});

test("geen destructieve statements op bestaande prijsdata", () => {
  for (const f of NIEUWE_MIGRATIES) {
    const sql = code(f);
    assert.doesNotMatch(sql, /\bdelete\s+from\b/i, `${f} mag niets verwijderen`);
    assert.doesNotMatch(sql, /\btruncate\s+(table\s+)?public\./i, `${f} mag niets leegmaken`);
    assert.doesNotMatch(sql, /\bdrop\s+table\b/i, `${f} mag geen tabel droppen`);
    assert.doesNotMatch(sql, /set\s+active\s*=\s*false/i, `${f} mag niets deactiveren`);
  }
});

test("elke nieuwe migratie draait in één transactie", () => {
  for (const f of NIEUWE_MIGRATIES) {
    const sql = code(f);
    assert.match(sql, /^\s*begin;/im, `${f} moet met BEGIN starten`);
    assert.match(sql, /commit;\s*$/im, `${f} moet met COMMIT eindigen`);
  }
});

// ── De keten als geheel ─────────────────────────────────────────────────────

test("alleen pricingmigraties zijn nog pending t.o.v. productie", () => {
  // Productie draagt 63 migraties, hoogste versie 20261009120000
  // (ade_2026_window_correction, remote-only), read-only vastgesteld op
  // 2026-10-10 21:20Z. Alles daarboven in de repo is pending.
  const pending = readdirSync(MIGRATIES)
    .filter((n) => n.endsWith(".sql"))
    .filter((n) => n.slice(0, 14) > "20261009120000")
    .sort();
  assert.deepEqual(pending, [TOESLAG, SPIEGEL, BASELINE_V2]);
});

test("geen dubbele versieprefices in de keten", () => {
  const versies = readdirSync(MIGRATIES)
    .filter((n) => n.endsWith(".sql"))
    .map((n) => n.slice(0, 14));
  assert.equal(new Set(versies).size, versies.length, "elke versie moet uniek zijn");
});
