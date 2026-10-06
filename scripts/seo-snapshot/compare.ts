/**
 * Snapshotmodel + vergelijking voor de SEO-snapshot (Experience 2.0, PR 0.2).
 *
 * Regel: VERLIES of WIJZIGING van iets dat in de fixture staat = fout;
 * TOEVOEGING = waarschuwing. Een gewijzigde title/canonical is voor een
 * zoekmachine óók verlies van de oude waarde, dus die faalt ook. Bewuste
 * wijzigingen gaan via `--update` in dezelfde PR, zodat de diff van de fixture
 * in de review zichtbaar is.
 */
import type { HreflangMap, PageSeo, SitemapEntry } from "./extract";

/** Velden die bij CMS-gestuurde pagina's alleen op aanwezigheid worden getoetst. */
export type VolatileField = "title" | "h1";

export interface PageSnapshot {
  status: number;
  location: string | null;
  sitemapAlternates: HreflangMap;
  title: string | null;
  titleCount: number;
  canonical: string | null;
  canonicalCount: number;
  hreflang: HreflangMap;
  robots: string | null;
  h1: string[];
  /** Velden waarvan de tekst uit Sanity kan komen (zie CMS_DEPENDENT). */
  cmsDependent?: VolatileField[];
}

export interface SeoSnapshot {
  version: 1;
  source: string;
  robotsTxt: string[];
  pages: Record<string, PageSnapshot>;
}

export interface CompareResult {
  errors: string[];
  warnings: string[];
}

/**
 * Pagina's waarvan title en/of h1 uit Sanity komen, met een codefallback als
 * het CMS niet bereikbaar of ongeldig is. CI (zonder token) en productie kunnen
 * dus legitiem een andere tekst tonen; daar toetsen we alleen dat het veld
 * bestaat en niet leeg is. Bron: app/[locale]/diensten/page.tsx
 * (loadCmsServicesPage → generateMetadata + ServicesSection-h1).
 */
export const CMS_DEPENDENT: Record<string, VolatileField[]> = {
  "/diensten": ["title", "h1"],
  "/en/diensten": ["title", "h1"],
};

export function buildPageSnapshot(entry: SitemapEntry, page: PageSeo): PageSnapshot {
  const snap: PageSnapshot = {
    status: page.status,
    location: page.location,
    sitemapAlternates: sortKeys(entry.alternates),
    title: page.titles[0] ?? null,
    titleCount: page.titles.length,
    canonical: page.canonicals[0] ?? null,
    canonicalCount: page.canonicals.length,
    hreflang: sortKeys(page.hreflang),
    robots: page.robots,
    h1: page.h1,
  };
  const volatile = CMS_DEPENDENT[entry.path];
  if (volatile) snap.cmsDependent = [...volatile];
  return snap;
}

export function normalizeRobotsTxt(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function sortKeys(map: HreflangMap): HreflangMap {
  return Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
}

function compareMap(
  label: string,
  path: string,
  expected: HreflangMap,
  actual: HreflangMap,
  out: CompareResult,
): void {
  for (const [lang, href] of Object.entries(expected)) {
    if (!(lang in actual)) out.errors.push(`${path}: ${label} '${lang}' verdwenen (was ${href})`);
    else if (actual[lang] !== href)
      out.errors.push(`${path}: ${label} '${lang}' gewijzigd: ${href} → ${actual[lang]}`);
  }
  for (const [lang, href] of Object.entries(actual)) {
    if (!(lang in expected)) out.warnings.push(`${path}: nieuwe ${label} '${lang}' → ${href}`);
  }
}

function compareSingle(
  label: string,
  path: string,
  expected: string | null,
  actual: string | null,
  presenceOnly: boolean,
  out: CompareResult,
): void {
  if (expected === null) {
    if (actual !== null) out.warnings.push(`${path}: nieuwe ${label}: ${JSON.stringify(actual)}`);
    return;
  }
  if (actual === null || actual === "") {
    out.errors.push(`${path}: ${label} verdwenen (was ${JSON.stringify(expected)})`);
    return;
  }
  if (!presenceOnly && actual !== expected) {
    out.errors.push(`${path}: ${label} gewijzigd: ${JSON.stringify(expected)} → ${JSON.stringify(actual)}`);
  }
}

function hasNoindex(robots: string | null): boolean {
  return robots !== null && /\bnoindex\b/i.test(robots);
}

export function comparePage(path: string, exp: PageSnapshot, act: PageSnapshot, out: CompareResult): void {
  if (act.status !== exp.status) {
    out.errors.push(
      `${path}: HTTP-status gewijzigd: ${exp.status} → ${act.status}${act.location ? ` (Location: ${act.location})` : ""}`,
    );
    // Een kapotte of omgeleide pagina heeft geen zinvolle head meer; één fout volstaat.
    if (act.status >= 300) return;
  }

  const volatile = new Set(exp.cmsDependent ?? []);

  compareMap("sitemap-hreflang", path, exp.sitemapAlternates, act.sitemapAlternates, out);
  compareSingle("<title>", path, exp.title, act.title, volatile.has("title"), out);
  if (act.titleCount > exp.titleCount)
    out.warnings.push(`${path}: aantal <title> gestegen: ${exp.titleCount} → ${act.titleCount}`);
  compareSingle("canonical", path, exp.canonical, act.canonical, false, out);
  if (act.canonicalCount > exp.canonicalCount)
    out.errors.push(`${path}: meerdere canonicals: ${exp.canonicalCount} → ${act.canonicalCount}`);
  compareMap("hreflang", path, exp.hreflang, act.hreflang, out);

  if (hasNoindex(act.robots) && !hasNoindex(exp.robots))
    out.errors.push(`${path}: pagina is noindex geworden (robots: ${JSON.stringify(act.robots)})`);
  else if ((act.robots ?? null) !== (exp.robots ?? null))
    out.warnings.push(`${path}: meta robots gewijzigd: ${JSON.stringify(exp.robots)} → ${JSON.stringify(act.robots)}`);

  if (volatile.has("h1")) {
    const present = act.h1.filter((t) => t.length > 0).length;
    if (present < exp.h1.length)
      out.errors.push(`${path}: <h1> verdwenen of leeg (verwacht ${exp.h1.length}, gevonden ${present}; CMS-afhankelijk)`);
    if (act.h1.length > exp.h1.length)
      out.warnings.push(`${path}: aantal <h1> gestegen: ${exp.h1.length} → ${act.h1.length}`);
    return;
  }
  const remaining = [...act.h1];
  for (const text of exp.h1) {
    const i = remaining.indexOf(text);
    if (i === -1) out.errors.push(`${path}: <h1> verdwenen of gewijzigd: ${JSON.stringify(text)} (nu: ${JSON.stringify(act.h1)})`);
    else remaining.splice(i, 1);
  }
  for (const text of remaining) out.warnings.push(`${path}: extra <h1>: ${JSON.stringify(text)}`);
}

export function compareSnapshots(expected: SeoSnapshot, actual: SeoSnapshot): CompareResult {
  const out: CompareResult = { errors: [], warnings: [] };

  for (const line of expected.robotsTxt) {
    if (!actual.robotsTxt.includes(line)) out.errors.push(`robots.txt: regel verdwenen: ${JSON.stringify(line)}`);
  }
  for (const line of actual.robotsTxt) {
    if (!expected.robotsTxt.includes(line)) out.warnings.push(`robots.txt: nieuwe regel: ${JSON.stringify(line)}`);
  }

  for (const [path, exp] of Object.entries(expected.pages)) {
    const act = actual.pages[path];
    if (!act) {
      out.errors.push(`${path}: URL verdwenen uit sitemap.xml`);
      continue;
    }
    comparePage(path, exp, act, out);
  }
  for (const path of Object.keys(actual.pages)) {
    if (!(path in expected.pages)) out.warnings.push(`${path}: nieuwe URL in sitemap.xml (nog niet in fixture)`);
  }
  return out;
}
