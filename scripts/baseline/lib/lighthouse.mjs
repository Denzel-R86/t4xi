/**
 * Gedeelde Lighthouse-uitvoering voor het meetprotocol
 * (docs/experience-2.0/measurement-protocol.md): vaste versie, expliciete throttling,
 * omgevingsguards (CPU-last, build-slots, schijf) en extractie van het LCP-element
 * volgens het Lighthouse 13-pad (F-10).
 */
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, statfs } from "node:fs/promises";
import { existsSync } from "node:fs";
import { cpus, homedir, loadavg, tmpdir } from "node:os";
import path from "node:path";

export const LH_VERSION = "13.5.0";
export const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/**
 * Throttling expliciet in plaats van "wat de Lighthouse-default toevallig is". Mobiel =
 * de Lighthouse 13-mobielwaarden (moto g power, trage 4G, 4× CPU), desktop = de
 * desktop-preset. Elke run legt de effectieve `configSettings` vast; afwijking = fout.
 */
export const THROTTLING = {
  mobile: { rttMs: 150, throughputKbps: 1638.4, cpuSlowdownMultiplier: 4, requestLatencyMs: 562.5, downloadThroughputKbps: 1474.56, uploadThroughputKbps: 675 },
  desktop: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1, requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0 },
};

/** Alleen GET-metingen van deze origins (productie, lokale `next start`, Vercel-previews). */
export function assertAllowedOrigin(origin) {
  const u = new URL(origin);
  const ok =
    (u.protocol === "https:" && u.hostname === "www.t4xi.nl") ||
    (u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname)) ||
    (u.protocol === "https:" && u.hostname.endsWith(".vercel.app"));
  if (!ok) throw new Error(`origin niet toegestaan: ${origin}`);
  return u.origin;
}

export function run(cmd, argv, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: ["ignore", "pipe", "pipe"], ...opts });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exit ${code}: ${err.slice(-800)}`))));
  });
}

// ------------------------------------------------------------------ guards
export const MIN_FREE_BYTES = 3 * 1024 ** 3;
export async function freeBytes(dir = tmpdir()) {
  const s = await statfs(dir);
  return s.bavail * s.bsize;
}

/** Bezette build-slots van ándere agents (afspraak: ~/Downloads/.t4xi-build-slots/slotN/owner). */
export async function foreignSlots(owner, dir = path.join(homedir(), "Downloads/.t4xi-build-slots")) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of await readdir(dir)) {
    const f = path.join(dir, name, "owner");
    const who = existsSync(f) ? (await readFile(f, "utf8")).trim() : "?";
    if (who !== owner) out.push(`${name}:${who}`);
  }
  return out;
}

/**
 * Wacht tot de machine stil genoeg is: 1-minuut-loadavg ≤ maxLoad én geen build-slot van
 * een andere agent bezet. Na `maxWaitMs` → fout (of alleen waarschuwing bij `allowBusy`).
 * Retourneert de omgevingsstatus op het moment van starten, voor in de ruwe data.
 */
export async function waitForQuiet({ maxLoad, owner, maxWaitMs = 30 * 60_000, pollMs = 15_000, allowBusy = false, log }) {
  const start = Date.now();
  for (;;) {
    const load1 = loadavg()[0];
    const slots = await foreignSlots(owner);
    const free = await freeBytes();
    if (free < MIN_FREE_BYTES) throw new Error(`vrije schijfruimte ${(free / 1024 ** 3).toFixed(2)} GB < 3 GB`);
    const quiet = load1 <= maxLoad && slots.length === 0;
    if (quiet || allowBusy) {
      if (!quiet) log(`[guard] WAARSCHUWING: meet onder last (load1 ${load1.toFixed(2)} > ${maxLoad}, slots ${slots.join(",") || "-"})`);
      return { load1, cores: cpus().length, foreignSlots: slots, quiet };
    }
    if (Date.now() - start > maxWaitMs)
      throw new Error(`machine niet stil binnen ${maxWaitMs / 60000} min (load1 ${load1.toFixed(2)} > ${maxLoad} of slots ${slots.join(",")})`);
    log(`[guard] wacht: load1 ${load1.toFixed(2)} (max ${maxLoad}), andere slots: ${slots.join(",") || "-"}`);
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

// ------------------------------------------------------------------ extractie
/**
 * LCP-element. Lighthouse 13 heeft de audit `largest-contentful-paint-element` vervangen
 * door het insight `lcp-breakdown-insight`: `details.items[]` bevat een tabel met
 * subparts én een item `{type: "node"}` met selector/snippet/nodeLabel (F-10).
 * Het oude pad blijft als fallback voor Lighthouse ≤ 12.
 */
export function extractLcp(lhr) {
  const a = lhr.audits;
  const items = a["lcp-breakdown-insight"]?.details?.items ?? [];
  const node =
    items.find((i) => i?.type === "node") ??
    a["largest-contentful-paint-element"]?.details?.items?.[0]?.items?.[0]?.node ??
    null;
  const table = items.find((i) => i?.type === "table");
  const subparts = table
    ? Object.fromEntries(table.items.map((r) => [r.subpart, Math.round(r.duration)]))
    : null;
  return {
    element: node
      ? { selector: node.selector, label: node.nodeLabel?.slice(0, 120) ?? null, snippet: node.snippet?.slice(0, 160) ?? null }
      : null,
    observedSubparts: subparts,
  };
}

export function summarizeLhr(lhr) {
  const a = lhr.audits;
  const m = a.metrics?.details?.items?.[0] ?? {};
  const third = a["third-parties-insight"]?.details?.items ?? [];
  return {
    fetchTime: lhr.fetchTime,
    finalUrl: lhr.finalDisplayedUrl,
    lighthouseVersion: lhr.lighthouseVersion,
    userAgent: lhr.environment?.hostUserAgent,
    benchmarkIndex: lhr.environment?.benchmarkIndex,
    throttlingMethod: lhr.configSettings?.throttlingMethod,
    throttling: lhr.configSettings?.throttling,
    runWarnings: lhr.runWarnings,
    runtimeError: lhr.runtimeError?.code ?? null,
    performance: lhr.categories.performance?.score ?? null,
    lcpMs: a["largest-contentful-paint"]?.numericValue ?? null,
    fcpMs: a["first-contentful-paint"]?.numericValue ?? null,
    siMs: a["speed-index"]?.numericValue ?? null,
    tbtMs: a["total-blocking-time"]?.numericValue ?? null,
    cls: a["cumulative-layout-shift"]?.numericValue ?? null,
    ttfbMs: a["server-response-time"]?.numericValue ?? null,
    totalBytes: a["total-byte-weight"]?.numericValue ?? null,
    // Waargenomen (ongethrottelde) tijden uit de trace: bron van de lantern-simulatie.
    observed: {
      fcpMs: m.observedFirstContentfulPaint ?? null,
      lcpMs: m.observedLargestContentfulPaint ?? null,
      loadMs: m.observedLoad ?? null,
      dclMs: m.observedDomContentLoaded ?? null,
    },
    lcp: extractLcp(lhr),
    thirdParties: third.map((t) => ({ entity: t.entity, bytes: t.transferSize, mainThreadMs: Math.round(t.mainThreadTime ?? 0) })),
  };
}

// ------------------------------------------------------------------ uitvoering
/**
 * Eén Lighthouse-run. `cache: "cold"` = verse Chrome-profielmap + storage reset (default
 * Lighthouse). `cache: "warm"` = gedeelde profielmap `profileDir` + `--disable-storage-reset`;
 * de aanroeper doet vooraf een priming-run die niet meetelt.
 */
export async function lighthouseRun({ url, formFactor, throttlingMethod = "simulate", cache = "cold", profileDir, blocked = [], assetsDir, tag, tmp }) {
  const runTmp = await mkdtemp(path.join(tmp, "run-"));
  try {
    const outFile = path.join(runTmp, "lhr.json");
    const th = THROTTLING[formFactor];
    const chromeFlags = ["--headless=new"];
    if (cache === "warm") chromeFlags.push(`--user-data-dir=${profileDir}`);
    const argv = [
      "--yes",
      `lighthouse@${LH_VERSION}`,
      url,
      "--output=json",
      `--output-path=${outFile}`,
      "--only-categories=performance",
      `--chrome-flags=${chromeFlags.join(" ")}`,
      `--throttling-method=${throttlingMethod}`,
      `--throttling.rttMs=${th.rttMs}`,
      `--throttling.throughputKbps=${th.throughputKbps}`,
      `--throttling.cpuSlowdownMultiplier=${th.cpuSlowdownMultiplier}`,
      `--throttling.requestLatencyMs=${th.requestLatencyMs}`,
      `--throttling.downloadThroughputKbps=${th.downloadThroughputKbps}`,
      `--throttling.uploadThroughputKbps=${th.uploadThroughputKbps}`,
      "--quiet",
    ];
    if (formFactor === "desktop") argv.push("--preset=desktop");
    if (cache === "warm") argv.push("--disable-storage-reset");
    for (const b of blocked) argv.push(`--blocked-url-patterns=${b}`);
    if (assetsDir) argv.push("--save-assets");
    await run("npx", argv, { env: { ...process.env, CHROME_PATH: CHROME, TMPDIR: runTmp } });
    const lhr = JSON.parse(await readFile(outFile, "utf8"));
    if (assetsDir) {
      await mkdir(assetsDir, { recursive: true });
      for (const f of await readdir(runTmp)) {
        if (/\.(trace|devtoolslog)\.json$/.test(f) || f === "lhr.json") await copyFile(path.join(runTmp, f), path.join(assetsDir, `${tag}-${f}`));
      }
    }
    return summarizeLhr(lhr);
  } finally {
    await rm(runTmp, { recursive: true, force: true });
  }
}
