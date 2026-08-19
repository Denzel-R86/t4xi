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
 * Postcodebereiken zijn geverifieerd tegen PDOK Locatieserver (2026-07-19;
 * uitbreiding Amsterdam/Almere/Utrecht 2026-07-22 — zie ankers per regel).
 *
 * ── Uitbreiding 2026-07-22 (productieblokker 2) ────────────────────────────
 *
 * De E2E-testboeking legde bloot dat echte PDOK-adreslabels buiten de gedekte
 * wijken op NIETS resolveerden: geen prijs én geen luchthavencontext, terwijl
 * /tarieven de wijkprijs wél adverteerde (bv. Zuidas €50). Toegevoegd:
 *   · wijkregels voor alle actieve wijken met een gepubliceerde prijs;
 *   · stadsfallbacks voor Amsterdam, Almere en Utrecht (Rotterdam en Den Haag
 *     bestonden al).
 * Wijkgrenzen zijn conservatief: bij twijfel valt een adres op de stadsprijs
 * terug (eerlijk en zichtbaar) in plaats van op een mogelijk verkeerde
 * wijkprijs.
 */

type PostcodeRule = { min: number; max: number; slug: string };
type ExactPostcodeRule = { postcode: string; slug: string };

/**
 * Exacte (6-teken) postcode-matches — draaien VÓÓR de prefix-`POSTCODE_RULES`
 * hieronder en veranderen niets aan het gedrag daarvan. Bewust NIET als
 * 4-cijferige prefix-regel gemodelleerd: `POSTCODE_RULES` dekt hele wijken,
 * maar deze twee bestemmingen zijn één specifiek gebouw op één specifieke
 * postcode — een 4-cijferige prefix (bv. "5657" of "6041") omvat ook talloze
 * andere, ongerelateerde adressen in dezelfde postcode-prefix (geverifieerd
 * via PDOK: 5657 bevat o.a. Castendijkweg/Ekkersrijt/Parmentierweg; 6041 bevat
 * o.a. Abdijhof/Andersonweg/Bakkerstraat) en zou die dus onterecht meenemen.
 */
const EXACT_POSTCODE_RULES: ExactPostcodeRule[] = [
  // PDOK-anker (2026-08-12): Luchthavenweg 25, 5657EA Eindhoven.
  { postcode: "5657EA", slug: "eindhoven-airport" },
  // PDOK-anker (2026-08-12): Stadsweide 2/2A, 6041TD Roermond.
  { postcode: "6041TD", slug: "designer-outlet-roermond" },
  // PDOK-anker (2026-08-19, hotfix): Rotterdam Airportplein, 3045AP Rotterdam
  // — PDOK bevestigt dat dit postcode UITSLUITEND "Rotterdam Airportplein"-
  // adressen bevat (44 resultaten, geen enkel ander adres), dus veilig als
  // exacte match. Zonder deze regel viel dit postcode terug op de generieke
  // Rotterdam-stadsrange (3000–3089 in POSTCODE_RULES), waardoor het adres
  // dat de autocomplete daadwerkelijk verstuurt voor de luchthaven
  // (`addressLabelFor()` in local-locations.ts stuurt altijd het volledige
  // `address`-veld, nooit de kale naam) ten onrechte op de STAD resolveerde —
  // luchthavencontext en vluchtnummerplicht gingen verloren, en de klant
  // betaalde de stadsprijs i.p.v. de vaste luchthavenprijs.
  { postcode: "3045AP", slug: "rotterdam-airport" },
];

const FULL_POSTCODE_RE = /\b([1-9]\d{3})\s?([A-Za-z]{2})\b/;

/** Volledige 6-teken postcode (bv. "5657EA"), of null. Los van postcode4() hieronder. */
function fullPostcode(address: string): string | null {
  const m = address.match(FULL_POSTCODE_RE);
  return m ? `${m[1]}${m[2].toUpperCase()}` : null;
}

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

  // ── Prioriteit 2a-uitbreiding 2026-07-22: Amsterdamse wijken ─────────────
  // PDOK-ankers: Buikslotermeerplein 1 → 1025, wijk Buikslotermeer (Noord).
  { min: 1021, max: 1039, slug: "amsterdam-noord" },
  // Ankers: Albert Cuypstraat 100 → 1072 Oude Pijp; Apollolaan 100 → 1077 Apollobuurt.
  { min: 1071, max: 1077, slug: "amsterdam-oud-zuid-de-pijp" },
  // Anker: Gustav Mahlerlaan 10 → 1082, wijk Zuidas. Bewust alléén 1082:
  // 1081/1083 (Buitenveldert) vallen op de stadsprijs terug.
  { min: 1082, max: 1082, slug: "amsterdam-zuidas" },
  // Ankers: IJburglaan → IJburg-West (1086–1087); Middenweg 10 → 1097 Frankendael.
  { min: 1086, max: 1087, slug: "amsterdam-oost" },
  { min: 1091, max: 1099, slug: "amsterdam-oost" },
  // Anker: Bijlmerplein 100 → 1102, wijk Amsterdamse Poort (Zuidoost).
  { min: 1101, max: 1108, slug: "amsterdam-zuidoost-bijlmer" },

  // ── Prioriteit 2a-uitbreiding 2026-07-22: Almeerse wijken ────────────────
  // Ankers: Poortmolenstraat 1 → 1333 Molenbuurt (Buiten); Evenaar 100 → 1338
  // Bloemenbuurt (Buiten).
  { min: 1333, max: 1349, slug: "almere-buiten" },
  // Anker: Marktgracht 23 → 1353, wijk Centrum Almere Haven.
  { min: 1351, max: 1357, slug: "almere-haven" },

  // ── Prioriteit 2a-uitbreiding 2026-07-22: Utrechtse wijken ───────────────
  // Anker: Langerakbaan 135 → 3544, wijk Leidsche Rijn.
  { min: 3541, max: 3546, slug: "leidsche-rijn" },
  // Anker: Heidelberglaan 8 → 3584 (Utrecht Science Park).
  { min: 3584, max: 3584, slug: "de-uithof-science-park" },

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
  // 2026-07-22: ontbrekende stadsfallbacks. 1000–1109 = woonplaats Amsterdam
  // (1380+ = Weesp, bewust erbuiten); 1300–1369 = Almere; 3500–3585 = Utrecht.
  { min: 1000, max: 1109, slug: "amsterdam" },
  { min: 1300, max: 1369, slug: "almere" },
  { min: 3500, max: 3585, slug: "utrecht" },
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

  // Prioriteit 2 — Amsterdamse wijken (2026-07-22). LET OP: "amsterdam zuidoost"
  // vóór elke eventuele "amsterdam zuid"-regel — de tweede is een substring.
  { test: (f) => f.includes("zuidas"), slug: "amsterdam-zuidas" },
  { test: (f) => f.includes("de pijp") || f.includes("oud-zuid") || f.includes("oud zuid"), slug: "amsterdam-oud-zuid-de-pijp" },
  { test: (f) => f.includes("amsterdam zuidoost") || f.includes("bijlmer"), slug: "amsterdam-zuidoost-bijlmer" },
  { test: (f) => f.includes("amsterdam noord") || f.includes("amsterdam-noord"), slug: "amsterdam-noord" },
  { test: (f) => f.includes("amsterdam oost") || f.includes("amsterdam-oost"), slug: "amsterdam-oost" },

  // Prioriteit 2 — Almeerse wijken (2026-07-22)
  { test: (f) => f.includes("almere buiten") || f.includes("almere-buiten"), slug: "almere-buiten" },
  { test: (f) => f.includes("almere haven") || f.includes("almere-haven"), slug: "almere-haven" },
  { test: (f) => f.includes("almere hout") || f.includes("almere-hout"), slug: "almere-hout" },
  { test: (f) => f.includes("muziekwijk"), slug: "almere-muziekwijk" },
  { test: (f) => f.includes("oostvaardersbuurt") || f.includes("almere oostvaarders"), slug: "almere-oostvaarders" },

  // Prioriteit 2 — Utrechtse wijken (2026-07-22). "science park" alleen met
  // utrecht erbij: Amsterdam heeft óók een Science Park.
  { test: (f) => f.includes("leidsche rijn") || f.includes("leidsche-rijn"), slug: "leidsche-rijn" },
  { test: (f) => f.includes("uithof") || (f.includes("science park") && f.includes("utrecht")), slug: "de-uithof-science-park" },

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
  // 2026-07-22: ontbrekende stadsfallbacks. Match op het PLAATS-segment, zodat
  // "Hotel Amsterdam, Rotterdam" niet per ongeluk op Amsterdam uitkomt.
  { test: (_f, p) => p.includes("amsterdam"), slug: "amsterdam" },
  { test: (_f, p) => p.includes("almere"), slug: "almere" },
  { test: (_f, p) => p.includes("utrecht"), slug: "utrecht" },
];

/**
 * Landmark-aliassen — bewust een APARTE, kleine lijst i.p.v. toevoegingen aan
 * KEYWORD_RULES hierboven, zodat deze twee regels onafhankelijk te auditen en
 * terug te draaien zijn. Elke regel vereist een EENDUIDIGE combinatie (nooit
 * los "airport"/"outlet"/"eindhoven"/"roermond"/"luchthavenweg"/"stadsweide"):
 *   · exacte naamvarianten ("eindhoven airport", "eindhoven-airport",
 *     "designer outlet roermond", "mcarthurglen"+"roermond");
 *   · huisnummerbewuste straatmatch + stad/postcode-context ("luchthavenweg 25"
 *     + eindhoven/5657ea; "stadsweide 2(a)" + roermond/6041td).
 * Draait vóór de generieke KEYWORD_RULES (hogere specificiteit wint).
 */
const LANDMARK_KEYWORD_RULES: { test: (full: string) => boolean; slug: string }[] = [
  {
    test: (f) =>
      f.includes("eindhoven airport") ||
      f.includes("eindhoven-airport") ||
      (/luchthavenweg\s*25(-\d+)?\b/.test(f) && (f.includes("eindhoven") || f.includes("5657ea"))),
    slug: "eindhoven-airport",
  },
  {
    test: (f) =>
      f.includes("designer outlet roermond") ||
      (f.includes("mcarthurglen") && f.includes("roermond")) ||
      (/stadsweide\s*2a?\b/.test(f) && (f.includes("roermond") || f.includes("6041td"))),
    slug: "designer-outlet-roermond",
  },
  // Hotfix 2026-08-19: uitsluitend VOLLEDIGE, ondubbelzinnige luchthavennamen
  // — "Rotterdam Airport" (de bestaande alias, tot nu toe alleen bij toeval
  // via een letterlijke slug-match werkend) en de officiële volledige naam
  // "Rotterdam The Hague Airport". Bewust GEEN losse woorden ("airport",
  // "vliegveld", "luchthaven", "Rotterdam") en GEEN "Zestienhoven" — dat is
  // de wijknaam en zou een woon-/wijkadres ten onrechte als luchthaven
  // kunnen classificeren. Het huisnummerbewuste adrespatroon vangt het geval
  // waarin de postcode ontbreekt (EXACT_POSTCODE_RULES hierboven dekt de
  // postcode-aanwezige variant al).
  {
    test: (f) =>
      f.includes("rotterdam the hague airport") ||
      f.includes("rotterdam-the-hague-airport") ||
      f.includes("rotterdam airport") ||
      f.includes("rotterdam-airport") ||
      (/rotterdam airportplein\s*60(-\d+)?\b/.test(f) && (f.includes("rotterdam") || f.includes("3045ap"))),
    slug: "rotterdam-airport",
  },
];

/**
 * Smalle, eenduidige uitzondering (2026-08-19, hotfix): het KALE label
 * "Rotterdam centrum" / "Rotterdam-centrum" (niets eromheen — geen straat,
 * geen huisnummer, geen extra adresdelen) moet dezelfde vaste route vinden
 * als het kale "Rotterdam" (de bestaande €39-route naar Rotterdam Airport,
 * pickup_slug "rotterdam"). Zonder deze uitzondering matchte dat label de
 * bredere `KEYWORD_RULES`-regel hieronder ("rotterdam" + "centrum" ⇒ wijk-slug
 * "rotterdam-centrum"), en die wijk heeft geen eigen vaste route — dus viel de
 * offerte terug op distance_tariff (€30 i.p.v. €39).
 *
 * Bewust GEEN generieke substringmatch op alleen "centrum": een echt
 * straatadres in het centrum (bv. "Coolsingel 1, Rotterdam Centrum") bevat
 * meer dan alleen dit kale label en blijft daarom via de bestaande, bredere
 * KEYWORD_RULES-regel naar de wijk-slug "rotterdam-centrum" resolven —
 * ongewijzigd gedrag. "Rotterdam Centraal" (het station) bevat het woord
 * "centrum" niet en wordt door deze regex nooit geraakt.
 */
const BARE_ROTTERDAM_CENTRUM_RE = /^rotterdam[\s-]+centrum$/;

/**
 * Zelfde kale-labelcheck als hierboven, maar als HERBRUIKBARE export
 * (2026-08-19): `findLocation()` in service.ts roept dit vóór zijn eigen
 * exacte-slug-stap aan. Reden: `slugify("Rotterdam centrum")` produceert
 * toevallig "rotterdam-centrum" — een ECHTE, bestaande wijk-slug — dus de
 * normale exacte-slug-stap zou die wijk altijd vinden vóórdat deze module
 * (stap 2, alias-resolutie) ooit aan bod komt. Voor dit ene, letterlijke kale
 * label moet de STAD winnen (dezelfde bestaande vaste route als "Rotterdam"),
 * dus dat vereist een uitzondering die zelfs vóór de exacte-slug-stap wint.
 * Retourneert uitsluitend voor deze smalle, eenduidige gevallen — nooit voor
 * een echt straatadres, en nooit voor een andere plaats. Alle overige exacte-
 * slug-matches (inclusief de slug "rotterdam-centrum" zelf, als iemand die
 * letterlijk als slug intypt) blijven via findLocation() ongewijzigd hun
 * normale, absolute voorrang houden.
 */
export function resolvePriorityLocationSlug(address: string): string | null {
  if (!address) return null;
  const normalized = address.toLowerCase().trim().replace(/\s+/g, " ");
  return BARE_ROTTERDAM_CENTRUM_RE.test(normalized) ? "rotterdam" : null;
}

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

  // Exacte postcode (6 tekens) — vóór de prefix-POSTCODE_RULES, verandert daar niets aan.
  const fullPc = fullPostcode(address);
  if (fullPc !== null) {
    for (const rule of EXACT_POSTCODE_RULES) {
      if (fullPc === rule.postcode) return rule.slug;
    }
  }

  const pc = postcode4(address);
  if (pc !== null) {
    for (const rule of POSTCODE_RULES) {
      if (pc >= rule.min && pc <= rule.max) return rule.slug;
    }
  }

  const full = address.toLowerCase();
  const place = placeOf(full);

  // Smalle uitzondering (2026-08-19, hotfix) — vóór alle overige regels: het
  // KALE label "Rotterdam centrum"/"Rotterdam-centrum" wint van de bredere
  // wijkregel hieronder. Zie BARE_ROTTERDAM_CENTRUM_RE hierboven.
  const normalizedFull = full.trim().replace(/\s+/g, " ");
  if (BARE_ROTTERDAM_CENTRUM_RE.test(normalizedFull)) return "rotterdam";

  // Landmark-aliassen — hoge specificiteit, vóór de generieke KEYWORD_RULES.
  for (const rule of LANDMARK_KEYWORD_RULES) {
    if (rule.test(full)) return rule.slug;
  }

  for (const rule of KEYWORD_RULES) {
    if (rule.test(full, place)) return rule.slug;
  }

  // 2026-07-22 (E2E-bevinding): PDOK-wóónplaatslabels hebben de vorm
  // "Plaats, Gemeente, Provincie" ("Schiphol, Haarlemmermeer, Noord-Holland"),
  // zodat het láátste segment geen bruikbare plaats is. Alleen voor dat
  // driedelige formaat proberen we het EERSTE segment als plaats. De eisen
  // (≥ 2 komma's, geen cijfers) sluiten straatlabels uit: "Schipholweg 1,
  // Leiden" en "Utrechtseweg, Arnhem" komen hier nooit doorheen.
  const segments = full.split(",").map((s) => s.trim());
  const first = segments[0] ?? "";
  if (segments.length >= 3 && first && !/\d/.test(first)) {
    for (const rule of KEYWORD_RULES) {
      if (rule.test(first, first)) return rule.slug;
    }
  }

  return null;
}
