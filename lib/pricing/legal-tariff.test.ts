import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTariffComparison, LEGAL_TAXI_TARIFF } from "@/lib/pricing/legal-tariff";

test("voorbeeldrit 39 km / 38 min / €102 — exacte cijfers uit de specificatie", () => {
  // 4.31 + 39*3.17 + 38*0.52 = 4.31 + 123.63 + 19.76 = 147.70
  const r = computeTariffComparison(39, 38, 102);
  assert.equal(r.km, 39);
  assert.equal(r.min, 38);
  assert.equal(r.taxameterMaximum, 147.7);
  assert.equal(r.voordeelInEuro, 45.7);
  assert.equal(r.voordeelPercentage, 31);
  assert.equal(r.isVoordeliger, true);
  assert.equal(r.startcomponent, 2.98);
  assert.equal(r.afstandscomponent, 85.37);
  assert.equal(r.tijdscomponent, 13.65);
  assert.equal(r.bedragExclusiefBtw, 93.58);
  assert.equal(r.btwBedrag, 8.42);
  assert.equal(
    Math.round((r.startcomponent + r.afstandscomponent + r.tijdscomponent) * 100) / 100,
    102
  );
  assert.equal(Math.round((r.bedragExclusiefBtw + r.btwBedrag) * 100) / 100, 102);
});

test("decimale afstand (104,8 km) — interface en berekening gebruiken dezelfde afgeronde waarde", () => {
  // 104.8 km rondt af naar 105 km, 95.4 min rondt af naar 95 min — computeTariffComparison
  // rondt zelf af en geeft die afgeronde waarden terug, dus km/min hier ZIJN de waarden
  // die ook getoond worden (geen aparte afronding meer in de interface).
  const r = computeTariffComparison(104.8, 95.4, 300);
  assert.equal(r.km, 105);
  assert.equal(r.min, 95);

  // Het taxametermaximum moet zijn opgebouwd uit exact de afgeronde 105 km / 95 min —
  // NIET uit de ruwe 104.8/95.4 — anders tellen de zichtbare regels niet op.
  const verwachtMaximum =
    LEGAL_TAXI_TARIFF.starttarief + 105 * LEGAL_TAXI_TARIFF.kilometertarief + 95 * LEGAL_TAXI_TARIFF.minuuttarief;
  assert.equal(r.taxameterMaximum, Math.round(verwachtMaximum * 100) / 100);

  const starttariefRegel = LEGAL_TAXI_TARIFF.starttarief;
  const afstandRegel = r.km * LEGAL_TAXI_TARIFF.kilometertarief;
  const tijdRegel = r.min * LEGAL_TAXI_TARIFF.minuuttarief;
  const somRegels = Math.round((starttariefRegel + afstandRegel + tijdRegel) * 100) / 100;
  assert.equal(somRegels, r.taxameterMaximum, "zichtbare regels moeten optellen tot het getoonde maximum");

  // Prijsopbouw-componenten tellen exact op tot de vaste prijs.
  assert.equal(
    Math.round((r.startcomponent + r.afstandscomponent + r.tijdscomponent) * 100) / 100,
    300
  );
  assert.equal(Math.round((r.bedragExclusiefBtw + r.btwBedrag) * 100) / 100, 300);
});

test("alle bedragen zijn centnauwkeurig afgerond (max. 2 decimalen)", () => {
  const cases: [number, number, number][] = [
    [39, 38, 102],
    [104.8, 95.4, 300],
    [13.7, 12.3, 45],
    [1, 1, 1],
  ];
  const decimals = (n: number) => (n.toString().split(".")[1] ?? "").length;
  for (const [km, min, prijs] of cases) {
    const r = computeTariffComparison(km, min, prijs);
    for (const veld of [
      r.taxameterMaximum,
      r.voordeelInEuro,
      r.startcomponent,
      r.afstandscomponent,
      r.tijdscomponent,
      r.bedragExclusiefBtw,
      r.btwBedrag,
    ]) {
      assert.ok(decimals(veld) <= 2, `verwacht max. 2 decimalen, kreeg ${veld}`);
    }
  }
});

test("ongeldige invoer (NaN, negatief, nul) levert nooit NaN en nooit een onbetrouwbare positieve besparing op", () => {
  const ongeldigeInvoer: [number, number, number][] = [
    [Number.NaN, Number.NaN, Number.NaN],
    [-5, -5, -50],
    [0, 0, 0],
    [39, 38, Number.NaN],
    [39, 38, -10],
    [39, 38, 0],
    [Number.NaN, 38, 102],
    [39, Number.NaN, 102],
  ];
  for (const [km, min, prijs] of ongeldigeInvoer) {
    const r = computeTariffComparison(km, min, prijs);
    for (const [naam, veld] of Object.entries(r)) {
      if (typeof veld === "boolean") continue;
      assert.ok(Number.isFinite(veld), `${naam} is niet eindig voor invoer (${km}, ${min}, ${prijs})`);
    }
    assert.equal(r.isVoordeliger, false, `isVoordeliger hoort false te zijn voor (${km}, ${min}, ${prijs})`);
    assert.equal(r.voordeelInEuro, 0, `voordeelInEuro hoort 0 te zijn voor (${km}, ${min}, ${prijs})`);
    assert.equal(r.voordeelPercentage, 0, `voordeelPercentage hoort 0 te zijn voor (${km}, ${min}, ${prijs})`);
  }
});

test("vaste prijs gelijk aan het taxametermaximum → geen voordeel", () => {
  const basis = computeTariffComparison(39, 38, 102);
  const r = computeTariffComparison(39, 38, basis.taxameterMaximum);
  assert.equal(r.isVoordeliger, false);
  assert.ok(r.voordeelInEuro <= 0);
});

test("vaste prijs boven het taxametermaximum → geen voordeel, geen positieve besparing", () => {
  const basis = computeTariffComparison(39, 38, 102);
  const r = computeTariffComparison(39, 38, basis.taxameterMaximum + 20);
  assert.equal(r.isVoordeliger, false);
  assert.ok(r.voordeelInEuro < 0, "voordeel moet negatief zijn, nooit een positieve besparing suggereren");
});
