// SERVER-ONLY module: gebruikt de service-role client en mag nooit in een
// client component worden geïmporteerd. (Idiomatische guard `import "server-only"`
// kan later worden toegevoegd zodra het pakket als dependency wordt opgenomen.)
import {
  createPricingReadClient,
  createPricingLogClient,
  type PricingSupabaseClient,
} from "@/lib/supabase/server";
import type { Json, Tables, TablesInsert } from "@/lib/types/database";
import { resolveLocationSlug } from "@/lib/pricing/location-aliases";
import { getDrivingRoute, type DrivingRoute } from "@/lib/pricing/routing";
import { priceFromDistance, DEFAULT_DISTANCE_TARIFF } from "@/lib/pricing/distance-tariff";
import {
  classifyDestination,
  computeShadowDeadhead,
  type DeadheadConfig,
  type ShadowDeadheadResult,
} from "@/lib/pricing/deadhead-shadow";
import {
  normalizeOfficialWoonplaats,
  resolveZoneCityIdFromWoonplaats,
  resolveZoneCityIdFromPostcode4Fallback,
  couldPlausiblyBeInZone,
  PLAUSIBLE_ZONE_MIN_DISTANCE_KM_FLOOR,
} from "@/lib/pricing/deadhead-zone";
import {
  lookupOfficialWoonplaats as pdokLookupOfficialWoonplaats,
  PdokLookupError,
  PDOK_ZONE_LOOKUP_TIMEOUT_MS,
} from "@/lib/pricing/pdok-woonplaats";

/**
 * T4XI Pricing Service — v1 (App Router, server-side).
 *
 * Bron van waarheid: `fixed_route_prices` (price = enkel, return_price = retour).
 * Voor vaste routes wordt de retourprijs RECHTSTREEKS uit `return_price` gelezen;
 * er wordt GEEN kortingsmodel toegepast.
 *
 * Fallback (afstand-tarief): bestaat er geen vaste route, dan wordt — mits een
 * routing-API een echte rij-afstand + rijtijd levert — een BINDENDE prijs berekend
 * met het door de eigenaar goedgekeurde cost-plus-tarief (zie distance-tariff.ts).
 * Levert de routing niets op (geen key/fout/onbekend), dan blijft het "offerte op
 * aanvraag". De afstandsbron is Google Directions (zie routing.ts).
 */

const DEFAULT_VEHICLE_CLASS = "executive-ev";
const QUOTE_ON_REQUEST_MESSAGE = "Offerte op aanvraag";

// ── Types ───────────────────────────────────────────────────────────────────

export type PricingQuoteInput = {
  /** slug, locatienaam of vrije tekst voor het ophaalpunt */
  pickup: string;
  /** slug, locatienaam of vrije tekst voor de bestemming */
  dropoff: string;
  /** voertuigklasse-code; standaard 'executive-ev' */
  vehicleClass?: string;
  passengers?: number;
  luggage?: number;
  /** retourrit gevraagd? */
  returnTrip?: boolean;
  /**
   * Gepland vertrektijdstip als UTC ISO-8601-instant (zie
   * lib/pricing/departure-time.ts). Uitsluitend gebruikt voor traffic-aware
   * routing bij het afstand-tarief. Ontbreekt/verleden → noodwaarde nu + 1 min.
   */
  departureAt?: string;
  /**
   * INTERN. Standaard true. Op `false` slaat de service het afstand-tarief
   * (Google-routing) over en levert alleen een vaste route óf "offerte op
   * aanvraag". Gebruikt door de booking-tak ZONDER geldige prijs-snapshot: een
   * dynamische prijs mag daar nooit bindend worden en Google mag niet opnieuw
   * worden aangeroepen. De publieke quote-API zet dit nooit.
   */
  allowDistanceTariff?: boolean;
};

export type UnavailableReason =
  | "invalid_input"
  | "unknown_location"
  | "route_not_fixed"
  | "capacity_exceeded"
  | "data_unavailable";

/** Richting van de vlucht bij een luchthavenrit. */
export type FlightDirection = "arrival" | "departure";

/**
 * Luchthavencontext van een rit — DE ENIGE plek waar richting wordt bepaald.
 *
 * De quote-API, het boekingsformulier en de booking-route lezen allemaal dit
 * object. Geen van drieën leidt zelf iets af uit slugs of adresteksten; dan
 * ontstaan er drie definities die stilzwijgend uit elkaar lopen.
 *
 * Afgeleid van `locations.location_type`, niet van de slug — een naamconventie
 * is geen contract.
 */
export type AirportContext = {
  pickupIsAirport: boolean;
  dropoffIsAirport: boolean;
  /** Ophalen ván een luchthaven: aankomende vlucht, wachttijd vanaf de landing. */
  isAirportPickup: boolean;
  /** Brengen náár een luchthaven: vertrekkende vlucht. */
  isAirportDropoff: boolean;
  /** Eén van beide zijden is een luchthaven → vluchtnummer verplicht. */
  isAirportTransfer: boolean;
  /**
   * arrival wint van departure wanneer beide zijden een luchthaven zijn: bij een
   * transfer tussen luchthavens is de ophaling het operationeel bepalende deel,
   * want daar staat de chauffeur te wachten.
   */
  flightDirection: FlightDirection | null;
};

/** Geen luchthaven aan beide zijden — ook gebruikt als de locaties onbekend zijn. */
export const NO_AIRPORT: AirportContext = {
  pickupIsAirport: false,
  dropoffIsAirport: false,
  isAirportPickup: false,
  isAirportDropoff: false,
  isAirportTransfer: false,
  flightDirection: null,
};

/** Bepaalt de luchthavencontext uit twee (mogelijk onbekende) locaties. */
export function airportContext(
  pickup: { location_type: string | null } | null,
  dropoff: { location_type: string | null } | null
): AirportContext {
  const pickupIsAirport = pickup?.location_type === "airport";
  const dropoffIsAirport = dropoff?.location_type === "airport";
  return {
    pickupIsAirport,
    dropoffIsAirport,
    isAirportPickup: pickupIsAirport,
    isAirportDropoff: dropoffIsAirport,
    isAirportTransfer: pickupIsAirport || dropoffIsAirport,
    flightDirection: pickupIsAirport ? "arrival" : dropoffIsAirport ? "departure" : null,
  };
}

export type PricingQuoteResult =
  | {
      available: true;
      source: "fixed_route_prices" | "distance_tariff";
      /** toegepaste prijs (retour indien gevraagd én beschikbaar, anders enkel) */
      price: number;
      singlePrice: number;
      returnPrice: number | null;
      returnApplied: boolean;
      currency: "EUR";
      vatRate: number;
      distanceKm: number;
      estimatedDurationMin: number;
      vehicleClass: string;
      route: { pickupSlug: string; dropoffSlug: string; label: string | null };
      /** @deprecated gebruik `airport.isAirportTransfer` — blijft voor bestaande callers. */
      isAirportTransfer: boolean;
      airport: AirportContext;
      dataSource: "supabase" | "routing";
      /**
       * Manipulatie-bestendige vingerafdruk van de prijsbepalende invoer
       * (pickup/dropoff/klasse/retour). Wordt in de snapshot opgeslagen en bij het
       * bevestigen van de boeking opnieuw berekend en vergeleken. Zie quoteFingerprint.
       */
      fingerprint: string;
    }
  | {
      available: false;
      reason: UnavailableReason;
      /** klantzichtbare tekst — v1: altijd "Offerte op aanvraag" */
      message: string;
      /**
       * OOK bij een onbeschikbare offerte gevuld zodra de locaties herkend zijn.
       * Een rit vanaf Schiphol zonder vaste route is nog steeds een luchthavenrit:
       * het vluchtnummer blijft verplicht, anders kan de aankomst niet gevolgd worden.
       */
      airport: AirportContext;
    };

type LocationRow = Pick<
  Tables<"locations">,
  "id" | "slug" | "name" | "active" | "location_type" | "city_id"
>;
type VehicleClassRow = Pick<
  Tables<"vehicle_classes">,
  "id" | "code" | "max_passengers" | "max_luggage" | "active"
>;
type FixedRouteRow = Pick<
  Tables<"fixed_route_prices">,
  | "price"
  | "return_price"
  | "currency"
  | "distance_km"
  | "estimated_duration_min"
  | "vat_rate"
  | "source_label"
  | "valid_from"
  | "active"
>;

// ── Hulpfuncties ─────────────────────────────────────────────────────────────

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function unavailable(
  reason: UnavailableReason,
  airport: AirportContext = NO_AIRPORT
): PricingQuoteResult {
  return { available: false, reason, message: QUOTE_ON_REQUEST_MESSAGE, airport };
}

/**
 * Stabiele, manipulatie-bestendige vingerafdruk van de PRIJSBEPALENDE invoer:
 * genormaliseerde pickup, dropoff, voertuigklasse en enkel/retour. Wordt bij het
 * maken van de offerte in de snapshot opgeslagen en bij het bevestigen van de
 * boeking IDENTIEK herberekend uit de boekingsaanvraag. Verschilt de fingerprint,
 * dan hoort de snapshot niet bij deze rit → de boeking wordt geweigerd. Puur op de
 * ruwe invoer (zelfde bij preview en booking); geen locatie-resolutie nodig.
 */
export function quoteFingerprint(input: {
  pickup: string;
  dropoff: string;
  vehicleClass?: string;
  returnTrip?: boolean;
}): string {
  const pickup = slugify(input.pickup ?? "");
  const dropoff = slugify(input.dropoff ?? "");
  const cls = slugify(input.vehicleClass ?? DEFAULT_VEHICLE_CLASS) || DEFAULT_VEHICLE_CLASS;
  const ret = input.returnTrip === true ? "retour" : "enkel";
  return [pickup, dropoff, cls, ret].join("|");
}

// ── Publieke service ─────────────────────────────────────────────────────────

/**
 * Levert een prijsofferte voor een rit. In v1 uitsluitend voor vaste routes;
 * al het overige → "offerte op aanvraag". Loggt elke offerte (best-effort).
 */
export async function getPricingQuote(
  input: PricingQuoteInput
): Promise<PricingQuoteResult> {
  const { result, shadow } = await resolveQuote(input);
  // Loggen mag de offerte nooit blokkeren of laten falen.
  void logQuote(input, result, shadow).catch(() => {});
  return result;
}

/**
 * Reden waarom de deadhead-shadowberekening voor deze offerte is overgeslagen —
 * uitsluitend informatief voor de log; blokkeert de offerte normaliter nooit.
 *
 * `zone_lookup_unavailable` (2026-08-14, betrouwbaarheidshardening) is de ENE
 * uitzondering: config/allowlist/PDOK zijn allemaal onbeschikbaar (zelfs na de
 * ene retry) VOOR EEN MOGELIJK Eindhoven/Roermond-bestemming — zie
 * `couldPlausiblyBeInZone`. Dan wordt de hele offerte "onzeker" en NIET
 * teruggezet op de lagere basisprijs; de log registreert dat via deze reden,
 * `tryDistanceTariff` geeft `null` terug (→ "Offerte op aanvraag").
 */
type ShadowSkipReason =
  | "missing_config"
  | "load_error"
  | "timeout"
  | "no_service_role_client"
  | "zone_lookup_unavailable";

/**
 * Bovengrens op de tijd die ÉÉN poging van de shadow-berekening (config +
 * high-demand-zones + zone-allowlist laden) aan de offerte mag toevoegen.
 * SHADOW-ONLY: dit begrenst uitsluitend hoelang er per poging op de
 * config/zones gewacht wordt — geen onbeperkt wachten, ook niet bij een
 * tragere of hangende dependency. Bij overschrijding van BEIDE pogingen
 * (zie SHADOW_LOAD_RETRY_TIMEOUT_MS/withRetryOnce) wordt de berekening
 * overgeslagen; de offerte gaat in de meeste gevallen gewoon door met de
 * basisprijs (zie ShadowSkipReason hierboven voor de ene uitzondering).
 */
export const SHADOW_LOAD_TIMEOUT_MS = 400;

/**
 * Budget voor de ENE gerichte retry na een mislukte/trage eerste poging
 * (2026-08-14). Een cold-start-vertraagde eerste query is typisch eenmalig —
 * dezelfde dependency, opnieuw aangeroepen, is op een net-opgestarte
 * serverinstance doorgaans al snel. Aparte, iets ruimere marge dan de eerste
 * poging, zodat een structureel trage/uitgevallen dependency niet eindeloos
 * méér tijd krijgt dan nodig — dit is een POGING, geen tweede volledige
 * wachttijd "voor de zekerheid".
 */
export const SHADOW_LOAD_RETRY_TIMEOUT_MS = 400;

/** Zelfde retry-budget voor de PDOK-woonplaatslookup (los van de Supabase-batch hierboven). */
export const PDOK_ZONE_LOOKUP_RETRY_TIMEOUT_MS = PDOK_ZONE_LOOKUP_TIMEOUT_MS;

/**
 * Uitsluitend een VEILIGHEIDSNET (2026-08-14): de productie-deps begrenzen
 * zichzelf al (withRetryOnce, hierboven), maar een test- of toekomstige
 * aanroeper die dat patroon niet gebruikt mag nooit onbeperkt kunnen laten
 * hangen. Ruim boven het productie-worstcase (2× SHADOW_LOAD_(RETRY_)TIMEOUT_MS
 * = 800ms) zodat een legitieme retry hier nooit doorheen gesneden wordt.
 */
export const SHADOW_LOAD_OUTER_TIMEOUT_MS = 900;

/** Zelfde veiligheidsnet-redenering voor de PDOK-zonepromotiestap (productie-worstcase 1000ms). */
export const PDOK_ZONE_LOOKUP_OUTER_TIMEOUT_MS = 1100;

class ShadowTimeoutError extends Error {}

/**
 * `pricing_deadhead_config`/`pricing_high_demand_zones` zijn RLS-only zonder
 * publieke policy — de anon-key read-client ziet daar altijd 0 rijen. Deze
 * fout markeert specifiek "geen service-role-client beschikbaar" (ontbrekende
 * SUPABASE_SERVICE_ROLE_KEY), los van een echte queryfout of timeout, zodat de
 * skip-reden in de log diagnosticeerbaar blijft.
 */
export class NoServiceRoleClientError extends Error {}

/** Race tegen een timeout — verwerpt met ShadowTimeoutError zonder de onderliggende promise af te breken. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ShadowTimeoutError(`shadow load exceeded ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Precies ÉÉN gerichte retry (2026-08-14): probeert `load()` opnieuw — een
 * NIEUWE aanroep, niet dezelfde hangende promise opnieuw afwachten — als de
 * eerste poging faalt of `timeoutMs` overschrijdt. De tweede poging krijgt
 * `retryTimeoutMs`. Faalt ook die, dan wordt de LAATSTE fout doorgegeven.
 * Geen onbeperkte retries, geen backoff-lus — exact twee pogingen, altijd
 * begrensd.
 */
export async function withRetryOnce<T>(load: () => Promise<T>, timeoutMs: number, retryTimeoutMs: number): Promise<T> {
  try {
    return await withTimeout(load(), timeoutMs);
  } catch {
    return await withTimeout(load(), retryTimeoutMs);
  }
}

/**
 * Korte-TTL, server-side (module-scope, NOOIT client-side) cache met
 * in-flight-deduplicatie (2026-08-14). Voorkomt twee dingen tegelijk:
 *  1. Herhaalde Supabase-round-trips voor configuratie die zelden verandert
 *     (elke warme aanroep binnen de TTL gebruikt het gecachete resultaat).
 *  2. Een "thundering herd" bij een cold start: meerdere gelijktijdige
 *     offertes op een net-opgestarte instance delen ÉÉN onderliggende load
 *     (`inFlight`) in plaats van elk hun eigen trage aanroep te starten.
 * Een MISLUKTE load wordt NOOIT gecachet (anders zou een tijdelijke storing
 * voor de volledige TTL blijven hangen) — de eerstvolgende aanroep na een
 * mislukking probeert gewoon opnieuw.
 */
export function cachedLoader<T>(ttlMs: number, load: () => Promise<T>): () => Promise<T> {
  let cached: { value: T; expiresAt: number } | null = null;
  let inFlight: Promise<T> | null = null;
  return function loadCached(): Promise<T> {
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
    if (inFlight) return inFlight;
    const attempt = load();
    inFlight = attempt
      .then((value) => {
        cached = { value, expiresAt: Date.now() + ttlMs };
        return value;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };
}

/**
 * Wat er in `pricing_quote_logs.price_breakdown` terechtkomt. Bij een geslaagde
 * berekening de volledige deadhead-uitkomst; anders een expliciete skip-reden.
 * `null` betekent: deze offerte ging niet via het afstand-tarief (bv. vaste
 * route of "offerte op aanvraag") — dan is er niets om te loggen.
 *
 * `basePrice`/`finalPrice`/`applied` staan op BEIDE varianten: ook bij een
 * skip is precies zichtbaar dat `finalPrice === basePrice` (fail-closed) en
 * waarom. `applied` is uitsluitend `true` wanneer `finalPrice` daadwerkelijk
 * de deadhead-aangepaste `shadowPrice` is — nooit bij `candidateShadowPrice`
 * (die hoort uitsluitend bij classification "unknown" en is per ontwerp nooit
 * `eligibleForActivation`).
 *
 * `zoneEligible` (2026-08-13, hotfix): `classification==='peripheral'` +
 * `eligibleForActivation` ALLEEN is niet langer voldoende om `applied:true`
 * te worden — de bestemming moet bovendien `dropoff.city_id` hebben dat in de
 * expliciete `pricing_deadhead_eligible_zones`-allowlist staat (server-side,
 * datagedreven — zie loadDeadheadZoneAllowlist). Dit voorkomt dat elke
 * willekeurige, al herkenbare stad >80 km buiten high-demand ongewild
 * activeert.
 *
 * Een `shadowSkipped`-entry met `reason:"zone_lookup_unavailable"`
 * (2026-08-14) betekent NIET "offerte ging door met de basisprijs" zoals de
 * andere skip-redenen — die specifieke reden hoort altijd samen met een
 * `unavailable("route_not_fixed")`-resultaat (zie resolveDeadheadPricing).
 */
export type ShadowLogEntry =
  | (ShadowDeadheadResult & { applied: boolean; basePrice: number; finalPrice: number; zoneEligible: boolean })
  | { shadowSkipped: true; reason: ShadowSkipReason; basePrice: number; finalPrice: number };

/** Set van locatie-ids resp. stad-ids die als "high-demand" (nooit perifeer) gelden. */
export type HighDemandZoneIds = {
  locationIds: ReadonlySet<string>;
  cityIds: ReadonlySet<string>;
};

/**
 * Injecteerbare afhankelijkheden van de kern-resolver. Default (productie) is de
 * echte Supabase-read + Google Directions; tests leveren fakes zodat de
 * beslislogica — vaste route leidend, afstand-fallback, retour, offerte-op-aanvraag
 * — zonder database of netwerk bewijsbaar is.
 */
export type ResolveQuoteDeps = {
  findLocation: (raw: string) => Promise<LocationRow | null>;
  findVehicleClass: (code: string) => Promise<VehicleClassRow | null>;
  findFixedRoute: (
    pickupId: string,
    dropoffId: string,
    vehicleClassId: string
  ) => Promise<FixedRouteRow | null>;
  getRoute: (
    origin: string,
    destination: string,
    departureAt?: string
  ) => Promise<DrivingRoute | null>;
  /**
   * SHADOW-ONLY (geen invloed op `price`). Levert de enige actieve
   * deadhead-config, of `null` als die ontbreekt (of onverhoopt niet eenduidig
   * is) — dan wordt de shadow-berekening overgeslagen, nooit de offerte.
   * Optioneel: ontbreekt deze dep, dan wordt de shadow-berekening overgeslagen.
   */
  loadDeadheadConfig?: () => Promise<DeadheadConfig | null>;
  /** SHADOW-ONLY. Geconfigureerde high-demand-bestemmingen (nooit "perifeer"). */
  loadHighDemandZones?: () => Promise<HighDemandZoneIds>;
  /**
   * Expliciete allowlist van stad-ids waarbinnen deadhead-activering is
   * toegestaan, plus de officiële-woonplaats → city_id map voor dezelfde
   * actieve zones (2026-08-13/14, city-wide zonefix — één query, zie
   * loadDeadheadZoneAllowlist). Ontbreekt deze dep, dan wordt NOOIT
   * geactiveerd (fail-closed) — `classification==='peripheral'` alleen is
   * nooit voldoende. Faalt de load (i.p.v. gewoon ontbrekend) voor een
   * mogelijk Eindhoven/Roermond-bestemming, dan wordt de HELE offerte
   * onzeker (zie couldPlausiblyBeInZone) — nooit stilzwijgend de basisprijs.
   */
  loadDeadheadZoneAllowlist?: () => Promise<DeadheadZoneAllowlist>;
  /**
   * SHADOW-ONLY: PDOK-woonplaatslookup voor een onopgeloste, lange
   * bestemming (2026-08-14). `null` = geslaagd, geen relevant document (zekere
   * "geen match"). Een throw = de lookup zelf is mislukt/timed out — dat is
   * NIET hetzelfde als "geen match" en kan de offerte onzeker maken voor een
   * mogelijk Eindhoven/Roermond-bestemming (zie couldPlausiblyBeInZone).
   * Ontbreekt deze dep, dan wordt een onopgeloste bestemming nooit gepromoveerd
   * — exact het gedrag van vóór deze hotfix. Nooit gebruikt voor een bekende,
   * al-opgeloste `LocationRow` (die blijft leidend).
   */
  lookupOfficialWoonplaats?: (address: string) => Promise<string | null>;
  /**
   * SHADOW-ONLY, best-effort side-channel: registreert de shadow-uitkomst van
   * deze offerte voor de caller (resolveQuote → logQuote). Geen effect op
   * `price` of op het geretourneerde PricingQuoteResult.
   */
  recordShadow?: (entry: ShadowLogEntry) => void;
};

/**
 * Korte TTL: deze configuratie verandert in de praktijk hoogstens een paar
 * keer per jaar (nieuwe/aangepaste zone, ander deadhead-percentage) — 60s is
 * ruim genoeg om cold-start-round-trips te vermijden op een warme instance,
 * en kort genoeg dat een wijziging binnen een minuut overal zichtbaar is.
 * Puur server-side (module-scope in dit bestand); nooit naar de client
 * gestuurd, nooit route-/klantgegevens erin (zie DeadheadConfig/HighDemand-
 * ZoneIds/DeadheadZoneAllowlist — geen van drieën bevat iets adres- of
 * persoonsgebonden).
 */
const SHADOW_CONFIG_CACHE_TTL_MS = 60_000;

/**
 * Module-scope gecachete + retryende loaders (2026-08-14). Gedefinieerd
 * vóór hun eerste gebruik in resolveQuote() hieronder, maar ná de
 * onderliggende `loadDeadheadConfig`/`loadHighDemandZones`/
 * `loadDeadheadZoneAllowlist`-functiedeclaraties verderop in dit bestand —
 * dat werkt omdat `function`-declaraties gehoist worden. `createPricingLogClient()`
 * wordt bewust ELKE poging opnieuw aangeroepen (goedkoop, synchroon) in plaats
 * van ook de client zelf te cachen — alleen het QUERYRESULTAAT wordt gecachet.
 */
const cachedLoadDeadheadConfig = cachedLoader(SHADOW_CONFIG_CACHE_TTL_MS, () =>
  withRetryOnce(
    () => {
      const client = createPricingLogClient();
      if (!client) return Promise.reject(new NoServiceRoleClientError());
      return loadDeadheadConfig(client);
    },
    SHADOW_LOAD_TIMEOUT_MS,
    SHADOW_LOAD_RETRY_TIMEOUT_MS
  )
);

const cachedLoadHighDemandZones = cachedLoader(SHADOW_CONFIG_CACHE_TTL_MS, () =>
  withRetryOnce(
    () => {
      const client = createPricingLogClient();
      if (!client) return Promise.reject(new NoServiceRoleClientError());
      return loadHighDemandZones(client);
    },
    SHADOW_LOAD_TIMEOUT_MS,
    SHADOW_LOAD_RETRY_TIMEOUT_MS
  )
);

const cachedLoadDeadheadZoneAllowlist = cachedLoader(SHADOW_CONFIG_CACHE_TTL_MS, () =>
  withRetryOnce(
    () => {
      const client = createPricingLogClient();
      if (!client) return Promise.reject(new NoServiceRoleClientError());
      return loadDeadheadZoneAllowlist(client);
    },
    SHADOW_LOAD_TIMEOUT_MS,
    SHADOW_LOAD_RETRY_TIMEOUT_MS
  )
);

/**
 * PDOK-lookup met precies één retry (2026-08-14) — NIET gecached (hoge
 * cardinaliteit, per-adres; caching zou nauwelijks hits opleveren en zou een
 * adres-sleutel vereisen, wat dichter bij "routegegevens bewaren" komt dan
 * gewenst voor een cache die uitsluitend bedoeld is voor zelden-veranderende
 * configuratie).
 */
function retryingLookupOfficialWoonplaats(address: string): Promise<string | null> {
  return withRetryOnce(
    () => pdokLookupOfficialWoonplaats(address),
    PDOK_ZONE_LOOKUP_TIMEOUT_MS,
    PDOK_ZONE_LOOKUP_RETRY_TIMEOUT_MS
  );
}

async function resolveQuote(
  input: PricingQuoteInput
): Promise<{ result: PricingQuoteResult; shadow: ShadowLogEntry | null }> {
  const supabase = createPricingReadClient();
  if (!supabase) return { result: unavailable("data_unavailable"), shadow: null };

  let shadow: ShadowLogEntry | null = null;
  const deps: ResolveQuoteDeps = {
    findLocation: (raw) => findLocation(supabase, raw),
    findVehicleClass: (code) => findVehicleClass(supabase, code),
    findFixedRoute: (pickupId, dropoffId, vehicleClassId) =>
      findFixedRoute(supabase, pickupId, dropoffId, vehicleClassId),
    getRoute: getDrivingRoute,
    // SHADOW-ONLY, service-role-only tabellen (pricing_deadhead_config/
    // pricing_high_demand_zones/pricing_deadhead_eligible_zones zijn RLS-only
    // zonder publieke policy — de anon-key `supabase` hierboven ziet daar
    // altijd 0 rijen): elk begrensd, gecached en één keer geretried, zie
    // cachedLoadDeadheadConfig/cachedLoadHighDemandZones/
    // cachedLoadDeadheadZoneAllowlist hierboven. De publieke referentietabellen
    // (locations/vehicle_classes/fixed_route_prices) blijven op de anon-key
    // read-client — geen ongemerkt bredere verhoogde toegang.
    loadDeadheadConfig: cachedLoadDeadheadConfig,
    loadHighDemandZones: cachedLoadHighDemandZones,
    loadDeadheadZoneAllowlist: cachedLoadDeadheadZoneAllowlist,
    lookupOfficialWoonplaats: retryingLookupOfficialWoonplaats,
    recordShadow: (entry) => {
      shadow = entry;
    },
  };
  const result = await resolveQuoteWith(input, deps);
  return { result, shadow };
}

/**
 * Kern-resolver met injecteerbare afhankelijkheden (zie ResolveQuoteDeps).
 * Geëxporteerd voor tests; productie loopt via resolveQuote/getPricingQuote.
 */
export async function resolveQuoteWith(
  input: PricingQuoteInput,
  deps: ResolveQuoteDeps
): Promise<PricingQuoteResult> {
  const pickupRaw = (input.pickup ?? "").trim();
  const dropoffRaw = (input.dropoff ?? "").trim();
  if (!pickupRaw || !dropoffRaw) return unavailable("invalid_input");

  const classCode = slugify(input.vehicleClass ?? DEFAULT_VEHICLE_CLASS) || DEFAULT_VEHICLE_CLASS;

  let pickup: LocationRow | null;
  let dropoff: LocationRow | null;
  let vehicleClass: VehicleClassRow | null;
  try {
    [pickup, dropoff, vehicleClass] = await Promise.all([
      deps.findLocation(pickupRaw),
      deps.findLocation(dropoffRaw),
      deps.findVehicleClass(classCode),
    ]);
  } catch {
    return unavailable("data_unavailable");
  }

  // Best-effort luchthavencontext — airportContext is null-veilig. Ook zonder vaste
  // route (of zonder herkende locatie) blijft een Schiphol-rit een luchthavenrit
  // met vluchtnummerplicht.
  const airport = airportContext(pickup, dropoff);

  // Capaciteitscontrole (zacht): alleen hard toetsen als de klasse bekend is.
  const passengers = input.passengers ?? 1;
  const luggage = input.luggage ?? 0;
  if (
    vehicleClass &&
    (passengers > vehicleClass.max_passengers || luggage > vehicleClass.max_luggage)
  ) {
    return unavailable("capacity_exceeded", airport);
  }

  // 1. Vaste route = bron van waarheid (alleen als beide locaties én klasse bekend zijn).
  if (pickup && dropoff && vehicleClass) {
    let fixed: FixedRouteRow | null;
    try {
      fixed = await deps.findFixedRoute(pickup.id, dropoff.id, vehicleClass.id);
    } catch {
      return unavailable("data_unavailable", airport);
    }

    if (fixed) {
      const wantReturn = input.returnTrip === true;
      const returnPrice = fixed.return_price ?? null;
      const returnApplied = wantReturn && returnPrice !== null;
      const price = returnApplied ? (returnPrice as number) : fixed.price;

      return {
        available: true,
        source: "fixed_route_prices",
        price,
        singlePrice: fixed.price,
        returnPrice,
        returnApplied,
        currency: "EUR",
        vatRate: fixed.vat_rate,
        distanceKm: fixed.distance_km,
        estimatedDurationMin: fixed.estimated_duration_min,
        vehicleClass: vehicleClass.code,
        route: {
          pickupSlug: pickup.slug,
          dropoffSlug: dropoff.slug,
          label: fixed.source_label,
        },
        isAirportTransfer: airport.isAirportTransfer,
        airport,
        dataSource: "supabase",
        fingerprint: quoteFingerprint(input),
      };
    }
  }

  // 2. Geen vaste route → afstand-tarief (bindende prijs) mits de routing-API een
  //    echte rij-afstand levert. Werkt óók voor vrije adressen die niet in
  //    `locations` staan; Google Directions accepteert vrije-tekstadressen.
  //
  //    OVERSLAAN wanneer allowDistanceTariff === false: de booking-tak zonder
  //    geldige prijs-snapshot mag geen dynamische prijs binden en Google niet
  //    opnieuw aanroepen. Dan valt de rit terug op "offerte op aanvraag".
  if (input.allowDistanceTariff !== false) {
    const byDistance = await tryDistanceTariff(
      deps,
      input,
      pickupRaw,
      dropoffRaw,
      classCode,
      pickup,
      dropoff,
      vehicleClass,
      airport
    );
    if (byDistance) return byDistance;
  }

  // 3. Niets bruikbaars → offerte op aanvraag. De reden hangt af van wat ontbrak.
  if (!pickup || !dropoff || !vehicleClass) return unavailable("unknown_location", airport);
  return unavailable("route_not_fixed", airport);
}

/**
 * Afstand-tarief fallback (BINDENDE prijs). Vraagt de werkelijke rij-afstand +
 * rijtijd op bij de routing-API en rekent die door met het door de eigenaar
 * goedgekeurde cost-plus-tarief (distance-tariff.ts). Retourneert `null` als de
 * routing niets bruikbaars oplevert (geen key, fout, of onbekende route) — de
 * caller valt dan terug op "offerte op aanvraag".
 *
 * Retour = 2× de enkele rit. Operationeel is een retour twee ritten; dit is een
 * bewuste, door de eigenaar aanpasbare aanname. Er wordt hier GEEN retour-
 * kortingsbeleid verzonnen.
 */
async function tryDistanceTariff(
  deps: ResolveQuoteDeps,
  input: PricingQuoteInput,
  pickupRaw: string,
  dropoffRaw: string,
  classCode: string,
  pickup: LocationRow | null,
  dropoff: LocationRow | null,
  vehicleClass: VehicleClassRow | null,
  airport: AirportContext
): Promise<PricingQuoteResult | null> {
  const route = await deps.getRoute(pickupRaw, dropoffRaw, input.departureAt);
  if (!route) return null;

  // Basisprijs — ALTIJD berekend uit de enkele-reisafstand (route.distanceKm/
  // durationMin komen rechtstreeks van Google, nooit al verdubbeld voor een
  // retour). Dit blijft de bindende prijs zodra deadhead niet van toepassing
  // is of de berekening om welke reden dan ook faalt (fail-closed).
  const basePrice = priceFromDistance(route.distanceKm, route.durationMin);

  // Deadhead-model: past de enkele-reisprijs uitsluitend aan wanneer de
  // bestaande, ongewijzigde classificatie/berekening `eligibleForActivation`
  // + een geldige `shadowPrice` oplevert. `single` wordt hier ÉÉN keer bepaald
  // en pas daarna (hieronder) x2 voor een retour — exact hetzelfde
  // vermenigvuldigingspatroon als de bestaande retourprijs altijd al had, dus
  // geen dubbele toeslag: de retourrit is en blijft "2× de (eventueel
  // deadhead-aangepaste) enkele prijs", nooit een aparte tweede berekening.
  //
  // `indeterminate` (2026-08-14, betrouwbaarheidshardening): de zonestatus van
  // een MOGELIJK Eindhoven/Roermond-bestemming kon niet betrouwbaar worden
  // vastgesteld (config/allowlist/PDOK allemaal onbeschikbaar, zelfs na retry).
  // Dan wordt deze rit NOOIT bindend tegen de basisprijs verkocht — de hele
  // offerte valt terug op "Offerte op aanvraag" via de bestaande, ongewijzigde
  // unavailable-plumbing in resolveQuoteWith (geen aparte snapshot-/
  // boekingscode nodig: die loopt uitsluitend bij `available === true`).
  const outcome = await resolveDeadheadPricing(deps, dropoff, dropoffRaw, route.distanceKm, route.durationMin, basePrice);
  if ("indeterminate" in outcome) return null;
  const single = outcome.price;

  const returnPrice = single * 2;
  const returnApplied = input.returnTrip === true;
  const price = returnApplied ? returnPrice : single;

  return {
    available: true,
    source: "distance_tariff",
    price,
    singlePrice: single,
    returnPrice,
    returnApplied,
    currency: "EUR",
    vatRate: DEFAULT_DISTANCE_TARIFF.vatRate,
    distanceKm: route.distanceKm,
    estimatedDurationMin: route.durationMin,
    vehicleClass: vehicleClass?.code ?? classCode,
    route: {
      pickupSlug: pickup?.slug ?? slugify(pickupRaw),
      dropoffSlug: dropoff?.slug ?? slugify(dropoffRaw),
      label: null,
    },
    isAirportTransfer: airport.isAirportTransfer,
    airport,
    dataSource: "routing",
    fingerprint: quoteFingerprint(input),
  };
}

/** Uitkomst van resolveDeadheadPricing — zie de indeterminate-toelichting bij de aanroep in tryDistanceTariff. */
type DeadheadPricingOutcome = { price: number } | { indeterminate: true };

/**
 * Bepaalt de daadwerkelijk toe te passen enkele-reisprijs. Roept de bestaande,
 * ongewijzigde classificatie/berekening aan (`classifyDestination` +
 * `computeShadowDeadhead`) en past `shadowPrice` uitsluitend toe wanneer
 * `eligibleForActivation === true`, `shadowPrice` een geldig, positief getal
 * is, ÉN de bestemming (`dropoff.city_id`) in de expliciete
 * deadhead-eligible-zone-allowlist staat (2026-08-13, hotfix — zie
 * loadDeadheadZoneAllowlist). `classification==='peripheral'` alleen is dus
 * NOOIT meer voldoende: een reeds herkenbare, willekeurige stad >80 km buiten
 * high-demand die niet expliciet in de allowlist staat, activeert niet.
 *
 * In de meeste storingsgevallen — "unknown" (waar nooit `candidateShadowPrice`
 * wordt gebruikt), niet-toegestane zone, ontbrekende service-role-client,
 * queryfout of timeout ná de ene retry — blijft `{price: basePrice}` de
 * bindende uitkomst. UITZONDERING (2026-08-14): faalt de zone-autoriteit
 * (config/allowlist/PDOK) structureel VOOR EEN MOGELIJK Eindhoven/Roermond-
 * bestemming (zie couldPlausiblyBeInZone), dan is de uitkomst
 * `{indeterminate: true}` — de caller MAG dan nooit de basisprijs binden.
 */
async function resolveDeadheadPricing(
  deps: ResolveQuoteDeps,
  dropoff: LocationRow | null,
  dropoffRaw: string,
  distanceKm: number,
  durationMin: number,
  basePrice: number
): Promise<DeadheadPricingOutcome> {
  const log = (entry: ShadowLogEntry) => deps.recordShadow?.(entry);
  const dropoffForPlausibility = dropoff ? { city_id: dropoff.city_id } : null;

  if (!deps.loadDeadheadConfig || !deps.loadHighDemandZones || !deps.loadDeadheadZoneAllowlist) {
    return { price: basePrice };
  }

  let config: DeadheadConfig | null;
  let zones: HighDemandZoneIds;
  let allowlist: DeadheadZoneAllowlist;
  try {
    // Parallel laden (geen serieel wachten), begrensd door
    // SHADOW_LOAD_OUTER_TIMEOUT_MS als uiterst veiligheidsnet — de productie-
    // deps begrenzen (en retryen) zichzelf al ruim binnen dat net, zie
    // cachedLoadDeadheadConfig/cachedLoadHighDemandZones/
    // cachedLoadDeadheadZoneAllowlist. De externe PDOK-lookup hieronder loopt
    // bewust NIET in dezelfde Promise.all: apart systeem, eigen begrenzing.
    [config, zones, allowlist] = await withTimeout(
      Promise.all([deps.loadDeadheadConfig(), deps.loadHighDemandZones(), deps.loadDeadheadZoneAllowlist()]),
      SHADOW_LOAD_OUTER_TIMEOUT_MS
    );
  } catch (e) {
    // De zone-autoriteit zelf is onbereikbaar (zelfs na de ingebouwde retry).
    // Voor een bestemming die aantoonbaar NIET Eindhoven/Roermond zou kunnen
    // zijn (of te kort voor de drempel) blijft de basisprijs veilig — die
    // bestemming zou toch nooit geactiveerd hebben. Voor een MOGELIJKE
    // Eindhoven/Roermond-bestemming (couldPlausiblyBeInZone) mag deze
    // onzekerheid nooit stilzwijgend de lage basisprijs opleveren.
    const reason: ShadowSkipReason =
      e instanceof ShadowTimeoutError ? "timeout" : e instanceof NoServiceRoleClientError ? "no_service_role_client" : "load_error";
    if (
      couldPlausiblyBeInZone(dropoffForPlausibility, dropoffRaw) &&
      distanceKm > PLAUSIBLE_ZONE_MIN_DISTANCE_KM_FLOOR
    ) {
      log({ shadowSkipped: true, reason: "zone_lookup_unavailable", basePrice, finalPrice: basePrice });
      return { indeterminate: true };
    }
    log({ shadowSkipped: true, reason, basePrice, finalPrice: basePrice });
    return { price: basePrice };
  }

  if (!config) {
    // Expliciet 0 (of >1, defensief) actieve configrijen — een bewuste,
    // operationele "uitgeschakeld"-toestand, geen storing. Blijft altijd
    // gewoon de basisprijs, nooit indeterminate.
    log({ shadowSkipped: true, reason: "missing_config", basePrice, finalPrice: basePrice });
    return { price: basePrice };
  }

  // Zone-promotie (hotfix 2026-08-14, city-wide economische zones): een
  // ONOPGELOSTE, lange bestemming krijgt een kans om via de OFFICIËLE
  // PDOK-woonplaats alsnog aan Eindhoven/Roermond gekoppeld te worden.
  // Uitsluitend wanneer er nog geen bekende LocationRow is (die blijft altijd
  // leidend — geen dubbele lookup voor Eindhoven Airport/Designer Outlet
  // Roermond) EN de afstand de (nu bekende, echte) drempel al haalt.
  let effectiveDropoff: { id: string; city_id: string | null } | null = dropoff
    ? { id: dropoff.id, city_id: dropoff.city_id }
    : null;
  if (!effectiveDropoff && distanceKm > config.minDistanceKm && deps.lookupOfficialWoonplaats) {
    const zoneLookup = await resolveZoneCityIdForRawDropoff(
      dropoffRaw,
      deps.lookupOfficialWoonplaats,
      allowlist.byOfficialWoonplaats
    );
    if (zoneLookup.cityId) {
      effectiveDropoff = { id: `zone:${zoneLookup.cityId}`, city_id: zoneLookup.cityId };
    } else if (zoneLookup.liveLookupFailed && couldPlausiblyBeInZone(dropoffForPlausibility, dropoffRaw)) {
      // PDOK zelf onbereikbaar (niet: "succesvol geen match") vóór een
      // adres dat plausibel Eindhoven/Roermond zou kunnen zijn — onzeker,
      // nooit stilzwijgend de basisprijs.
      log({ shadowSkipped: true, reason: "zone_lookup_unavailable", basePrice, finalPrice: basePrice });
      return { indeterminate: true };
    }
  }

  const classification = classifyDestination({
    dropoff: effectiveDropoff,
    highDemandLocationIds: zones.locationIds,
    highDemandCityIds: zones.cityIds,
  });
  const result = computeShadowDeadhead({ distanceKm, durationMin, classification, config });

  const zoneEligible = Boolean(effectiveDropoff?.city_id && allowlist.cityIds.has(effectiveDropoff.city_id));
  const applied =
    result.eligibleForActivation &&
    zoneEligible &&
    typeof result.shadowPrice === "number" &&
    Number.isFinite(result.shadowPrice) &&
    result.shadowPrice > 0;
  const finalPrice = applied ? (result.shadowPrice as number) : basePrice;

  log({ ...result, applied, basePrice, finalPrice, zoneEligible });
  return { price: finalPrice };
}

/** Uitkomst van de PDOK-zonepromotiepoging — onderscheidt "geen match" van "lookup zelf mislukt". */
type ZoneLookupOutcome = { cityId: string | null; liveLookupFailed: boolean };

/**
 * Probeert eerst de live, officiële PDOK-woonplaats voor het ruwe
 * dropoff-adres (begrensd door PDOK_ZONE_LOOKUP_OUTER_TIMEOUT_MS —
 * veiligheidsnet, productie-deps retryen al zelf); levert die geen match op
 * (PDOK zelf succesvol, gewoon een andere plaats), dan de smalle, individueel
 * geverifieerde postcode4-fallback. `liveLookupFailed` onderscheidt "de live
 * aanroep zelf is mislukt/timed out" van "PDOK antwoordde prima, gewoon geen
 * relevant document" — dat verschil bepaalt of de caller mag terugvallen op
 * de basisprijs of de offerte onzeker moet maken.
 */
async function resolveZoneCityIdForRawDropoff(
  dropoffRaw: string,
  lookupOfficialWoonplaats: (address: string) => Promise<string | null>,
  cityIdByWoonplaats: ReadonlyMap<string, string>
): Promise<ZoneLookupOutcome> {
  let woonplaats: string | null = null;
  let liveLookupFailed = false;
  try {
    woonplaats = await withTimeout(lookupOfficialWoonplaats(dropoffRaw), PDOK_ZONE_LOOKUP_OUTER_TIMEOUT_MS);
  } catch {
    liveLookupFailed = true;
  }
  if (woonplaats) {
    const zoneCityId = resolveZoneCityIdFromWoonplaats(woonplaats, cityIdByWoonplaats);
    if (zoneCityId) return { cityId: zoneCityId, liveLookupFailed: false };
  }
  const fallbackCityId = resolveZoneCityIdFromPostcode4Fallback(dropoffRaw, cityIdByWoonplaats);
  return { cityId: fallbackCityId, liveLookupFailed };
}

// ── Locatie-/klasse-resolutie ────────────────────────────────────────────────

/** Zoekt één actieve locatie op exacte slug. */
async function locationBySlug(
  supabase: PricingSupabaseClient,
  slug: string
): Promise<LocationRow | null> {
  const res = await supabase
    .from("locations")
    .select("id, slug, name, active, location_type, city_id")
    .eq("active", true)
    .eq("slug", slug)
    .limit(1)
    .maybeSingle();
  if (res.error) throw res.error;
  return res.data ?? null;
}

/**
 * Vindt een actieve locatie. Volgorde (Stap 10l):
 *
 *   1. EXACTE SLUG  — `slugify(raw)` tegen public.locations. Bestaat de locatie
 *      letterlijk, dan wint die ALTIJD. Een alias mag dit nooit overschrijven.
 *   2. WIJK/STAD    — alias-resolutie van een vrij (straat)adres via postcode of
 *      trefwoord; wijkregels vóór stadsfallback (zie location-aliases.ts).
 *   3. NAAM         — case-insensitieve naammatch, alleen als er geen alias was.
 *
 * Vóór 10l draaide stap 2 als eerste. Daardoor werd `rotterdam-kralingen`
 * teruggebracht naar `rotterdam` en rekende de quote de stadsprijs, terwijl de
 * tarievenpagina de wijkprijs toonde. Die volgorde is nu omgekeerd.
 */
async function findLocation(
  supabase: PricingSupabaseClient,
  raw: string
): Promise<LocationRow | null> {
  // 1. exacte slug — heeft altijd voorrang op alias-resolutie
  const exactSlug = slugify(raw);
  if (exactSlug) {
    const exact = await locationBySlug(supabase, exactSlug);
    if (exact) return exact;
  }

  // 2. alias-resolutie: wijk eerst, stad als fallback
  const alias = resolveLocationSlug(raw);
  if (alias) {
    return await locationBySlug(supabase, alias);
  }

  // 3. naam case-insensitive — alleen zinvol zonder alias
  const byName = await supabase
    .from("locations")
    .select("id, slug, name, active, location_type, city_id")
    .eq("active", true)
    .ilike("name", raw)
    .limit(1)
    .maybeSingle();
  if (byName.error) throw byName.error;
  return byName.data ?? null;
}

async function findVehicleClass(
  supabase: PricingSupabaseClient,
  code: string
): Promise<VehicleClassRow | null> {
  const res = await supabase
    .from("vehicle_classes")
    .select("id, code, max_passengers, max_luggage, active")
    .eq("active", true)
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  if (res.error) throw res.error;
  return res.data ?? null;
}

/** Meest recente actieve vaste routeprijs voor pickup→dropoff in deze klasse. */
async function findFixedRoute(
  supabase: PricingSupabaseClient,
  pickupId: string,
  dropoffId: string,
  vehicleClassId: string
): Promise<FixedRouteRow | null> {
  const res = await supabase
    .from("fixed_route_prices")
    .select(
      "price, return_price, currency, distance_km, estimated_duration_min, vat_rate, source_label, valid_from, active"
    )
    .eq("active", true)
    .eq("pickup_location_id", pickupId)
    .eq("dropoff_location_id", dropoffId)
    .eq("vehicle_class_id", vehicleClassId)
    .order("valid_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (res.error) throw res.error;
  return res.data ?? null;
}

// ── Deadhead-shadow config (SHADOW-ONLY) ─────────────────────────────────────

/**
 * Enige actieve deadhead-config. `null` bij nul rijen — of, verdediging-in-
 * diepte, bij onverhoopt meer dan één rij (mag niet gebeuren dankzij de
 * database-side partial unique index, maar deze leescode gaat er niet blind
 * van uit). Bij `null` slaat de caller de shadow-berekening over.
 */
export async function loadDeadheadConfig(supabase: PricingSupabaseClient): Promise<DeadheadConfig | null> {
  const res = await supabase
    .from("pricing_deadhead_config")
    .select("min_distance_km, deadhead_factor, max_deadhead_km")
    .eq("active", true)
    .limit(2);
  if (res.error) throw res.error;
  const rows = res.data ?? [];
  if (rows.length !== 1) return null;
  const row = rows[0]!;
  return {
    minDistanceKm: row.min_distance_km,
    deadheadFactor: row.deadhead_factor,
    maxDeadheadKm: row.max_deadhead_km,
  };
}

/** Geconfigureerde high-demand-bestemmingen (nooit "perifeer"), als id-sets. */
export async function loadHighDemandZones(supabase: PricingSupabaseClient): Promise<HighDemandZoneIds> {
  const res = await supabase.from("pricing_high_demand_zones").select("city_id, location_id").eq("active", true);
  if (res.error) throw res.error;
  const cityIds = new Set<string>();
  const locationIds = new Set<string>();
  for (const row of res.data ?? []) {
    if (row.city_id) cityIds.add(row.city_id);
    if (row.location_id) locationIds.add(row.location_id);
  }
  return { cityIds, locationIds };
}

/** Beide zichten op dezelfde actieve deadhead-eligible-zone-rijen — één query. */
export type DeadheadZoneAllowlist = {
  /** Stadsniveau-allowlist (city_id) — beslist `zoneEligible` voor elke bekende dropoff. */
  cityIds: ReadonlySet<string>;
  /** Officiële-woonplaats → city_id — koppelt een ONOPGELOSTE bestemming via PDOK. */
  byOfficialWoonplaats: ReadonlyMap<string, string>;
};

/**
 * Expliciete, server-side allowlist van steden waarvoor deadhead-activering
 * is toegestaan (hotfix 2026-08-13/14, migratie 20260813090000, city-wide
 * zoneclassificatie). Eén query levert beide zichten: `cityIds` (bindt op
 * stadsniveau — zowel Eindhoven Airport als Designer Outlet Roermond resolven
 * via hun `city_id`) én `byOfficialWoonplaats` (de `label`-kolom is bij seed
 * exact `cities.name`, dus de officiële plaatsnaam — geen aparte tabel nodig).
 * Voorheen twee losse queries op dezelfde tabel (2026-08-14 samengevoegd:
 * minder round-trips, kleiner cold-start-risico).
 */
export async function loadDeadheadZoneAllowlist(
  supabase: PricingSupabaseClient
): Promise<DeadheadZoneAllowlist> {
  const res = await supabase
    .from("pricing_deadhead_eligible_zones")
    .select("city_id, label")
    .eq("active", true);
  if (res.error) throw res.error;
  const cityIds = new Set<string>();
  const byOfficialWoonplaats = new Map<string, string>();
  for (const row of res.data ?? []) {
    if (!row.city_id) continue;
    cityIds.add(row.city_id);
    byOfficialWoonplaats.set(normalizeOfficialWoonplaats(row.label), row.city_id);
  }
  return { cityIds, byOfficialWoonplaats };
}

// ── Regel-gebaseerde fallback (INTERN — v1 niet klantzichtbaar) ──────────────

// ── Analytics-/auditlog ──────────────────────────────────────────────────────

/**
 * Schrijft de offerte weg naar pricing_quote_logs (service_role). Nooit
 * blokkerend. `shadow` is SHADOW-ONLY observatiedata (deadhead-model,
 * `null` als deze offerte niet via het afstand-tarief liep) en komt
 * uitsluitend in `price_breakdown` terecht — beïnvloedt niets anders.
 */
async function logQuote(
  input: PricingQuoteInput,
  result: PricingQuoteResult,
  shadow: ShadowLogEntry | null = null
): Promise<void> {
  const logger = createPricingLogClient();
  if (!logger) return; // geen service-role key → stil overslaan

  const row: TablesInsert<"pricing_quote_logs"> = {
    pickup_input: input.pickup ?? null,
    dropoff_input: input.dropoff ?? null,
    vehicle_class_code: input.vehicleClass ?? DEFAULT_VEHICLE_CLASS,
    passengers: input.passengers ?? null,
    luggage: input.luggage ?? null,
    is_return: input.returnTrip === true,
    quoted_price: result.available ? result.price : null,
    currency: "EUR",
    // BUGFIX: was hardcoded op "fixed_route_prices" ongeacht de echte bron,
    // waardoor distance_tariff-offertes verkeerd gelabeld werden. Nodig zodat
    // de shadow-logregels hieronder correct aan hun bron zijn toe te schrijven.
    price_source: result.available ? result.source : null,
    // NB: data_source blijft "supabase"/null — de DB-CHECK op deze kolom staat
    // uitsluitend ('supabase','fallback') toe, geen 'routing'. Dat is een
    // apart, hier niet meegenomen mankement (buiten scope van dit plan); een
    // wijziging naar result.dataSource zou elke distance_tariff-insert laten
    // falen op de CHECK-constraint, incl. de nieuwe shadow-logregel hieronder.
    data_source: result.available ? "supabase" : null,
    distance_km: result.available ? result.distanceKm : null,
    estimated_duration_min: result.available ? result.estimatedDurationMin : null,
    error_code: result.available ? null : result.reason,
    price_breakdown: shadow ? (shadow as unknown as Json) : null,
    request_payload: {
      pickup: input.pickup,
      dropoff: input.dropoff,
      vehicleClass: input.vehicleClass ?? DEFAULT_VEHICLE_CLASS,
      passengers: input.passengers ?? null,
      luggage: input.luggage ?? null,
      returnTrip: input.returnTrip === true,
    } satisfies Json,
  };

  await logger.from("pricing_quote_logs").insert(row);
}
