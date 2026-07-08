/**
 * Locatie-alias-resolutie (Stap 9e) — puur, geen IO, geen prijslogica.
 *
 * Zet een vrij (straat)adres om naar een canonieke fixed-route location-slug,
 * zodat de bestaande Pricing Engine ook straatadressen kan prijzen in plaats van
 * altijd "Offerte op aanvraag" te geven. Uitsluitend LOCATIE-normalisatie — de
 * prijsberekening zelf verandert niet.
 *
 * Wordt aangeroepen binnen findLocation() in lib/pricing/service.ts, dus zowel de
 * preview (/api/pricing/quote) als de booking-submit (/api/bookings →
 * getPricingQuote) gebruiken exact dezelfde mapping. Het opgeslagen adres in de
 * boeking blijft het echte klantadres; alleen de prijslookup gebruikt de slug.
 *
 * Strategie: postcode-first (betrouwbaar; PDOK-adressen bevatten altijd een
 * postcode), met een conservatieve keyword-fallback op het plaats-deel.
 */

type PostcodeRule = { min: number; max: number; slug: string };

/** Postcode-ranges → canonieke slug (alle slugs bestaan in public.locations). */
const POSTCODE_RULES: PostcodeRule[] = [
  { min: 1117, max: 1118, slug: "schiphol-airport" },
  { min: 1361, max: 1363, slug: "almere-poort" },
  { min: 1311, max: 1319, slug: "almere-stad-centrum" },
  { min: 1011, max: 1019, slug: "amsterdam-centrum" },
  { min: 3511, max: 3512, slug: "utrecht-centrum" },
  { min: 3000, max: 3089, slug: "rotterdam" },
  { min: 2491, max: 2599, slug: "den-haag" },
];

/** Keyword-fallback als er geen (herkenbare) postcode is. Conservatief. */
const KEYWORD_RULES: { test: (full: string, place: string) => boolean; slug: string }[] = [
  { test: (_f, p) => p.includes("schiphol"), slug: "schiphol-airport" },
  { test: (f) => f.includes("almere poort") || f.includes("almere-poort"), slug: "almere-poort" },
  { test: (f) => f.includes("almere stad") || f.includes("almere-stad"), slug: "almere-stad-centrum" },
  { test: (f) => f.includes("amsterdam") && f.includes("centrum"), slug: "amsterdam-centrum" },
  { test: (f) => f.includes("utrecht") && f.includes("centrum"), slug: "utrecht-centrum" },
  { test: (_f, p) => p.includes("rotterdam"), slug: "rotterdam" },
  {
    test: (_f, p) => p.includes("den haag") || p.includes("hague") || p.includes("gravenhage"),
    slug: "den-haag",
  },
];

const POSTCODE_RE = /\b([1-9]\d{3})\s?[A-Za-z]{2}\b/;

function postcode4(address: string): number | null {
  const m = address.match(POSTCODE_RE);
  return m ? Number(m[1]) : null;
}

/** Het plaats-deel (laatste komma-segment, zonder postcode) — voor keyword-match. */
function placeOf(lowerAddress: string): string {
  const seg = lowerAddress.split(",").pop() ?? lowerAddress;
  return seg.replace(POSTCODE_RE, " ").replace(/\s+/g, " ").trim();
}

/**
 * Canonieke fixed-route location-slug voor een adres, of null als er geen
 * betrouwbare match is (dan blijft het "Offerte op aanvraag").
 */
export function resolveLocationSlug(address: string): string | null {
  if (!address || !address.trim()) return null;

  const pc = postcode4(address);
  if (pc !== null) {
    for (const rule of POSTCODE_RULES) {
      if (pc >= rule.min && pc <= rule.max) return rule.slug;
    }
  }

  const full = address.toLowerCase();
  const place = placeOf(full);
  for (const rule of KEYWORD_RULES) {
    if (rule.test(full, place)) return rule.slug;
  }

  return null;
}
