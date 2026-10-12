import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import {
  applyArrivalSurcharge,
  resolveArrivalSurcharge,
  type AirportArrivalSurcharge,
} from "@/lib/pricing/airport-arrival-surcharge";
import { nightSurchargeCents, NIGHT_SURCHARGE_RATE } from "@/lib/pricing/snapshot";

/**
 * Stadsroutes naar/van Schiphol voor Almere en Utrecht (2026-10-12).
 *
 * Achtergrond. `Schiphol → Almere` en `Schiphol → Utrecht` leverden geen vaste
 * prijs op, terwijl `Schiphol → 1361BP Almere` dat wél deed. De oorzaak lag niet
 * in de spiegeling van 20261010120500 maar in de routeinventaris: er bestond
 * GEEN enkele vaste route tussen `almere` of `utrecht` als STAD en een
 * luchthaven, in geen van beide richtingen. Spiegeling kan niets maken wat er
 * niet was.
 *
 * Deze tests volgen hetzelfde patroon als reverse-route-coverage.test.ts: de
 * borging zit in de DATA, via een migratie die hard faalt bij iedere afwijking,
 * en deze tests bewaken dat die guards aanwezig blijven. Daarnaast wordt de
 * prijsrekenkunde met de ECHTE functies nagerekend.
 */

const MIGRATIES = new URL("../../supabase/migrations/", import.meta.url);

const STAD = "20261012080000_city_airport_routes.sql";
const SPIEGEL = "20261010120500_reverse_fixed_routes.sql";
const SOURCE_LABEL = "stadsroute-luchthaven-2026-10-12";

const lees = (naam: string) => readFileSync(new URL(naam, MIGRATIES), "utf8");

/** SQL zonder `--`-commentaar, zodat toelichtingen de scans niet vervuilen. */
const code = (naam: string) =>
  lees(naam)
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");

/**
 * Wijkprijzen naar Schiphol zoals read-only gemeten op productie 2026-10-12.
 * De MAX hiervan is per conventie de stadsprijs; zie de migratie.
 */
const WIJKPRIJZEN = {
  almere: [102, 105, 106, 106, 113, 114, 116],
  utrecht: [104, 110, 117],
} as const;

const STADSPRIJS = { almere: 116, utrecht: 117 } as const;
const STADSRETOUR = { almere: 209, utrecht: 211 } as const;

// ── Migratiebron ─────────────────────────────────────────────────────────────

test("de stadsroutemigratie bestaat precies één keer", () => {
  const gevonden = readdirSync(MIGRATIES).filter((n) => n.includes("city_airport_routes"));
  assert.deepEqual(gevonden, [STAD]);
});

test("de migratie ligt NA de spiegeling, zodat die haar 48 blijft zien", () => {
  // Bij een verse installatie draait 20261010120500 eerst en telt dan nog geen
  // stadsroutes mee; een eerdere timestamp zou haar invariant laten afbreken.
  const stadVersie = STAD.slice(0, 14);
  const spiegelVersie = SPIEGEL.slice(0, 14);
  assert.ok(stadVersie > spiegelVersie, `${stadVersie} moet na ${spiegelVersie} liggen`);
});

test("precies vier rijen, met een EIGEN source_label", () => {
  const sql = code(STAD);
  assert.match(sql, /if nieuw <> 4 then/, "aantalcontrole op 4 rijen");
  assert.ok(sql.includes(SOURCE_LABEL), "eigen source_label aanwezig");
  assert.ok(
    !sql.includes("'spiegeling-terugrichting-2026-10-10',"),
    "mag de 48 van 10-10 niet als eigen label gebruiken"
  );
});

test("de spiegelset van 10-10 wordt expliciet op 48 gecontroleerd", () => {
  const sql = code(STAD);
  assert.match(sql, /meegeteld_met_48 <> 48/, "waakt dat de 48 niet aangroeit");
});

test("de MAX-wijkprijsconventie wordt in de migratie GETOETST, niet aangenomen", () => {
  const sql = code(STAD);
  assert.match(sql, /city_airport_convention_broken/, "faalt als de conventie is geschonden");
  assert.match(sql, /max\(f\.price\)/, "berekent de werkelijke MAX-wijkprijs");
  assert.match(sql, /city_airport_source_mismatch/, "faalt als de bronwijk is gewijzigd");
});

test("drie guards vóór het invoegen, elk met een eigen foutcode", () => {
  const sql = code(STAD);
  for (const guard of [
    "city_airport_unknown_reference",
    "city_airport_convention_broken",
    "city_airport_existing_price_differs",
  ]) {
    assert.ok(sql.includes(guard), `guard ontbreekt: ${guard}`);
  }
});

test("bestaande wijkprijzen worden niet geraakt en wél geteld", () => {
  const sql = code(STAD);
  assert.match(sql, /wijken_almere <> 7/, "7 Almere-wijken blijven actief");
  assert.match(sql, /wijken_utrecht <> 3/, "3 Utrechtse wijken blijven actief");
  // Geen UPDATE op een prijsveld: de migratie is puur additief.
  assert.ok(
    !/update\s+public\.fixed_route_prices[\s\S]*?set[\s\S]*?\bprice\b/i.test(sql),
    "mag geen bestaande prijs bijwerken"
  );
});

test("idempotent via on conflict do nothing op de business key", () => {
  const sql = code(STAD);
  assert.match(sql, /on conflict \(pickup_location_id, dropoff_location_id, vehicle_class_id\) do nothing/);
});

test("heen en terug moeten prijsidentiek zijn", () => {
  assert.match(code(STAD), /asymmetrie > 0/, "controle op prijsasymmetrie aanwezig");
});

test("rollback staat gedocumenteerd op source_label, nooit op id", () => {
  const ruw = lees(STAD);
  assert.ok(ruw.includes("ROLLBACK"), "rollbacksectie aanwezig");
  const rollback = ruw.slice(ruw.indexOf("ROLLBACK"));
  assert.ok(rollback.includes(`source_label = '${SOURCE_LABEL}'`), "rollback op source_label");
  assert.ok(!/where\s+id\s*=/.test(rollback), "rollback mag nooit op rij-id");
});

test("de vier rijen staan er met de juiste prijzen in", () => {
  const sql = code(STAD);
  for (const regel of [
    `('almere',           'schiphol-airport', 'executive-ev', ${STADSPRIJS.almere}.00, ${STADSRETOUR.almere}.00`,
    `('schiphol-airport', 'almere',           'executive-ev', ${STADSPRIJS.almere}.00, ${STADSRETOUR.almere}.00`,
    `('utrecht',          'schiphol-airport', 'executive-ev', ${STADSPRIJS.utrecht}.00, ${STADSRETOUR.utrecht}.00`,
    `('schiphol-airport', 'utrecht',          'executive-ev', ${STADSPRIJS.utrecht}.00, ${STADSRETOUR.utrecht}.00`,
  ]) {
    assert.ok(sql.includes(regel), `rij ontbreekt of wijkt af: ${regel}`);
  }
});

// ── De conventie zelf ────────────────────────────────────────────────────────

test("stadsprijs = MAX van de wijkprijzen, voor beide steden", () => {
  assert.equal(STADSPRIJS.almere, Math.max(...WIJKPRIJZEN.almere));
  assert.equal(STADSPRIJS.utrecht, Math.max(...WIJKPRIJZEN.utrecht));
});

test("de stadsprijs onderprijst geen enkele wijk", () => {
  // Dit is de reden om MAX te kiezen en niet het gemiddelde of de mediaan: wie
  // de kale stadsnaam invult mag nooit minder betalen dan de duurste wijk.
  for (const [stad, prijzen] of Object.entries(WIJKPRIJZEN)) {
    for (const p of prijzen) {
      assert.ok(
        STADSPRIJS[stad as keyof typeof STADSPRIJS] >= p,
        `${stad}: stadsprijs ${STADSPRIJS[stad as keyof typeof STADSPRIJS]} < wijkprijs ${p}`
      );
    }
  }
});

// ── Rekenkunde met de echte functies ─────────────────────────────────────────

const SCHIPHOL: AirportArrivalSurcharge = resolveArrivalSurcharge({
  pickupIsAirport: true,
  config: { airportSlug: "schiphol-airport", surchargeCents: 1500 } as never,
})!;

test("de toeslag wordt exact EENMAAL toegepast bij een luchthaven-pickup", () => {
  const r = applyArrivalSurcharge({
    singleCents: STADSPRIJS.almere * 100,
    returnCents: STADSRETOUR.almere * 100,
    surcharge: SCHIPHOL,
    appliesToSingle: true,
  });
  assert.equal(r.singleCents, 116_00 + 1500, "€116,00 + €15,00 = €131,00");
  assert.equal(r.returnCents, 209_00 + 1500, "€209,00 + €15,00 = €224,00");
});

test("stad → luchthaven houdt de enkele prijs ongemoeid; alleen het retour krijgt de toeslag", () => {
  const r = applyArrivalSurcharge({
    singleCents: STADSPRIJS.almere * 100,
    returnCents: STADSRETOUR.almere * 100,
    surcharge: SCHIPHOL,
    appliesToSingle: false,
  });
  assert.equal(r.singleCents, 116_00, "Almere → Schiphol blijft €116,00");
  assert.equal(r.returnCents, 209_00 + 1500, "de terugrit vertrekt vanaf Schiphol");
});

test("zonder toeslagconfiguratie verandert er niets", () => {
  const r = applyArrivalSurcharge({
    singleCents: STADSPRIJS.utrecht * 100,
    returnCents: STADSRETOUR.utrecht * 100,
    surcharge: null,
    appliesToSingle: true,
  });
  assert.equal(r.singleCents, 117_00);
  assert.equal(r.returnCents, 211_00);
});

test("het nachttarief rekent over de BASISprijs, niet over de prijs mét toeslag", () => {
  const basis = STADSPRIJS.utrecht * 100;
  const nacht = nightSurchargeCents(basis);
  const metToeslag = applyArrivalSurcharge({
    singleCents: basis,
    returnCents: null,
    surcharge: SCHIPHOL,
    appliesToSingle: true,
  }).singleCents;

  assert.equal(nacht, Math.round(basis * NIGHT_SURCHARGE_RATE), "15% van €117,00");
  assert.equal(basis + nacht + 1500, metToeslag + nacht, "optelling is commutatief én toeslagvrij");
  // Was de toeslag wél in de nachtbasis getrokken, dan was het nachtdeel hoger:
  assert.ok(
    nightSurchargeCents(metToeslag) > nacht,
    "controle dat de twee grondslagen echt verschillen"
  );
});

test("een niet-luchthaven-pickup krijgt nooit een toeslag", () => {
  assert.equal(resolveArrivalSurcharge({ pickupIsAirport: false, config: null }), null);
});
