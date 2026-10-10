import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

/**
 * Regressie-borging voor de oorzaak van 2026-10-10.
 *
 * Vaste routes bestonden uitsluitend in de richting STAD -> LUCHTHAVEN: 44 van
 * de 59 actieve routes eindigden op een luchthaven, 0 begonnen er. Een rit die
 * OP een luchthaven begon had daardoor geen enkele prijsbron en viel altijd
 * terug op "Offerte op aanvraag" — 27 van de laatste 28 aankomstaanvragen.
 *
 * De lookup is bewust strikt gericht (pickup -> dropoff) en blijft dat: een
 * stilzwijgende omgekeerde lookup zou betekenen dat de prijsmotor een prijs
 * verzint die niet in de tarieventabel staat. De borging zit daarom in de
 * DATA — via de migratie, die hard faalt wanneer er na afloop nog een route
 * zonder tegenrichting overblijft.
 *
 * Deze test bewaakt dat die controle in de migratie aanwezig blijft, zodat een
 * latere bewerking hem niet ongemerkt weghaalt.
 */

const MIGRATIES = new URL("../../supabase/migrations/", import.meta.url);

function leesMigratie(bestandsnaam: string): string {
  return readFileSync(new URL(bestandsnaam, MIGRATIES), "utf8");
}

test("de spiegelmigratie bestaat en voegt de tegenrichting toe", () => {
  const namen = readdirSync(MIGRATIES);
  const spiegel = namen.filter((n) => n.includes("reverse_fixed_routes"));
  assert.equal(spiegel.length, 1, "precies één spiegelmigratie verwacht");
});

test("de guard werkt op een EXPLICIETE eligible bronset, niet op een globale bewering", () => {
  const sql = leesMigratie("20261010120500_reverse_fixed_routes.sql");
  assert.match(sql, /create temporary table _eligible/i, "de eligible bronset moet expliciet bepaald worden");
  assert.match(
    sql,
    /raise exception '[^']*eligible bronroutes zonder tegenrichting/i,
    "controle op ontbrekende tegenrichting binnen de eligible set"
  );
});

test("de guard controleert PRECIES één tegenrichting per bronroute", () => {
  const sql = leesMigratie("20261010120500_reverse_fixed_routes.sql");
  assert.match(sql, /if zonder_tegen <> 0 then/, "geen enkele bronroute mag er nul hebben");
  assert.match(sql, /if dubbele_tegen <> 0 then/, "en geen enkele meer dan één");
});

test("de guard verwerpt een onverwachte tegenrichting zonder bronroute", () => {
  const sql = leesMigratie("20261010120500_reverse_fixed_routes.sql");
  assert.match(sql, /if onverwacht <> 0 then/);
  assert.match(sql, /zonder eligible bronroute/i);
});

test("de guard bewijst dat Antwerpen/Brussel NIET gespiegeld zijn", () => {
  const sql = leesMigratie("20261010120500_reverse_fixed_routes.sql");
  assert.match(sql, /if uitgesloten_fout <> 0 then/);
  assert.match(sql, /ten onrechte gespiegeld/i);
});

test("de guard bewaakt de vier bestaande symmetrische paren", () => {
  const sql = leesMigratie("20261010120500_reverse_fixed_routes.sql");
  assert.match(sql, /if symmetrisch_nu <> 8 then/, "4 paren x 2 richtingen = 8 rijen");
});

test("de spiegelmigratie borgt het verwachte aantal nieuwe rijen", () => {
  const sql = leesMigratie("20261010120500_reverse_fixed_routes.sql");
  assert.match(sql, /if aangemaakt <> 53 then/, "aantalcontrole op 53 rijen moet blijven staan");
});

test("Antwerpen en Brussel blijven bewust uitgesloten", () => {
  const sql = leesMigratie("20261010120500_reverse_fixed_routes.sql");
  assert.match(sql, /antwerp-airport/);
  assert.match(sql, /brussels-airport/);
});

test("de toeslag staat in de configuratietabel, niet in de gespiegelde rijen", () => {
  const sql = leesMigratie("20261010120500_reverse_fixed_routes.sql");
  // De gespiegelde rij neemt f.price over — ongewijzigd. Zou hier een optelling
  // staan, dan was het bedrag in de data gebakken en niet meer configureerbaar.
  assert.doesNotMatch(sql, /f\.price\s*\+/, "de toeslag mag niet in de routeprijs gebakken worden");
  assert.match(sql, /select\s+[\s\S]*?f\.price,/, "de gespiegelde rij neemt de heenprijs ongewijzigd over");
});

test("de toeslagconfiguratie is service-role-only, zonder publieke policy", () => {
  const sql = leesMigratie("20261010120000_airport_arrival_surcharge.sql");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on public\.pricing_airport_arrival_surcharge from anon, authenticated/i);
  assert.doesNotMatch(sql, /create policy/i, "geen publieke policy op een prijsconfiguratietabel");
});

test("hoogstens één actieve toeslag per luchthaven", () => {
  const sql = leesMigratie("20261010120000_airport_arrival_surcharge.sql");
  assert.match(sql, /create unique index[\s\S]*?airport_location_id\)\s*\n\s*where active/i);
});

test("geen SECURITY DEFINER om rechten te omzeilen", () => {
  for (const f of ["20261010120000_airport_arrival_surcharge.sql", "20261010120500_reverse_fixed_routes.sql"]) {
    assert.doesNotMatch(leesMigratie(f), /security\s+definer/i, `${f} mag geen SECURITY DEFINER bevatten`);
  }
});

test("geen CASCADE in beide migraties", () => {
  for (const f of ["20261010120000_airport_arrival_surcharge.sql", "20261010120500_reverse_fixed_routes.sql"]) {
    assert.doesNotMatch(leesMigratie(f), /\bcascade\b/i, `${f} mag geen CASCADE bevatten`);
  }
});

test("bedrag is begrensd en niet-negatief", () => {
  const sql = leesMigratie("20261010120000_airport_arrival_surcharge.sql");
  assert.match(sql, /check \(surcharge_cents >= 0/, "niet-negatief");
  assert.match(sql, /surcharge_cents <= 10000/, "bovengrens tegen een typefout van een factor 100");
});

test("conflictguard: identiek bestaand = no-op, afwijkend = exception", () => {
  const sql = leesMigratie("20261010120000_airport_arrival_surcharge.sql");
  // Commentaar strippen: de kop legt juist UIT dat "on conflict do nothing"
  // bewust niet wordt gebruikt, en die toelichting mag de scan niet vervuilen.
  const code = sql
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(code, /on conflict do nothing/i, "een afwijking mag niet stil genegeerd worden");
  assert.match(code, /elsif bestaand <> seed\.surcharge_cents then[\s\S]*?raise exception/i);
});

test("de toeslagtabel krijgt geen publieke read-grant", () => {
  const grant = readFileSync(
    new URL("20260725100000_grant_public_read_access.sql", MIGRATIES),
    "utf8"
  );
  assert.doesNotMatch(grant, /pricing_airport_arrival_surcharge/);
});
