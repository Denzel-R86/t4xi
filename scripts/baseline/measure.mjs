#!/usr/bin/env node
/**
 * Meetprotocol-runner (docs/experience-2.0/measurement-protocol.md).
 *
 * Herhaalde, geïsoleerde Lighthouse-runs per cel (pagina × form factor × variant), met
 * mediaan, p75, IQR, modusdetectie en het LCP-element, plus de §10-gate (> 10%) tussen
 * varianten of tussen twee eerder opgeslagen sessies. Alleen GET's; geen secrets.
 *
 * Meten:
 *   node scripts/baseline/measure.mjs --label=h2-voor --pages=/boeken --runs=15
 *   node scripts/baseline/measure.mjs --label=h2-stripe-ab --pages=/boeken --runs=15 \
 *     --variant="prod|https://www.t4xi.nl" --variant="zonder-stripe|https://www.t4xi.nl|*stripe*"
 *   Opties: --form-factors=mobile,desktop  --throttling=simulate|devtools  --cache=cold|warm
 *           --max-load=<1-min loadavg, default 0,5 × cores>  --allow-busy  --owner=h2
 *           --assets-dir=<map buiten de repo voor traces>  --out=<map>
 * Vergelijken (gate):
 *   node scripts/baseline/measure.mjs --compare=<a/runs.json>[#variant],<b/runs.json>[#variant]
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { cpus, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LH_VERSION, THROTTLING, assertAllowedOrigin, lighthouseRun, waitForQuiet } from "./lib/lighthouse.mjs";
import { describe, gate, quantile } from "./lib/stats.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const log = (s) => process.stderr.write(s + "\n");

// ---------------------------------------------------------------- argumenten
const opts = { variant: [] };
for (const a of process.argv.slice(2)) {
  const [k, ...rest] = a.replace(/^--/, "").split("=");
  const v = rest.length ? rest.join("=") : "true";
  if (k === "variant") opts.variant.push(v);
  else opts[k] = v;
}
const list = (s, d) => (s ?? d).split(",").map((x) => x.trim()).filter(Boolean);

const METRICS = ["lcpMs", "fcpMs", "siMs", "tbtMs", "cls", "performance"];
const fmtS = (ms) => (ms == null ? "—" : (ms / 1000).toFixed(2).replace(".", ","));
const fmtMetric = (k, v) => (v == null ? "—" : k === "cls" ? v.toFixed(3) : k === "performance" ? String(Math.round(v * 100)) : k === "tbtMs" ? `${Math.round(v)} ms` : `${fmtS(v)} s`);

function summarizeCell(rs) {
  const ok = rs.filter((r) => !r.error && !r.excluded);
  const out = { okRuns: ok.length, failedRuns: rs.filter((r) => r.error).length, excludedRuns: rs.filter((r) => r.excluded).length };
  for (const k of METRICS) out[k] = describe(ok.map((r) => r[k]), k === "cls" || k === "performance" ? { minGapAbs: 0 } : undefined);
  out.observedFcpMs = describe(ok.map((r) => r.observed?.fcpMs));
  const els = {};
  for (const r of ok) {
    const key = r.lcp?.element?.selector ?? "(onbekend)";
    els[key] = els[key] ?? { n: 0, label: r.lcp?.element?.label ?? null };
    els[key].n++;
  }
  out.lcpElements = els;
  return out;
}

function cellTable(summary) {
  const rows = [
    "| Cel | n (fout/uitgesl.) | LCP mediaan | LCP p75 | LCP IQR | LCP modi | FCP mediaan | FCP p75 | FCP modi | TBT mediaan | Score mediaan |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  const modes = (d) => (d?.bimodal ? d.modes.map((m) => `${m.name} ${m.n}× ~${fmtS(m.median)} s`).join(" / ") : "unimodaal");
  for (const s of summary) {
    rows.push(
      `| \`${s.page}\` ${s.formFactor} · ${s.variant} | ${s.okRuns} (${s.failedRuns}/${s.excludedRuns}) | ${fmtMetric("lcpMs", s.lcpMs?.median)} | ${fmtMetric("lcpMs", s.lcpMs?.p75)} | ${fmtMetric("lcpMs", s.lcpMs?.iqr)} | ${modes(s.lcpMs)} | ${fmtMetric("fcpMs", s.fcpMs?.median)} | ${fmtMetric("fcpMs", s.fcpMs?.p75)} | ${modes(s.fcpMs)} | ${fmtMetric("tbtMs", s.tbtMs?.median)} | ${fmtMetric("performance", s.performance?.median)} |`,
    );
  }
  rows.push("", "LCP-elementen per cel:");
  for (const s of summary) rows.push(`- \`${s.page}\` ${s.formFactor} · ${s.variant}: ${Object.entries(s.lcpElements).map(([sel, v]) => `\`${sel}\` (${v.n}×${v.label ? `, "${v.label.slice(0, 60)}"` : ""})`).join("; ")}`);
  return rows.join("\n");
}

function gateTable(gates) {
  const rows = ["| Cel | Metriek | Basis → kandidaat | n | mediaan A → B | p75 A → B | ratio p75 (95%-BI) | p(slechter) | Uitspraak |", "|---|---|---|---|---|---|---|---|---|"];
  for (const g of gates) {
    const ci = g.ratioCI95 ? `${g.ratioCI95.lo.toFixed(2)}–${g.ratioCI95.hi.toFixed(2)}` : "—";
    rows.push(`| ${g.cell} | ${g.metric} | ${g.a} → ${g.b} | ${g.nA}/${g.nB} | ${fmtS(g.medianA)} → ${fmtS(g.medianB)} s | ${fmtS(g.p75A)} → ${fmtS(g.p75B)} s | ${g.ratio?.toFixed(2) ?? "—"} (${ci}) | ${g.pWorse?.toFixed(3) ?? "—"} | **${g.verdict}** |`);
  }
  return rows.join("\n");
}

// ---------------------------------------------------------------- vergelijken
async function compareMode() {
  const [specA, specB] = list(opts.compare, "");
  if (!specA || !specB) throw new Error("--compare=<a/runs.json>[#variant],<b/runs.json>[#variant]");
  const load = async (spec) => {
    const [file, variant] = spec.split("#");
    const data = JSON.parse(await readFile(path.resolve(file), "utf8"));
    return { runs: data.runs.filter((r) => !r.error && !r.excluded && (!variant || r.variant === variant)), name: `${path.basename(path.dirname(file))}${variant ? `#${variant}` : ""}`, protocol: data.protocol };
  };
  const A = await load(specA);
  const B = await load(specB);
  for (const k of ["lighthouse", "throttlingMethod", "cache"]) {
    if (A.protocol?.[k] !== B.protocol?.[k]) log(`[compare] WAARSCHUWING: protocol verschilt op ${k}: ${A.protocol?.[k]} vs ${B.protocol?.[k]} — niet gate-waardig`);
  }
  const gates = [];
  const cells = [...new Set(A.runs.map((r) => `${r.page}|${r.formFactor}`))];
  for (const c of cells) {
    const [page, ff] = c.split("|");
    const pick = (rs, k) => rs.filter((r) => r.page === page && r.formFactor === ff).map((r) => r[k]);
    for (const metric of ["lcpMs", "fcpMs"]) gates.push({ cell: `\`${page}\` ${ff}`, metric, a: A.name, b: B.name, ...gate(pick(A.runs, metric), pick(B.runs, metric)) });
  }
  process.stdout.write(gateTable(gates) + "\n");
}

// ---------------------------------------------------------------- meten
async function measureMode() {
  if (!opts.label || !/^[a-z0-9-]+$/.test(opts.label)) throw new Error("--label=<a-z0-9-> is verplicht");
  const pages = list(opts.pages, "/boeken");
  const formFactors = list(opts["form-factors"], "mobile");
  const runs = Number.parseInt(opts.runs ?? "15", 10);
  const throttlingMethod = opts.throttling ?? "simulate";
  const cache = opts.cache ?? "cold";
  const maxLoad = Number(opts["max-load"] ?? cpus().length * 0.5);
  const owner = opts.owner ?? "h2";
  if (!Number.isInteger(runs) || runs < 1 || runs > 60) throw new Error("--runs moet 1..60 zijn");
  if (!["simulate", "devtools"].includes(throttlingMethod)) throw new Error("--throttling=simulate|devtools");
  if (!["cold", "warm"].includes(cache)) throw new Error("--cache=cold|warm");
  if (!formFactors.every((f) => THROTTLING[f])) throw new Error("--form-factors=mobile,desktop");
  if (!pages.every((p) => /^\/[a-z0-9\-/]*$/.test(p))) throw new Error("--pages: alleen paden als /boeken");
  const variants = (opts.variant.length ? opts.variant : ["prod|https://www.t4xi.nl"]).map((v) => {
    const [name, origin, blocked] = v.split("|");
    return { name, origin: assertAllowedOrigin(origin), blocked: blocked ? blocked.split(";") : [] };
  });
  const outDir = path.resolve(opts.out ?? path.join(ROOT, "docs/experience-2.0/perf", opts.label));
  const assetsDir = opts["assets-dir"] ? path.resolve(opts["assets-dir"]) : null;
  if (assetsDir && assetsDir.startsWith(ROOT)) throw new Error("--assets-dir hoort buiten de repo (traces zijn groot)");
  await mkdir(outDir, { recursive: true });

  const protocol = { lighthouse: LH_VERSION, throttlingMethod, throttling: Object.fromEntries(formFactors.map((f) => [f, THROTTLING[f]])), cache, runsPerCell: runs, maxLoad, pages, formFactors, variants, startedAt: new Date().toISOString() };
  const tmp = await mkdtemp(path.join(tmpdir(), "t4xi-measure-"));
  const results = [];
  const persist = () => writeFile(path.join(outDir, "runs.json"), JSON.stringify({ protocol, runs: results }, null, 1));
  const cells = formFactors.flatMap((ff) => pages.flatMap((p) => variants.map((v) => ({ ff, p, v }))));
  try {
    if (cache === "warm") {
      for (const c of cells) {
        c.profileDir = await mkdtemp(path.join(tmp, "profile-"));
        log(`[prime] ${c.ff} ${c.p} ${c.v.name}`);
        await lighthouseRun({ url: c.v.origin + c.p, formFactor: c.ff, throttlingMethod, cache, profileDir: c.profileDir, blocked: c.v.blocked, tmp });
      }
    }
    for (let i = 1; i <= runs; i++) {
      // Interleaving met roterende volgorde: drift (netwerk, CDN, host) valt gelijk over varianten.
      const order = cells.map((_, k) => cells[(k + i) % cells.length]);
      for (const c of order) {
        const env = await waitForQuiet({ maxLoad, owner, allowBusy: opts["allow-busy"] === "true", log });
        log(`[run ${i}/${runs}] ${c.ff} ${c.p} · ${c.v.name} (load1 ${env.load1.toFixed(2)})`);
        const base = { run: i, page: c.p, formFactor: c.ff, variant: c.v.name, origin: c.v.origin, blocked: c.v.blocked, env };
        try {
          const tag = `${c.v.name}-${c.ff}-${c.p.replace(/\W+/g, "_")}-${i}`;
          results.push({ ...base, ...(await lighthouseRun({ url: c.v.origin + c.p, formFactor: c.ff, throttlingMethod, cache, profileDir: c.profileDir, blocked: c.v.blocked, assetsDir, tag, tmp })) });
        } catch (e) {
          results.push({ ...base, error: String(e.message).slice(0, 500) });
        }
        await persist();
      }
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }

  // Verstoorde runs: benchmarkIndex < 85% van de sessiemediaan = host was trager dan normaal.
  const bi = quantile(results.filter((r) => !r.error).map((r) => r.benchmarkIndex), 0.5);
  for (const r of results) if (!r.error && r.benchmarkIndex < 0.85 * bi) r.excluded = `benchmarkIndex ${r.benchmarkIndex} < 85% van ${Math.round(bi)}`;
  // Protocolbewaking: alle runs moeten dezelfde Lighthouse-versie en throttling hebben.
  const versions = new Set(results.filter((r) => !r.error).map((r) => `${r.lighthouseVersion}|${r.throttlingMethod}|${JSON.stringify(r.throttling)}`));
  protocol.consistent = versions.size <= formFactors.length;
  protocol.benchmarkIndexMedian = bi;
  protocol.finishedAt = new Date().toISOString();
  await persist();

  const summary = cells.map((c) => ({ page: c.p, formFactor: c.ff, variant: c.v.name, ...summarizeCell(results.filter((r) => r.page === c.p && r.formFactor === c.ff && r.variant === c.v.name)) }));
  const gates = [];
  if (variants.length > 1) {
    for (const ff of formFactors) for (const p of pages) for (const v of variants.slice(1)) for (const metric of ["lcpMs", "fcpMs"]) {
      const pick = (name) => results.filter((r) => !r.error && !r.excluded && r.page === p && r.formFactor === ff && r.variant === name).map((r) => r[metric]);
      gates.push({ cell: `\`${p}\` ${ff}`, metric, a: variants[0].name, b: v.name, ...gate(pick(variants[0].name), pick(v.name)) });
    }
  }
  await writeFile(path.join(outDir, "summary.json"), JSON.stringify({ protocol, summary, gates }, null, 1));
  const md = [
    `<!-- gegenereerd door scripts/baseline/measure.mjs (${protocol.finishedAt}) -->`,
    `# Meting \`${opts.label}\``,
    "",
    `Lighthouse ${LH_VERSION}, throttling \`${throttlingMethod}\`, cache \`${cache}\`, ${runs} runs per cel (geïnterleaved), max load1 ${maxLoad}, benchmarkIndex-mediaan ${Math.round(bi)}, protocol consistent: ${protocol.consistent ? "ja" : "NEE"}.`,
    "",
    cellTable(summary),
    gates.length ? `\n## Gate (§10, eerste variant = basis)\n\n${gateTable(gates)}` : "",
  ].join("\n");
  await writeFile(path.join(outDir, "summary.md"), md + "\n");
  log(`klaar → ${path.relative(ROOT, outDir)}/summary.md`);
}

await (opts.compare ? compareMode() : measureMode());
