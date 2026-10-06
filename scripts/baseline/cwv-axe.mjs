#!/usr/bin/env node
/**
 * Experience 2.0 — PR 0.1 baseline: Lighthouse (lab-CWV), CrUX-velddata via PSI,
 * en een axe-run (WCAG 2.2 AA) op de vier budgetpagina's (masterplan §10).
 *
 * Alleen-lezen: uitsluitend GET's van publieke productiepagina's. Geen formulieren,
 * geen quotes, geen secrets. Geen nieuwe dependency:
 *   · Lighthouse: `npx --yes lighthouse@13.5.0` (exact vastgepind, LH_VERSION).
 *   · axe-core: de via package-lock vastgepinde versie (4.12.1, transitief via
 *     eslint-plugin-jsx-a11y), geïnjecteerd in lokale Chrome via het DevTools-protocol
 *     (Node ≥ 22 heeft een ingebouwde WebSocket). Zie 0.1-axe.md voor het waarom.
 *   · CrUX: publieke PageSpeed Insights v5-API zonder key (optioneel env PSI_API_KEY
 *     bij een 429 op het gedeelde anonieme quotum; de key komt nooit in de output).
 *
 * Gebruik:
 *   node scripts/baseline/cwv-axe.mjs                 # alles, 5 runs
 *   node scripts/baseline/cwv-axe.mjs --only=cwv --runs=5
 *   node scripts/baseline/cwv-axe.mjs --only=axe
 *   node scripts/baseline/cwv-axe.mjs --only=psi
 *   CHROME_PATH=/pad/naar/chrome node scripts/baseline/cwv-axe.mjs
 *
 * Output: docs/experience-2.0/baseline/raw/*.json + raw/tables.md (gegenereerde tabellen).
 */
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, statfs, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LH_VERSION = "13.5.0";
const ORIGIN = "https://www.t4xi.nl"; // lib/seo-locale.ts SITE_URL; NL = default locale zonder prefix
const PAGES = ["/", "/boeken", "/tarieven", "/taxi-almere-schiphol"];
const FORM_FACTORS = ["mobile", "desktop"];
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "docs/experience-2.0/baseline/raw");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
const RUNS = Number.parseInt(args.runs ?? "5", 10);
const ONLY = args.only ?? "all";
if (!Number.isInteger(RUNS) || RUNS < 1 || RUNS > 20) throw new Error("--runs moet 1..20 zijn");
if (!["all", "cwv", "axe", "psi"].includes(ONLY)) throw new Error("--only moet all|cwv|axe|psi zijn");

const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function run(cmd, argv, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: ["ignore", "pipe", "pipe"], ...opts });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exit ${code}: ${err.slice(-800)}`))));
  });
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const stats = (xs) => {
  const v = xs.filter((x) => typeof x === "number" && Number.isFinite(x));
  if (!v.length) return null;
  return { n: v.length, median: median(v), min: Math.min(...v), max: Math.max(...v) };
};

// ---------------------------------------------------------------- Lighthouse
// Ondergrens vrije schijfruimte; onder deze grens stopt de meting netjes.
const MIN_FREE_BYTES = 1.5 * 1024 ** 3;
async function freeBytes() {
  const s = await statfs(tmpdir());
  return s.bavail * s.bsize;
}

async function lighthouseOnce(url, formFactor, tmp) {
  // Eigen TMPDIR per run: chrome-launcher zet daar zijn profiel; na de run weg.
  const runTmp = await mkdtemp(path.join(tmp, "run-"));
  try {
    return await lighthouseInDir(url, formFactor, runTmp);
  } finally {
    await rm(runTmp, { recursive: true, force: true });
  }
}

async function lighthouseInDir(url, formFactor, tmp) {
  const outFile = path.join(tmp, `lhr-${Date.now()}.json`);
  const argv = [
    "--yes",
    `lighthouse@${LH_VERSION}`,
    url,
    "--output=json",
    `--output-path=${outFile}`,
    "--only-categories=performance,accessibility",
    "--chrome-flags=--headless=new",
    "--quiet",
  ];
  if (formFactor === "desktop") argv.push("--preset=desktop");
  await run("npx", argv, { env: { ...process.env, CHROME_PATH: CHROME, TMPDIR: tmp } });
  const lhr = JSON.parse(await readFile(outFile, "utf8"));
  await rm(outFile, { force: true });
  const a = lhr.audits;
  const lcpEl = a["largest-contentful-paint-element"]?.details?.items?.[0]?.items?.[0]?.node;
  return {
    url,
    formFactor,
    fetchTime: lhr.fetchTime,
    finalUrl: lhr.finalDisplayedUrl,
    lighthouseVersion: lhr.lighthouseVersion,
    benchmarkIndex: lhr.environment?.benchmarkIndex,
    throttlingMethod: lhr.configSettings?.throttlingMethod,
    runWarnings: lhr.runWarnings,
    runtimeError: lhr.runtimeError?.code ?? null,
    performance: lhr.categories.performance?.score ?? null,
    accessibility: lhr.categories.accessibility?.score ?? null,
    lcpMs: a["largest-contentful-paint"]?.numericValue ?? null,
    cls: a["cumulative-layout-shift"]?.numericValue ?? null,
    tbtMs: a["total-blocking-time"]?.numericValue ?? null,
    fcpMs: a["first-contentful-paint"]?.numericValue ?? null,
    siMs: a["speed-index"]?.numericValue ?? null,
    ttfbMs: a["server-response-time"]?.numericValue ?? null,
    totalBytes: a["total-byte-weight"]?.numericValue ?? null,
    lcpElement: lcpEl ? { selector: lcpEl.selector, snippet: lcpEl.snippet?.slice(0, 200) } : null,
    a11yFailed: Object.values(a)
      .filter((x) => x.score === 0 && lhr.categories.accessibility?.auditRefs.some((r) => r.id === x.id))
      .map((x) => x.id),
  };
}

async function runCwv() {
  const tmp = await mkdtemp(path.join(tmpdir(), "t4xi-lh-"));
  const runs = [];
  let aborted = null;
  try {
    outer: for (const ff of FORM_FACTORS) {
      for (const p of PAGES) {
        const free = await freeBytes();
        if (free < MIN_FREE_BYTES) {
          aborted = `vrije ruimte ${(free / 1024 ** 3).toFixed(2)} GB < 1.5 GB vóór ${ff} ${p}`;
          process.stderr.write(`[lighthouse] gestopt: ${aborted}\n`);
          break outer;
        }
        for (let i = 1; i <= RUNS; i++) {
          const url = ORIGIN + p;
          process.stderr.write(`[lighthouse ${ff}] ${p} run ${i}/${RUNS}\n`);
          try {
            runs.push({ run: i, ...(await lighthouseOnce(url, ff, tmp)) });
          } catch (e) {
            runs.push({ run: i, url, formFactor: ff, error: String(e.message).slice(0, 500) });
          }
        }
        // Tussentijds wegschrijven zodat een afbreking geen data kost.
        await writeFile(path.join(OUT, "cwv-runs.json"), JSON.stringify(runs, null, 1));
      }
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  const summary = [];
  for (const ff of FORM_FACTORS) {
    for (const p of PAGES) {
      const rs = runs.filter((r) => r.formFactor === ff && r.url === ORIGIN + p && !r.error);
      summary.push({
        page: p,
        formFactor: ff,
        okRuns: rs.length,
        failedRuns: runs.filter((r) => r.formFactor === ff && r.url === ORIGIN + p && r.error).length,
        performance: stats(rs.map((r) => r.performance)),
        lcpMs: stats(rs.map((r) => r.lcpMs)),
        cls: stats(rs.map((r) => r.cls)),
        tbtMs: stats(rs.map((r) => r.tbtMs)),
        fcpMs: stats(rs.map((r) => r.fcpMs)),
        siMs: stats(rs.map((r) => r.siMs)),
        ttfbMs: stats(rs.map((r) => r.ttfbMs)),
        accessibility: stats(rs.map((r) => r.accessibility)),
        lcpElements: [...new Set(rs.map((r) => r.lcpElement?.selector).filter(Boolean))],
      });
    }
  }
  await writeFile(path.join(OUT, "cwv-runs.json"), JSON.stringify(runs, null, 1));
  await writeFile(
    path.join(OUT, "cwv-summary.json"),
    JSON.stringify({ lighthouse: LH_VERSION, origin: ORIGIN, runsPerCell: RUNS, aborted, generatedAt: new Date().toISOString(), summary }, null, 1),
  );
  return summary;
}

// ---------------------------------------------------------------- PSI / CrUX
async function runPsi() {
  const out = [];
  for (const ff of FORM_FACTORS) {
    for (const p of PAGES) {
      const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
      api.searchParams.set("url", ORIGIN + p);
      api.searchParams.set("strategy", ff);
      api.searchParams.set("category", "performance");
      // Optioneel: eigen key (nooit committen) als het anonieme dagquotum op is (HTTP 429).
      if (process.env.PSI_API_KEY) api.searchParams.set("key", process.env.PSI_API_KEY);
      process.stderr.write(`[psi ${ff}] ${p}\n`);
      const res = await fetch(api);
      const body = await res.json().catch(() => ({}));
      const pick = (le) =>
        le && le.metrics
          ? {
              id: le.id,
              overall: le.overall_category,
              origin_fallback: le.origin_fallback ?? false,
              p75: Object.fromEntries(Object.entries(le.metrics).map(([k, v]) => [k, v.percentile])),
            }
          : null;
      out.push({
        page: p,
        formFactor: ff,
        httpStatus: res.status,
        error: body.error ? { code: body.error.code, message: String(body.error.message).slice(0, 300) } : null,
        page_field: pick(body.loadingExperience),
        origin_field: pick(body.originLoadingExperience),
        psiLabPerformance: body.lighthouseResult?.categories?.performance?.score ?? null,
        psiLabLcpMs: body.lighthouseResult?.audits?.["largest-contentful-paint"]?.numericValue ?? null,
      });
    }
  }
  await writeFile(path.join(OUT, "psi-crux.json"), JSON.stringify({ generatedAt: new Date().toISOString(), results: out }, null, 1));
  return out;
}

// ---------------------------------------------------------------- axe via CDP
const VIEWPORTS = {
  mobile: {
    width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true,
    ua: "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36",
  },
  desktop: { width: 1350, height: 940, deviceScaleFactor: 1, mobile: false, ua: null },
};

async function launchChrome() {
  const profile = await mkdtemp(path.join(tmpdir(), "t4xi-axe-"));
  const proc = spawn(CHROME, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions", "about:blank",
  ], { stdio: "ignore" });
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await new Promise((r) => setTimeout(r, 100));
  const [port] = (await readFile(portFile, "utf8")).split("\n");
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((t) => t.type === "page");
  return {
    wsUrl: page.webSocketDebuggerUrl,
    close: async () => {
      const exited = new Promise((r) => proc.once("exit", r));
      proc.kill();
      await exited;
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method) listeners.forEach((l) => l(msg));
  });
  const ready = new Promise((r) => ws.addEventListener("open", r, { once: true }));
  return {
    ready,
    send: (method, params = {}) =>
      new Promise((resolve, reject) => {
        const i = ++id;
        pending.set(i, { resolve, reject });
        ws.send(JSON.stringify({ id: i, method, params }));
      }),
    once: (method, timeoutMs = 45000) =>
      new Promise((resolve, reject) => {
        const t = setTimeout(() => { listeners.delete(l); reject(new Error(`timeout ${method}`)); }, timeoutMs);
        const l = (m) => { if (m.method === method) { clearTimeout(t); listeners.delete(l); resolve(m); } };
        listeners.add(l);
      }),
    close: () => ws.close(),
  };
}

async function runAxe() {
  const axeSource = await readFile(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");
  const axeVersion = JSON.parse(await readFile(path.join(ROOT, "node_modules/axe-core/package.json"), "utf8")).version;
  const chrome = await launchChrome();
  const c = cdp(chrome.wsUrl);
  await c.ready;
  const results = [];
  try {
    await c.send("Page.enable");
    await c.send("Runtime.enable");
    for (const ff of FORM_FACTORS) {
      const vp = VIEWPORTS[ff];
      await c.send("Emulation.setDeviceMetricsOverride", {
        width: vp.width, height: vp.height, deviceScaleFactor: vp.deviceScaleFactor, mobile: vp.mobile,
      });
      await c.send("Emulation.setTouchEmulationEnabled", { enabled: vp.mobile });
      if (vp.ua) await c.send("Emulation.setUserAgentOverride", { userAgent: vp.ua });
      else await c.send("Emulation.setUserAgentOverride", { userAgent: "" });
      for (const p of PAGES) {
        process.stderr.write(`[axe ${ff}] ${p}\n`);
        const loaded = c.once("Page.loadEventFired");
        await c.send("Page.navigate", { url: ORIGIN + p });
        await loaded;
        // Laat hydratie/lazy content landen; scroll eenmaal door zodat reveal-secties renderen.
        await new Promise((r) => setTimeout(r, 3000));
        await c.send("Runtime.evaluate", {
          expression: "(async()=>{for(let y=0;y<document.body.scrollHeight;y+=600){scrollTo(0,y);await new Promise(r=>setTimeout(r,120));}scrollTo(0,0);})()",
          awaitPromise: true,
        });
        await new Promise((r) => setTimeout(r, 1500));
        await c.send("Runtime.evaluate", { expression: axeSource });
        const { result, exceptionDetails } = await c.send("Runtime.evaluate", {
          expression: `axe.run(document,{runOnly:{type:'tag',values:${JSON.stringify(AXE_TAGS)}},resultTypes:['violations','incomplete']}).then(r=>({url:r.url,violations:r.violations.map(v=>({id:v.id,impact:v.impact,tags:v.tags.filter(t=>/^wcag|best/.test(t)),help:v.help,nodes:v.nodes.length,targets:v.nodes.slice(0,5).map(n=>({target:n.target.join(' '),summary:(n.failureSummary||'').slice(0,240)}))})),incomplete:r.incomplete.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length}))}))`,
          awaitPromise: true,
          returnByValue: true,
        });
        if (exceptionDetails) results.push({ page: p, formFactor: ff, error: exceptionDetails.text });
        else results.push({ page: p, formFactor: ff, ...result.value });
      }
    }
  } finally {
    c.close();
    await chrome.close();
  }
  await writeFile(
    path.join(OUT, "axe.json"),
    JSON.stringify({ axeCore: axeVersion, tags: AXE_TAGS, viewports: VIEWPORTS, generatedAt: new Date().toISOString(), results }, null, 1),
  );
  return { axeVersion, results };
}

// ---------------------------------------------------------------- tables
const fmtMs = (s) => (s ? `${(s.median / 1000).toFixed(2)} s (${(s.min / 1000).toFixed(2)}–${(s.max / 1000).toFixed(2)})` : "—");
const fmtN = (s, d = 3) => (s ? `${s.median.toFixed(d)} (${s.min.toFixed(d)}–${s.max.toFixed(d)})` : "—");
const fmtScore = (s) => (s ? `${Math.round(s.median * 100)} (${Math.round(s.min * 100)}–${Math.round(s.max * 100)})` : "—");
const fmtTbt = (s) => (s ? `${Math.round(s.median)} ms (${Math.round(s.min)}–${Math.round(s.max)})` : "—");

function cwvTable(summary) {
  const rows = ["| Pagina | Form factor | n | Score | LCP | CLS | TBT | FCP | SI | TTFB |", "|---|---|---|---|---|---|---|---|---|---|"];
  for (const s of summary) {
    rows.push(`| \`${s.page}\` | ${s.formFactor} | ${s.okRuns}${s.failedRuns ? ` (+${s.failedRuns} fout)` : ""} | ${fmtScore(s.performance)} | ${fmtMs(s.lcpMs)} | ${fmtN(s.cls)} | ${fmtTbt(s.tbtMs)} | ${fmtMs(s.fcpMs)} | ${fmtMs(s.siMs)} | ${fmtTbt(s.ttfbMs)} |`);
  }
  return rows.join("\n");
}

function axeTable(axe) {
  const rows = ["| Pagina | Viewport | Impact | Regel | Nodes | WCAG |", "|---|---|---|---|---|---|"];
  for (const r of axe.results) {
    if (r.error) { rows.push(`| \`${r.page}\` | ${r.formFactor} | — | FOUT: ${r.error} | — | — |`); continue; }
    if (!r.violations.length) rows.push(`| \`${r.page}\` | ${r.formFactor} | — | geen violations | 0 | — |`);
    for (const v of r.violations) rows.push(`| \`${r.page}\` | ${r.formFactor} | ${v.impact} | \`${v.id}\` | ${v.nodes} | ${v.tags.join(", ")} |`);
  }
  return rows.join("\n");
}

// ---------------------------------------------------------------- main
await mkdir(OUT, { recursive: true });
const parts = [`<!-- gegenereerd door scripts/baseline/cwv-axe.mjs op ${new Date().toISOString()} -->`];
if (ONLY === "all" || ONLY === "psi") {
  const psi = await runPsi();
  parts.push("## PSI / CrUX", "```json", JSON.stringify(psi.map((x) => ({ page: x.page, ff: x.formFactor, status: x.httpStatus, error: x.error?.code ?? null, page_field: x.page_field, origin_field: x.origin_field })), null, 1), "```");
}
if (ONLY === "all" || ONLY === "axe") {
  const axe = await runAxe();
  parts.push(`## axe-core ${axe.axeVersion}`, axeTable(axe));
}
if (ONLY === "all" || ONLY === "cwv") {
  const summary = await runCwv();
  parts.push(`## Lighthouse ${LH_VERSION} — mediaan (min–max)`, cwvTable(summary));
}
const tablesFile = path.join(OUT, `tables-${ONLY}.md`);
await writeFile(tablesFile, parts.join("\n\n") + "\n");
process.stderr.write(`klaar → ${path.relative(ROOT, tablesFile)}\n`);
