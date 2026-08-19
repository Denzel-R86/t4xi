import { test } from "node:test";
import assert from "node:assert/strict";
import { formatEuro, formatEuroAmount } from "@/lib/format/currency";

// 2026-08-19 (hotfix): regressietests voor de twee live-geconstateerde bugs.
// "€9508": Odometer behandelde `String(95.8).split("")` letterlijk — de "."
// werd als rollende cijferkolom gelezen (Number(".") is NaN, bleef op "0"
// hangen), waardoor "95,8" als "9508" oogde. "€95.8": useRouteQuote plakte
// `€${data.price}` — één decimaal, punt i.p.v. komma. Beide liepen via
// dezelfde onderliggende oorzaak: quote.price werd pas na de pickup-
// aanrijmodel/nachttarief-toevoeging een echt fractioneel eurobedrag.

test("formatEuroAmount: 95.8 → '95,80' (geen '.'-als-cijfer, geen afgekapt decimaal)", () => {
  assert.equal(formatEuroAmount(95.8), "95,80");
});

test("formatEuro: 95.8 → '€ 95,80'", () => {
  assert.equal(formatEuro(95.8), "€ 95,80");
});

test("formatEuroAmount: heel getal krijgt nog steeds twee decimalen", () => {
  assert.equal(formatEuroAmount(69), "69,00");
});

test("formatEuro: heel getal krijgt nog steeds twee decimalen", () => {
  assert.equal(formatEuro(69), "€ 69,00");
});

test("formatEuroAmount: cent-precieze afronding blijft exact (99.99, 102.5)", () => {
  assert.equal(formatEuroAmount(99.99), "99,99");
  assert.equal(formatEuroAmount(102.5), "102,50");
});

test("formatEuroAmount: elk teken behalve 0-9 is een geldig static teken voor Odometer (komma, geen rollende kolom)", () => {
  const formatted = formatEuroAmount(95.8);
  const nonDigits = formatted.split("").filter((ch) => !/[0-9]/.test(ch));
  // Exact één teken (de komma) is geen cijfer — nooit de "." die de oude bug veroorzaakte.
  assert.deepEqual(nonDigits, [","]);
});
