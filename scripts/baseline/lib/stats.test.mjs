// node --test scripts/baseline/lib/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { describe, detectModes, gate, mannWhitneyGreater, quantile, rng } from "./stats.mjs";
import { assertAllowedOrigin, extractLcp } from "./lighthouse.mjs";

test("quantile_uses_linear_interpolation_type7", () => {
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(quantile([1, 2, 3, 4], 0.75), 3.25);
  assert.equal(quantile([5], 0.75), 5);
  assert.equal(quantile([], 0.5), null);
});

test("detects_bimodal_boeken_baseline_runs", () => {
  // De 5 mobiele /boeken-LCP's uit de nulmeting 0.1 (raw/cwv-runs.json, afgerond).
  const m = detectModes([6010, 2800, 6490, 6200, 2850]);
  assert.equal(m.bimodal, true);
  assert.deepEqual(m.modes.map((x) => x.n), [2, 3]);
});

test("unimodal_spread_is_not_reported_as_modes", () => {
  assert.equal(detectModes([2810, 2830, 2850, 2870, 2840, 2820]).bimodal, false);
  // Eén uitschieter (< 15% van de runs) is geen tweede modus.
  assert.equal(detectModes([2800, 2810, 2820, 2830, 2840, 2850, 2860, 2870, 6000]).bimodal, false);
});

test("describe_reports_iqr_and_p75", () => {
  const d = describe([1000, 2000, 3000, 4000, 5000]);
  assert.equal(d.median, 3000);
  assert.equal(d.p75, 4000);
  assert.equal(d.iqr, 2000);
});

test("mann_whitney_flags_clear_shift_and_not_identical_samples", () => {
  const a = [2800, 2810, 2790, 2805, 2820, 2830, 2795, 2815];
  const b = a.map((x) => x + 600);
  assert.ok(mannWhitneyGreater(a, b).p < 0.01);
  assert.ok(mannWhitneyGreater(a, a).p > 0.4);
});

test("gate_requires_min_runs_and_significance", () => {
  const base = Array.from({ length: 15 }, (_, i) => 2800 + i * 5);
  assert.equal(gate(base.slice(0, 5), base.slice(0, 5)).verdict, "onvoldoende-runs");
  assert.equal(gate(base, base.map((x) => x * 1.3)).verdict, "regressie");
  assert.equal(gate(base, base.map((x) => x * 1.05)).verdict, "geen-regressie");
  assert.equal(gate(base.map((x) => x * 2), base).verdict, "verbetering");
  assert.equal(gate(base.map((x) => x * 2), base).passed, true);
  assert.equal(gate(base, base.map((x) => x * 1.3)).passed, false);
});

test("gate_marks_slow_mode_shift_undecided_at_n15_and_regression_at_n30", () => {
  // Basis 4/15 traag (p75 nog net in de snelle modus), kandidaat 9/15 traag: p75 springt
  // > 10%, maar bij n = 15 is dat verschil niet significant → "onbeslist" (meer runs).
  // Onafhankelijke jitter per sample (geseed), zoals echte runs: geen kunstmatige ordening binnen een modus.
  const r = rng(7);
  const mk = (fast, slow) => [...Array(fast).fill(2800), ...Array(slow).fill(6000)].map((x) => x + Math.round(r() * 200));
  assert.equal(gate(mk(11, 4), mk(6, 9)).verdict, "onbeslist");
  // Dezelfde aandelen met verdubbelde n zijn wél onderscheidbaar.
  assert.equal(gate(mk(22, 8), mk(12, 18)).verdict, "regressie");
});

test("gate_does_not_treat_non_significance_as_no_regression", () => {
  // Ratio < 1,10 en niet significant, maar zo veel spreiding dat de BI-bovengrens > 1,10:
  // dat is "onbeslist", nooit "geen-regressie".
  const r = rng(11);
  const a = Array.from({ length: 15 }, () => 2000 + Math.round(r() * 2000));
  const b = a.map((x) => x * 1.04);
  const g = gate(a, b);
  assert.ok(g.ratio <= 1.1 && g.ratioCI95.hi > 1.1);
  assert.equal(g.verdict, "onbeslist");
});

test("gate_rejects_favourable_result_with_too_wide_interval", () => {
  // Gunstige puntschatting (ratio ≈ 0,63) én significante toets (p ≈ 0,005), maar de
  // bovengrens van het 95%-BI ligt ruim boven 1,10: geen "verbetering", gate niet gehaald.
  const mk = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  const a = mk(15, (i) => (i < 10 ? 3000 + i * 10 : 6000 + i * 10));
  const b = mk(15, (i) => (i < 11 ? 1500 + i * 10 : 6000 + i * 10));
  const g = gate(a, b);
  assert.ok(g.ratio < 0.9 && g.pBetter < 0.05 && g.ratioCI95.hi > 1.1);
  assert.equal(g.verdict, "onbeslist");
  assert.equal(g.passed, false);
});

test("extracts_lcp_element_from_lighthouse13_insight", () => {
  const lhr = {
    audits: {
      "lcp-breakdown-insight": {
        details: {
          type: "list",
          items: [
            { type: "table", items: [{ subpart: "timeToFirstByte", duration: 175.2 }, { subpart: "elementRenderDelay", duration: 2443.6 }] },
            { type: "node", selector: "main#content > section > div > p.mt-4", nodeLabel: "Vaste prijs vooraf", snippet: "<p>" },
          ],
        },
      },
    },
  };
  const r = extractLcp(lhr);
  assert.equal(r.element.selector, "main#content > section > div > p.mt-4");
  assert.deepEqual(r.observedSubparts, { timeToFirstByte: 175, elementRenderDelay: 2444 });
  assert.equal(extractLcp({ audits: {} }).element, null);
});

test("only_get_targets_on_allowed_origins", () => {
  assert.equal(assertAllowedOrigin("https://www.t4xi.nl"), "https://www.t4xi.nl");
  assert.equal(assertAllowedOrigin("http://localhost:3112"), "http://localhost:3112");
  assert.ok(assertAllowedOrigin("https://t4xi-git-x.vercel.app"));
  assert.throws(() => assertAllowedOrigin("https://example.com"));
  assert.throws(() => assertAllowedOrigin("http://www.t4xi.nl"));
});
