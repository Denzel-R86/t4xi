/**
 * Statistiek voor het meetprotocol (docs/experience-2.0/measurement-protocol.md).
 *
 * Bewust zonder dependency en deterministisch (geseede RNG voor de bootstrap), zodat
 * dezelfde ruwe runs altijd dezelfde samenvatting en dezelfde gate-uitspraak geven.
 */

/** Alleen eindige getallen; null/undefined/NaN vallen weg. */
export const finite = (xs) => xs.filter((x) => typeof x === "number" && Number.isFinite(x));

/**
 * Kwantiel met lineaire interpolatie (Hyndman–Fan type 7, gelijk aan numpy/Excel
 * PERCENTILE.INC). q ∈ [0, 1].
 */
export function quantile(xs, q) {
  const s = finite(xs).sort((a, b) => a - b);
  if (!s.length) return null;
  const h = (s.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return s[lo] + (h - lo) * (s[hi] - s[lo]);
}

/**
 * Modusdetectie: zoekt de grootste sprong in de gesorteerde waarden. De verdeling heet
 * bimodaal als die sprong ≥ `minGapRel` × mediaan én ≥ `minGapAbs` is, en beide
 * groepen ≥ `minShare` van de runs bevatten. Simpel en uitlegbaar; geen dip-test,
 * want bij n = 15–30 is een harde, zichtbare sprong informatiever dan een p-waarde.
 */
export function detectModes(xs, { minGapRel = 0.25, minGapAbs = 300, minShare = 0.15 } = {}) {
  const s = finite(xs).sort((a, b) => a - b);
  if (s.length < 4) return { bimodal: false, modes: [] };
  const med = quantile(s, 0.5);
  let best = { gap: 0, i: -1 };
  for (let i = 0; i < s.length - 1; i++) {
    const gap = s[i + 1] - s[i];
    if (gap > best.gap) best = { gap, i };
  }
  const lowN = best.i + 1;
  const highN = s.length - lowN;
  const bimodal =
    best.gap >= minGapRel * med &&
    best.gap >= minGapAbs &&
    lowN / s.length >= minShare &&
    highN / s.length >= minShare;
  if (!bimodal) return { bimodal: false, modes: [] };
  const low = s.slice(0, lowN);
  const high = s.slice(lowN);
  const split = (s[best.i] + s[best.i + 1]) / 2;
  return {
    bimodal: true,
    split,
    modes: [
      { name: "snel", n: low.length, share: low.length / s.length, median: quantile(low, 0.5), min: low[0], max: low.at(-1) },
      { name: "traag", n: high.length, share: high.length / s.length, median: quantile(high, 0.5), min: high[0], max: high.at(-1) },
    ],
  };
}

/** Samenvatting per metriek: n, mediaan, p75, IQR, min/max, CV en modi. */
export function describe(xs, modeOpts) {
  const v = finite(xs);
  if (!v.length) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, v.length - 1));
  const p25 = quantile(v, 0.25);
  const p75 = quantile(v, 0.75);
  return {
    n: v.length,
    median: quantile(v, 0.5),
    p75,
    p25,
    iqr: p75 - p25,
    min: Math.min(...v),
    max: Math.max(...v),
    cv: mean ? sd / mean : null,
    ...detectModes(v, modeOpts),
  };
}

/** Mulberry32: kleine, geseede PRNG — reproduceerbare bootstrap. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standaardnormale CDF (Abramowitz–Stegun 7.1.26), ruim nauwkeurig genoeg voor p < 0,05. */
function normCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const y =
    1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/**
 * Eenzijdige Mann-Whitney U-toets (H1: b is stochastisch groter dan a), normale
 * benadering met tie-correctie en continuïteitscorrectie. Toetst de hele verdeling,
 * dus ook een verschuiving van het aandeel trage runs bij een bimodale pagina.
 */
export function mannWhitneyGreater(a, b) {
  const A = finite(a);
  const B = finite(b);
  const n1 = A.length;
  const n2 = B.length;
  if (!n1 || !n2) return null;
  const all = [...A.map((v) => ({ v, g: 0 })), ...B.map((v) => ({ v, g: 1 }))].sort((x, y) => x.v - y.v);
  const ranks = new Array(all.length);
  let tieTerm = 0;
  for (let i = 0; i < all.length; ) {
    let j = i;
    while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
    const r = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) ranks[k] = r;
    const t = j - i + 1;
    tieTerm += t ** 3 - t;
    i = j + 1;
  }
  let rB = 0;
  all.forEach((x, i) => {
    if (x.g === 1) rB += ranks[i];
  });
  const uB = rB - (n2 * (n2 + 1)) / 2;
  const mu = (n1 * n2) / 2;
  const N = n1 + n2;
  const sigma = Math.sqrt(((n1 * n2) / 12) * (N + 1 - tieTerm / (N * (N - 1))));
  if (!sigma) return { u: uB, z: 0, p: 0.5 };
  const z = (uB - mu - 0.5) / sigma;
  return { u: uB, z, p: 1 - normCdf(z) };
}

/** Bootstrap-95%-interval van de verhouding p75(b)/p75(a). */
export function bootstrapRatioCI(a, b, { q = 0.75, iterations = 4000, seed = 42 } = {}) {
  const A = finite(a);
  const B = finite(b);
  if (!A.length || !B.length) return null;
  const rand = rng(seed);
  const resample = (xs) => xs.map(() => xs[Math.floor(rand() * xs.length)]);
  const ratios = [];
  for (let i = 0; i < iterations; i++) {
    const qa = quantile(resample(A), q);
    if (qa > 0) ratios.push(quantile(resample(B), q) / qa);
  }
  return { lo: quantile(ratios, 0.025), hi: quantile(ratios, 0.975) };
}

/**
 * Gate van masterplan §10 (> 10% verslechtering) op één metriek, volgens het protocol:
 *   · "regressie"   — p75-ratio > 1,10 én Mann-Whitney eenzijdig p < 0,05
 *   · "onbeslist"   — p75-ratio > 1,10 maar p ≥ 0,05 → meer runs (verdubbel n) en opnieuw
 *   · "verbetering" — p75-ratio < 0,90 én de omgekeerde toets p < 0,05 én BI-bovengrens ≤ 1,10
 *   · "geen-regressie" — geen van bovenstaande én bovengrens bootstrap-95%-BI van de ratio ≤ 1,10
 *   · "onbeslist"   — anders (een niet-significante toets bewijst geen regressie < 10%)
 * Bij te weinig runs (n < minN) is de uitkomst altijd "onvoldoende-runs".
 */
export function gate(baseline, candidate, { threshold = 0.1, alpha = 0.05, minN = 15 } = {}) {
  const A = finite(baseline);
  const B = finite(candidate);
  const p75A = quantile(A, 0.75);
  const p75B = quantile(B, 0.75);
  const ratio = p75A ? p75B / p75A : null;
  const worse = mannWhitneyGreater(A, B);
  const better = mannWhitneyGreater(B, A);
  const ci = bootstrapRatioCI(A, B);
  let verdict;
  if (A.length < minN || B.length < minN) verdict = "onvoldoende-runs";
  else if (ratio > 1 + threshold) verdict = worse.p < alpha ? "regressie" : "onbeslist";
  else if (!(ci && ci.hi <= 1 + threshold)) verdict = "onbeslist";
  else if (ratio < 1 - threshold && better.p < alpha) verdict = "verbetering";
  else verdict = "geen-regressie";
  return {
    verdict,
    /** Gate §10 gehaald: alleen bij "verbetering" of "geen-regressie" (beide met BI-bovengrens ≤ 1 + threshold). */
    passed: verdict === "verbetering" || verdict === "geen-regressie",
    nA: A.length,
    nB: B.length,
    medianA: quantile(A, 0.5),
    medianB: quantile(B, 0.5),
    p75A,
    p75B,
    ratio,
    ratioCI95: ci,
    pWorse: worse?.p ?? null,
    pBetter: better?.p ?? null,
  };
}
