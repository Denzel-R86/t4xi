/**
 * Pure HTML/XML-extractie voor de SEO-snapshot (Experience 2.0, PR 0.2).
 *
 * Bewust zonder parser-dependency: de output van Next.js is voorspelbaar
 * (React-SSR-attributen tussen dubbele quotes) en we lezen alleen een handvol
 * head-elementen plus de `<h1>`'s. Alles hier is puur en unit-getest in
 * `compare.test.ts`.
 */

export type HreflangMap = Record<string, string>;

export interface SitemapEntry {
  /** Pad incl. eventuele query, zonder origin (bv. "/" of "/en/tarieven"). */
  path: string;
  /** Absolute <loc> zoals in de sitemap. */
  loc: string;
  /** xhtml:link rel=alternate → hreflang → absolute href. */
  alternates: HreflangMap;
}

export interface PageSeo {
  status: number;
  /** `Location`-header bij een redirect, anders null. */
  location: string | null;
  /** Alle document-`<title>`'s (SVG-titels uitgesloten). */
  titles: string[];
  /** Alle `<link rel="canonical">`-hrefs. */
  canonicals: string[];
  /** `<link rel="alternate" hreflang>` → href. */
  hreflang: HreflangMap;
  /** Inhoud van `<meta name="robots">`, of null. */
  robots: string | null;
  /** Genormaliseerde tekst van elke `<h1>`, in documentvolgorde. */
  h1: string[];
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/**
 * Tags → spatie (een `<br>` of block-`<span>` scheidt woorden), entities
 * decoderen, witruimte samenvoegen.
 */
export function normalizeText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Attributen van één tag → object met lowercase sleutels. */
export function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  for (const m of tag.matchAll(re)) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? "");
  }
  return attrs;
}

/** URL → pad + query, zonder origin. "https://x.nl" en "https://x.nl/" → "/". */
export function toPath(url: string): string {
  const u = new URL(url);
  return `${u.pathname || "/"}${u.search}`;
}

export function parseSitemap(xml: string): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  for (const block of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const body = block[1];
    const locMatch = /<loc>([\s\S]*?)<\/loc>/.exec(body);
    if (!locMatch) continue;
    const loc = decodeEntities(locMatch[1].trim());
    const alternates: HreflangMap = {};
    for (const link of body.matchAll(/<xhtml:link\b[^>]*>/g)) {
      const a = parseAttributes(link[0]);
      if (a.rel === "alternate" && a.hreflang && a.href) alternates[a.hreflang] = a.href;
    }
    entries.push({ path: toPath(loc), loc, alternates });
  }
  return entries;
}

export function extractPageSeo(html: string, status: number, location: string | null = null): PageSeo {
  // SVG-iconen kunnen eigen <title>-elementen bevatten; die zijn geen documenttitel.
  const doc = html.replace(/<svg\b[\s\S]*?<\/svg>/gi, "");

  const titles = [...doc.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map((m) => normalizeText(m[1]));

  const canonicals: string[] = [];
  const hreflang: HreflangMap = {};
  for (const m of doc.matchAll(/<link\b[^>]*>/gi)) {
    const a = parseAttributes(m[0]);
    const rel = (a.rel ?? "").toLowerCase().split(/\s+/);
    if (rel.includes("canonical") && a.href) canonicals.push(a.href);
    if (rel.includes("alternate") && a.hreflang && a.href) hreflang[a.hreflang] = a.href;
  }

  let robots: string | null = null;
  for (const m of doc.matchAll(/<meta\b[^>]*>/gi)) {
    const a = parseAttributes(m[0]);
    if ((a.name ?? "").toLowerCase() === "robots") {
      robots = a.content ?? "";
      break;
    }
  }

  const h1 = [...doc.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => normalizeText(m[1]));

  return { status, location, titles, canonicals, hreflang, robots, h1 };
}
