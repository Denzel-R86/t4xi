/**
 * Locatie-alias-resolutie — puur, geen IO, geen prijslogica.
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
 * ── Resolutievolgorde (Stap 10l) ───────────────────────────────────────────
 *
 * Deze module levert prioriteit 2 en 3; prioriteit 1 zit in findLocation():
 *
 *   1. EXACTE SLUG   — findLocation() probeert `slugify(input)` eerst tegen
 *                      public.locations. Bestaat de locatie letterlijk, dan wint
 *                      die altijd en komt deze module er niet aan te pas.
 *   2. WIJK          — postcode- of trefwoordmatch op stadsdeelniveau.
 *   3. STAD          — stadsfallback, alleen als geen wijk bepaald kan worden.
 *
 * Waarom die volgorde: op 2026-07-19 gingen de Rotterdamse en Haagse wijkroutes
 * live. De aliasregel "plaats bevat rotterdam → slug rotterdam" draaide toen nog
 * vóór de exacte lookup en trok élk Rotterdams adres — inclusief de letterlijke
 * slug `rotterdam-kralingen` — terug naar de stadsprijs. De tarievenpagina toonde
 * Hillegersberg → Schiphol voor €105 terwijl de quote €119 rekende. Zulke
 * verschillen tussen tarievenpagina, quote-API en boekingsprijs mogen niet
 * bestaan: de klant ziet en betaalt hetzelfde bedrag.
 *
 * Postcodebereiken zijn geverifieerd tegen PDOK Locatieserver (2026-07-19).
 * Amsterdam, Almere en Utrecht houden bewust hun bestaande, grovere mapping —
 * hun wijkroutes bestonden al en het gedrag verandert daar niet.
 */

type PostcodeRule = { min: number; max: number; slug: string };

/**
 * Postcode-ranges → canonieke slug. Wordt op volgorde doorlopen: de eerste
 * match wint, dus WIJKREGELS STAAN VÓÓR STADSREGELS. Verplaats een stadsregel
 * nooit naar boven — dan verdwijnt de wijkresolutie stilzwijgend.
 */
const POSTCODE_RULES: PostcodeRule[] = [
  // ── Prioriteit 2a: bestaande wijken (ongewijzigd gedrag) ────────────────
  { min: 1117, max: 1118, slug: "schiphol-airport" },
  { min: 1361, max: 1363, slug: "almere-poort" },
  { min: 1311, max: 1319, slug: "almere-stad-centrum" },
  { min: 1011, max: 1019, slug: "amsterdam-centrum" },
  { min: 3511, max: 3512, slug: "utrecht-centrum" },

  // ── Prioriteit 2b: Rotterdamse wijken ───────────────────────────────────
  { min: 3011, max: 3016, slug: "rotterdam-centrum" },
  { min: 3021, max: 3029, slug: "rotterdam-delfshaven" },
  { min: 3038, max: 3043, slug: "rotterdam-blijdorp" },
  { min: 3051, max: 3056, slug: "rotterdam-hillegersberg" },
  { min: 3061, max: 3065, slug: "rotterdam-kralingen" },
  { min: 3066, max: 3079, slug: "rotterdam-prins-alexander" },

  // ── Prioriteit 2c: Haagse wijken ────────────────────────────────────────
  { min: 2491, max: 2497, slug: "den-haag-ypenburg" },
  { min: 2511, max: 2517, slug: "den-haag-centrum" },
  { min: 2551, max: 2555, slug: "den-haag-loosduinen" },
  { min: 2582, max: 2582, slug: "den-haag-statenkwartier" },
  { min: 2583, max: 2587, slug: "den-haag-scheveningen" },
  { min: 2596, max: 2597, slug: "den-haag-benoordenhout" },

  // ── Prioriteit 3: stadsfallback — MOET onderaan blijven ─────────────────
  { min: 3000, max: 3089, slug: "rotterdam" },
  { min: 2491, max: 2599, slug: "den-haag" },
];

/**
 * Trefwoord-fallback als er geen (herkenbare) postcode is. Conservatief.
 * Zelfde volgorde-eis: wijknamen vóór stadsnamen.
 */
const KEYWORD_RULES: { test: (full: string, place: string) => boolean; slug: string }[] = [
  // Prioriteit 2 — bestaande wijken
  { test: (_f, p) => p.includes("schiphol"), slug: "schiphol-airport" },
  { test: (f) => f.includes("almere poort") || f.includes("almere-poort"), slug: "almere-poort" },
  { test: (f) => f.includes("almere stad") || f.includes("almere-stad"), slug: "almere-stad-centrum" },
  { test: (f) => f.includes("amsterdam") && f.includes("centrum"), slug: "amsterdam-centrum" },
  { test: (f) => f.includes("utrecht") && f.includes("centrum"), slug: "utrecht-centrum" },

  // Prioriteit 2 — Rotterdamse wijken
  { test: (f) => f.includes("kralingen"), slug: "rotterdam-kralingen" },
  { test: (f) => f.includes("hillegersberg"), slug: "rotterdam-hillegersberg" },
  { test: (f) => f.includes("blijdorp"), slug: "rotterdam-blijdorp" },
  { test: (f) => f.includes("delfshaven"), slug: "rotterdam-delfshaven" },
  { test: (f) => f.includes("prins alexander") || f.includes("prinsenland"), slug: "rotterdam-prins-alexander" },
  { test: (f) => f.includes("rotterdam") && f.includes("centrum"), slug: "rotterdam-centrum" },

  // Prioriteit 2 — Haagse wijken
  { test: (f) => f.includes("scheveningen"), slug: "den-haag-scheveningen" },
  { test: (f) => f.includes("benoordenhout"), slug: "den-haag-benoordenhout" },
  { test: (f) => f.includes("statenkwartier"), slug: "den-haag-statenkwartier" },
  { test: (f) => f.includes("ypenburg"), slug: "den-haag-ypenburg" },
  { test: (f) => f.includes("loosduinen"), slug: "den-haag-loosduinen" },

  // Prioriteit 3 — stadsfallback, onderaan
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
 *
 * LET OP: dit is prioriteit 2 en 3. Een input die zelf al een bestaande slug is,
 * hoort niet hier terecht te komen — findLocation() vangt die eerder af.
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
