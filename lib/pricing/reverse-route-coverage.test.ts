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

test("de spiegelmigratie faalt hard wanneer er routes zonder tegenrichting overblijven", () => {
  const sql = leesMigratie("20261010120500_reverse_fixed_routes.sql");
  assert.match(
    sql,
    /raise exception '[^']*zonder tegenrichting/i,
    "de controle op resterende eenrichtingsroutes moet blijven bestaan"
  );
  assert.match(sql, /if resterend <> 0 then/, "de controle moet op exact nul blijven staan");
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
