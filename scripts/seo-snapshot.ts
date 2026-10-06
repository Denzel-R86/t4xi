/**
 * SEO-snapshot-test (Experience 2.0, PR 0.2) — vangnet voor alle volgende fases.
 *
 * Haalt /sitemap.xml + /robots.txt op, bezoekt elke sitemap-URL en legt per URL
 * vast: HTTP-status, <title>, canonical, hreflang-alternates (pagina én sitemap),
 * meta robots en alle <h1>'s. Vergelijkt met de fixture:
 *   verlies/wijziging = fout (exit 1), toevoeging = waarschuwing (exit 0).
 *
 * Gebruik:
 *   npm run build                       # eerst, met CI-env (APP_ENV=development)
 *   npm run seo:snapshot                # start zelf `next start` op :3102 en vergelijkt
 *   npm run seo:snapshot -- --update    # fixture bewust verversen (diff in de PR!)
 *   npm run seo:snapshot -- --base https://www.t4xi.nl
 *                                       # productie (read-only GET) tegen de lokale fixture
 *   npm run seo:snapshot -- --base https://www.t4xi.nl \
 *     --fixture docs/experience-2.0/baseline/seo-snapshot.production.json --update
 *                                       # productie-snapshot vastleggen
 *
 * Geen secrets nodig: alle titels/canonicals/h1's komen uit de messages-catalogi
 * en lib/seo-*. Zie docs/experience-2.0/baseline/0.2-seo.md.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { extractPageSeo, parseSitemap, type SitemapEntry } from "./seo-snapshot/extract";
import {
  buildPageSnapshot,
  compareSnapshots,
  normalizeRobotsTxt,
  type PageSnapshot,
  type SeoSnapshot,
} from "./seo-snapshot/compare";

const DEFAULT_FIXTURE = "docs/experience-2.0/baseline/seo-snapshot.json";
const DEFAULT_PORT = 3102;
const USER_AGENT = "T4XI-SEO-Snapshot/1.0 (+https://www.t4xi.nl; read-only baseline check)";

interface Options {
  base: string | null;
  port: number;
  fixture: string;
  update: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { base: null, port: DEFAULT_PORT, fixture: DEFAULT_FIXTURE, update: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) throw new Error(`${arg} verwacht een waarde`);
      return value;
    };
    if (arg === "--update") opts.update = true;
    else if (arg === "--base") opts.base = next().replace(/\/+$/, "");
    else if (arg === "--port") opts.port = Number(next());
    else if (arg === "--fixture") opts.fixture = next();
    else throw new Error(`Onbekende optie: ${arg}`);
  }
  if (!Number.isInteger(opts.port) || opts.port <= 0) throw new Error("--port moet een positief geheel getal zijn");
  if (opts.base && !/^https?:\/\//.test(opts.base)) throw new Error("--base moet met http(s):// beginnen");
  return opts;
}

async function get(url: string, attempts = 2): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, {
        method: "GET",
        redirect: "manual",
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xml;q=0.9,*/*;q=0.8" },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`GET ${url} mislukt: ${String(lastError)}`);
}

async function startServer(port: number): Promise<ChildProcess> {
  if (!existsSync(".next/BUILD_ID")) {
    throw new Error("Geen productie-build gevonden (.next/BUILD_ID). Draai eerst `npm run build`.");
  }
  const nextBin = path.join("node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
    env: {
      ...process.env,
      // De env-guard (instrumentation.ts) weigert te starten zonder APP_ENV; CI zet
      // development. Nooit production: die vereist live secrets.
      APP_ENV: process.env.APP_ENV ?? "development",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout?.on("data", (d) => (log += d));
  child.stderr?.on("data", (d) => (log += d));

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next start stopte direct:\n${log}`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/robots.txt`, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) return child;
    } catch {
      // nog niet klaar
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error(`next start werd niet binnen 60s bereikbaar:\n${log}`);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function takeSnapshot(base: string, isLocal: boolean): Promise<SeoSnapshot> {
  const sitemapRes = await get(`${base}/sitemap.xml`);
  if (sitemapRes.status !== 200) throw new Error(`/sitemap.xml gaf HTTP ${sitemapRes.status}`);
  const entries = parseSitemap(await sitemapRes.text());
  if (entries.length === 0) throw new Error("/sitemap.xml bevat geen <url>-entries");

  const robotsRes = await get(`${base}/robots.txt`);
  const robotsTxt = robotsRes.status === 200 ? normalizeRobotsTxt(await robotsRes.text()) : [];

  // Productie: rustig aan (2 tegelijk); lokaal: 4 tegelijk.
  const snapshots = await mapLimit(entries, isLocal ? 4 : 2, async (entry: SitemapEntry) => {
    const res = await get(`${base}${entry.path}`);
    const html = res.status === 200 ? await res.text() : "";
    const page = extractPageSeo(html, res.status, res.headers.get("location"));
    return [entry.path, buildPageSnapshot(entry, page)] as [string, PageSnapshot];
  });

  return {
    version: 1,
    source: isLocal
      ? "lokale `next start` na `npm run build` met APP_ENV=development, zonder secrets"
      : `${base} (read-only GET)`,
    robotsTxt,
    pages: Object.fromEntries(snapshots),
  };
}

function writeFixture(file: string, snapshot: SeoSnapshot): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`);
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  const started = Date.now();
  let server: ChildProcess | null = null;
  try {
    const isLocal = opts.base === null || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(opts.base);
    if (opts.base === null) server = await startServer(opts.port);
    const base = opts.base ?? `http://127.0.0.1:${opts.port}`;

    const actual = await takeSnapshot(base, isLocal);
    const count = Object.keys(actual.pages).length;

    if (opts.update) {
      writeFixture(opts.fixture, actual);
      console.log(`✓ ${opts.fixture} bijgewerkt: ${count} URL's (${((Date.now() - started) / 1000).toFixed(1)}s)`);
      return 0;
    }

    if (!existsSync(opts.fixture)) throw new Error(`Fixture ${opts.fixture} ontbreekt; maak hem met --update`);
    const expected = JSON.parse(readFileSync(opts.fixture, "utf8")) as SeoSnapshot;
    const { errors, warnings } = compareSnapshots(expected, actual);

    for (const w of warnings) console.warn(`⚠ ${w}`);
    for (const e of errors) console.error(`✗ ${e}`);
    const summary = `${count} URL's gecontroleerd tegen ${Object.keys(expected.pages).length} in ${opts.fixture} — ${errors.length} fout(en), ${warnings.length} waarschuwing(en) (${((Date.now() - started) / 1000).toFixed(1)}s)`;
    if (errors.length > 0) {
      console.error(`\n✗ SEO-snapshot FAALT: ${summary}`);
      console.error("  Bewuste wijziging? Draai `npm run seo:snapshot -- --update` en commit de fixture-diff.");
      return 1;
    }
    console.log(`✓ SEO-snapshot groen: ${summary}`);
    return 0;
  } finally {
    server?.kill();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(`✗ seo-snapshot: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  },
);
