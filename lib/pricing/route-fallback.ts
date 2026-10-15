/**
 * Wijk → stad-terugval voor VASTE ROUTES (2026-10-15).
 *
 * AANLEIDING. Een adres mét postcode resolvet naar de WIJK, een adres zonder
 * postcode naar de STAD. De intercity-tarieven bestaan echter uitsluitend op
 * stadsniveau. Daardoor gaf "Moermanskkade 107, 1013 BC Amsterdam"
 * (-> amsterdam-centrum) "Offerte op aanvraag", terwijl hetzelfde adres zonder
 * postcode (-> amsterdam) gewoon EUR 75 opleverde. Hetzelfde gold voor
 * Rotterdam en Utrecht. Luchthavenroutes bestaan wél per wijk en werkten dus
 * altijd al.
 *
 * WAT DEZE MODULE DOET. Uitsluitend het bepalen van KANDIDAATPAREN voor de
 * vaste-routezoekactie, geordend van specifiek naar generiek. Deze module
 * raakt de algemene locatieresolver niet aan: `findLocation()` en
 * `resolveLocationSlug()` blijven exact zoals ze waren, en de postcode wordt
 * nooit gestript. De herkende locatie blijft de herkende locatie — er wordt
 * alleen EXTRA gezocht wanneer er voor die exacte locaties geen route bestaat.
 *
 * HARDE GRENZEN
 *   • Alleen `district` mag terugvallen. `airport`, `landmark` en elk ander
 *     type nooit — anders zou Rotterdam Airport (EUR 39 + aankomsttoeslag)
 *     terugvallen op de stad Rotterdam, en zouden Antwerpen en Brussel
 *     ineens een prijs krijgen die bewust op aanvraag staat.
 *   • Terugvallen kan uitsluitend naar de EIGEN stad (zelfde `city_id`).
 *     Nooit naar een andere stad.
 *   • Een bestaande exacte route wint altijd: de aanroeper probeert niveau 0
 *     (exact -> exact) eerst en komt hier pas daarna.
 *   • Inactieve locaties en routes doen nooit mee (de aanroeper levert alleen
 *     actieve locaties aan; de routelookup filtert zelf op `active`).
 */

/** Minimale locatievorm die deze module nodig heeft. */
export type FallbackLocation = {
  id: string;
  slug: string;
  location_type: string;
  city_id: string | null;
  active?: boolean;
};

/**
 * De ENIGE locatietypes die naar hun bovenliggende stad mogen terugvallen.
 * Bewust een allowlist en geen blocklist: een nieuw, specifiek locatietype
 * (station, haven, hotel) valt daardoor standaard NIET terug, in plaats van
 * stilzwijgend als gewone stad te worden behandeld.
 */
export const FALLBACK_ELIGIBLE_TYPES: ReadonlySet<string> = new Set(["district"]);

/** Mag deze locatie naar haar eigen stad terugvallen? */
export function isFallbackEligible(loc: FallbackLocation | null): boolean {
  if (!loc) return false;
  if (loc.active === false) return false;
  if (!loc.city_id) return false;
  return FALLBACK_ELIGIBLE_TYPES.has(loc.location_type);
}

/** Eén te proberen combinatie van locatie-ids. */
export type RouteCandidate = {
  pickupId: string;
  dropoffId: string;
  /** Welke zijde(n) zijn gegeneraliseerd — uitsluitend voor diagnostiek/logging. */
  generalised: "none" | "dropoff" | "pickup" | "both";
};

/**
 * Kandidaatparen, gegroepeerd per SPECIFICITEITSNIVEAU en geordend van
 * specifiek naar generiek:
 *
 *   niveau 0  exact    -> exact      (door de aanroeper al geprobeerd)
 *   niveau 1  exact    -> stad   EN  stad -> exact
 *   niveau 2  stad     -> stad
 *
 * Binnen niveau 1 staan twee onderling gelijkwaardige kandidaten. Leveren die
 * verschillende routes op, dan is er geen objectieve reden om er één te
 * kiezen; de aanroeper valt dan fail-closed terug op "Offerte op aanvraag".
 * Niveau 2 bevat per definitie hoogstens één kandidaat.
 *
 * Niveaus zonder kandidaten worden weggelaten, zodat de aanroeper simpelweg
 * over de niveaus kan itereren.
 */
export function buildFallbackLevels(input: {
  pickup: FallbackLocation;
  dropoff: FallbackLocation;
  /** Stadlocatie van de pickup, of `null` wanneer die niet bestaat/niet mag. */
  pickupCity: FallbackLocation | null;
  /** Stadlocatie van de dropoff, of `null` wanneer die niet bestaat/niet mag. */
  dropoffCity: FallbackLocation | null;
}): RouteCandidate[][] {
  const { pickup, dropoff } = input;

  // Een stadkandidaat telt alleen wanneer de locatie zelf terugvalgeschikt is,
  // de stadlocatie bestaat, actief is, tot DEZELFDE stad behoort en niet de
  // locatie zelf is (een city-locatie valt nooit op zichzelf terug).
  const cityOf = (loc: FallbackLocation, city: FallbackLocation | null): FallbackLocation | null => {
    if (!isFallbackEligible(loc)) return null;
    if (!city || city.active === false) return null;
    if (city.city_id !== loc.city_id) return null;
    if (city.id === loc.id) return null;
    return city;
  };

  const pickupCity = cityOf(pickup, input.pickupCity);
  const dropoffCity = cityOf(dropoff, input.dropoffCity);

  const levels: RouteCandidate[][] = [];

  // Niveau 1 — precies één zijde gegeneraliseerd.
  const niveau1: RouteCandidate[] = [];
  if (dropoffCity) {
    niveau1.push({ pickupId: pickup.id, dropoffId: dropoffCity.id, generalised: "dropoff" });
  }
  if (pickupCity) {
    niveau1.push({ pickupId: pickupCity.id, dropoffId: dropoff.id, generalised: "pickup" });
  }
  if (niveau1.length > 0) levels.push(niveau1);

  // Niveau 2 — beide zijden gegeneraliseerd; als laatste.
  if (pickupCity && dropoffCity) {
    levels.push([{ pickupId: pickupCity.id, dropoffId: dropoffCity.id, generalised: "both" }]);
  }

  return levels;
}

/** Uitkomst van één niveau. */
export type LevelOutcome<T> =
  | { kind: "none" }
  | { kind: "match"; route: T; candidate: RouteCandidate }
  | { kind: "ambiguous"; candidates: RouteCandidate[] };

/**
 * Beoordeelt de treffers binnen ÉÉN specificiteitsniveau.
 *
 * `samePrice` bepaalt of twee treffers commercieel identiek zijn. Zijn ze dat,
 * dan is er geen keuze te maken en wint de eerste; verschillen ze, dan is de
 * uitkomst `ambiguous` en hoort de aanroeper fail-closed te stoppen in plaats
 * van willekeurig een prijs te kiezen.
 */
export function resolveLevel<T>(
  treffers: { route: T | null; candidate: RouteCandidate }[],
  samePrice: (a: T, b: T) => boolean
): LevelOutcome<T> {
  const gevonden = treffers.filter((t): t is { route: T; candidate: RouteCandidate } => t.route !== null);
  if (gevonden.length === 0) return { kind: "none" };

  const eerste = gevonden[0]!;
  const afwijkend = gevonden.slice(1).filter((t) => !samePrice(eerste.route, t.route));
  if (afwijkend.length > 0) {
    return { kind: "ambiguous", candidates: gevonden.map((t) => t.candidate) };
  }
  return { kind: "match", route: eerste.route, candidate: eerste.candidate };
}
