import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Bewaakt de gecanoniseerde prijsstate van vaste routes.
 *
 * Dit is geen commercieel oordeel over een tarief. Het is een drift-guard: de 89
 * rijen hieronder zijn de state die productie op 2026-09-28 draaide, read-only
 * uitgelezen en vastgelegd in
 * `20260928120000_pricing_canonical_baseline.sql`. Wie een bedrag wijzigt zonder
 * dat bewust te doen, laat deze test vallen op de fingerprint.
 *
 * Waarom een test nodig was: de 722 bestaande pricingtests mocken de database, dus
 * een verse installatie kon 47 in plaats van 89 routes opleveren zonder dat één
 * test daarop viel.
 */
const baseline = readFileSync(
  "supabase/migrations/20260928120000_pricing_canonical_baseline.sql",
  "utf8",
);

type Row = {
  pickup: string;
  dropoff: string;
  vclass: string;
  price: string;
  returnPrice: string;
  active: string;
  serviceType: string;
};

function canonicalRows(): Row[] {
  const block = /insert into _canonical_pricing values\n([\s\S]*?);\n/.exec(baseline);
  assert.ok(block, "de canonieke dataset moet in de migratie staan");
  return block[1]
    .trim()
    .split("\n")
    .map((line) => {
      const fields = line.trim().replace(/,$/, "").replace(/^\(|\)$/g, "").split(",");
      const [pickup, dropoff, vclass, price, returnPrice, active, serviceType] = fields.map((f) =>
        f.trim().replace(/^'|'$/g, ""),
      );
      return { pickup, dropoff, vclass, price, returnPrice, active, serviceType };
    });
}

const rows = canonicalRows();
const byKey = new Map(rows.map((r) => [`${r.pickup}>${r.dropoff}:${r.vclass}`, r]));

function expectPrice(key: string, price: string, returnPrice: string): void {
  const row = byKey.get(key);
  assert.ok(row, `${key} moet in de canonieke baseline staan`);
  assert.equal(row.price, price, `${key} prijs`);
  assert.equal(row.returnPrice, returnPrice, `${key} retourprijs`);
}

// ── Vorm en omvang ───────────────────────────────────────────────────────
test("de baseline legt exact de bewezen 89 business-routes vast", () => {
  assert.equal(rows.length, 89);
  assert.equal(byKey.size, 89, "business keys moeten uniek zijn");
});

test("de fingerprint over de business-state is onveranderd", () => {
  // Veld voor veld in code-unit-orde, gelijk aan `order by pickup, dropoff, vclass`
  // in de database. localeCompare wijkt hier af en zou een andere hash geven.
  const sorted = [...rows].sort((a, b) => {
    if (a.pickup !== b.pickup) return a.pickup < b.pickup ? -1 : 1;
    if (a.dropoff !== b.dropoff) return a.dropoff < b.dropoff ? -1 : 1;
    return a.vclass < b.vclass ? -1 : a.vclass > b.vclass ? 1 : 0;
  });
  const payload = sorted
    .map(
      (r) =>
        `${r.pickup}>${r.dropoff}:${r.vclass}=${r.price}/${r.returnPrice === "null" ? "-" : r.returnPrice}/${r.active}`,
    )
    .join("|");
  assert.equal(
    createHash("md5").update(payload).digest("hex"),
    "33f15a3daf68e071ad363791ea529c68",
    "de gecanoniseerde prijsstate is gewijzigd; dat mag alleen bij een expliciet prijsbesluit",
  );
});

test("geen enkele rij wordt op fixed_route_prices.id geïdentificeerd", () => {
  // De hele reden dat deze baseline bestaat: UUID's zijn per omgeving anders.
  assert.doesNotMatch(baseline, /fixed_route_prices\s+set/i, "geen update op id");
  assert.doesNotMatch(
    baseline,
    /'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/,
    "een hard-coded UUID hoort hier niet",
  );
  assert.match(baseline, /join public\.locations p on p\.slug = w\.pickup_slug/);
  assert.match(baseline, /join public\.vehicle_classes v on v\.code = w\.vclass_code/);
});

test("de twee safeguards staan er en zijn niet destructief", () => {
  assert.match(baseline, /raise exception 'pricing_canonical_unknown_reference/);
  assert.match(baseline, /raise warning 'pricing_canonical_extra_rows/);
  assert.doesNotMatch(baseline, /delete from public\.fixed_route_prices/i);
  assert.doesNotMatch(baseline, /truncate/i);
});

// ── De zeven eerder gedrifte tarieven, op canonieke waarde ───────────────
test("de zeven gecorrigeerde Schipholtarieven staan op de productiewaarde", () => {
  expectPrice("amsterdam>schiphol-airport:executive-ev", "65.00", "117.00");
  expectPrice("den-haag>schiphol-airport:executive-ev", "114.00", "205.00");
  expectPrice("almere-haven>schiphol-airport:executive-ev", "106.00", "191.00");
  expectPrice("almere-stad-centrum>schiphol-airport:executive-ev", "106.00", "191.00");
  expectPrice("almere-buiten>schiphol-airport:executive-ev", "114.00", "205.00");
  expectPrice("amsterdam-centrum>schiphol-airport:executive-ev", "61.00", "110.00");
  expectPrice("spijkenisse>schiphol-airport:executive-ev", "137.00", "247.00");
});

test("een catch-all is nooit goedkoper dan het duurste stadsdeel van dezelfde stad", () => {
  // De regel waar de correcties van 25 september om gingen.
  for (const city of ["den-haag", "amsterdam", "spijkenisse", "almere", "rotterdam"]) {
    const catchAll = byKey.get(`${city}>schiphol-airport:executive-ev`);
    if (!catchAll) continue;
    const districts = rows.filter(
      (r) => r.pickup.startsWith(`${city}-`) && r.dropoff === "schiphol-airport",
    );
    if (districts.length === 0) continue;
    const duurste = Math.max(...districts.map((r) => Number(r.price)));
    assert.equal(
      Number(catchAll.price),
      duurste,
      `${city}: catch-all ${catchAll.price} moet gelijk zijn aan het duurste stadsdeel ${duurste}`,
    );
  }
});

// ── De 42 routes die eerder alleen op productie stonden ──────────────────
test("de zes Den Haag-stadsdelen naar Schiphol zijn canoniek", () => {
  expectPrice("den-haag-benoordenhout>schiphol-airport:executive-ev", "105.00", "189.00");
  expectPrice("den-haag-centrum>schiphol-airport:executive-ev", "110.00", "198.00");
  expectPrice("den-haag-loosduinen>schiphol-airport:executive-ev", "114.00", "205.00");
  expectPrice("den-haag-scheveningen>schiphol-airport:executive-ev", "112.00", "202.00");
  expectPrice("den-haag-statenkwartier>schiphol-airport:executive-ev", "111.00", "200.00");
  expectPrice("den-haag-ypenburg>schiphol-airport:executive-ev", "105.00", "189.00");
});

test("de zes Rotterdam-stadsdelen naar Schiphol zijn canoniek", () => {
  expectPrice("rotterdam-blijdorp>schiphol-airport:executive-ev", "105.00", "189.00");
  expectPrice("rotterdam-centrum>schiphol-airport:executive-ev", "109.00", "196.00");
  expectPrice("rotterdam-delfshaven>schiphol-airport:executive-ev", "109.00", "196.00");
  expectPrice("rotterdam-hillegersberg>schiphol-airport:executive-ev", "105.00", "189.00");
  expectPrice("rotterdam-kralingen>schiphol-airport:executive-ev", "115.00", "207.00");
  expectPrice("rotterdam-prins-alexander>schiphol-airport:executive-ev", "119.00", "214.00");
});

test("de intercitymatrix is canoniek", () => {
  expectPrice("utrecht>tilburg:executive-ev", "129.00", "232.00");
  expectPrice("den-haag>eindhoven:executive-ev", "205.00", "369.00");
  expectPrice("almere>breda:executive-ev", "175.00", "315.00");
  expectPrice("rotterdam>den-bosch:executive-ev", "125.00", "225.00");
  const intercity = rows.filter((r) => r.serviceType === "intercity");
  assert.equal(intercity.length, 45, "aantal intercityroutes");
});

test("beide richtingen bestaan waar productie ze heeft", () => {
  expectPrice("rotterdam>den-haag:executive-ev", "55.00", "99.00");
  expectPrice("den-haag>rotterdam:executive-ev", "55.00", "99.00");
  expectPrice("amsterdam>utrecht:executive-ev", "85.00", "153.00");
  expectPrice("utrecht>amsterdam:executive-ev", "85.00", "153.00");
});

test("alle routes gebruiken een bekende vehicle class en service type", () => {
  for (const r of rows) {
    assert.equal(r.vclass, "executive-ev");
    assert.ok(["airport", "intercity"].includes(r.serviceType), `${r.serviceType} onbekend`);
  }
});
