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
 * uitsluitend informatief voor de log; blokkeert de offerte nooit.
 */
type ShadowSkipReason = "missing_config" | "load_error" | "timeout" | "no_service_role_client";

/**
 * Bovengrens op de tijd die de shadow-berekening (config + high-demand-zones
 * laden) aan de offerte mag toevoegen. SHADOW-ONLY: dit begrenst uitsluitend
 * hoelang er op de config/zones gewacht wordt — geen onbeperkt wachten, ook
 * niet bij een tragere of hangende dependency. Bij overschrijding wordt de
 * berekening overgeslagen (reason "timeout"); de offerte gaat gewoon door.
 */
export const SHADOW_LOAD_TIMEOUT_MS = 400;

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
 * Wat er in `pricing_quote_logs.price_breakdown` terechtkomt. Bij een geslaagde
 * berekening de volledige shadow-uitkomst; anders een expliciete skip-reden.
 * `null` betekent: deze offerte ging niet via het afstand-tarief (bv. vaste
 * route of "offerte op aanvraag") — dan is er niets om te loggen.
 */
export type ShadowLogEntry = ShadowDeadheadResult | { shadowSkipped: true; reason: ShadowSkipReason };

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
   * SHADOW-ONLY, best-effort side-channel: registreert de shadow-uitkomst van
   * deze offerte voor de caller (resolveQuote → logQuote). Geen effect op
   * `price` of op het geretourneerde PricingQuoteResult.
   */
  recordShadow?: (entry: ShadowLogEntry) => void;
};

async function resolveQuote(
  input: PricingQuoteInput
): Promise<{ result: PricingQuoteResult; shadow: ShadowLogEntry | null }> {
  const supabase = createPricingReadClient();
  if (!supabase) return { result: unavailable("data_unavailable"), shadow: null };

  // SHADOW-ONLY: pricing_deadhead_config/pricing_high_demand_zones zijn
  // RLS-only zonder publieke policy — de anon-key `supabase` hierboven ziet
  // daar altijd 0 rijen. Uitsluitend voor deze twee tabellen de service-role
  // client (dezelfde als voor pricing_quote_logs-writes); de publieke
  // referentietabellen (locations/vehicle_classes/fixed_route_prices) blijven
  // op de anon-key read-client — geen ongemerkt bredere verhoogde toegang.
  const shadowConfigClient = createPricingLogClient();

  let shadow: ShadowLogEntry | null = null;
  const deps: ResolveQuoteDeps = {
    findLocation: (raw) => findLocation(supabase, raw),
    findVehicleClass: (code) => findVehicleClass(supabase, code),
    findFixedRoute: (pickupId, dropoffId, vehicleClassId) =>
      findFixedRoute(supabase, pickupId, dropoffId, vehicleClassId),
    getRoute: getDrivingRoute,
    loadDeadheadConfig: () =>
      shadowConfigClient
        ? loadDeadheadConfig(shadowConfigClient)
        : Promise.reject(new NoServiceRoleClientError()),
    loadHighDemandZones: () =>
      shadowConfigClient
        ? loadHighDemandZones(shadowConfigClient)
        : Promise.reject(new NoServiceRoleClientError()),
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

  // Enkel is al een heel bedrag (priceFromDistance rondt af); retour = 2× → ook heel.
  const single = priceFromDistance(route.distanceKm, route.durationMin);
  const returnPrice = single * 2;
  const returnApplied = input.returnTrip === true;
  const price = returnApplied ? returnPrice : single;

  // SHADOW-ONLY: raakt price/single/returnPrice hierboven op geen enkele manier
  // aan. Best-effort, tijdsbegrensd (SHADOW_LOAD_TIMEOUT_MS) — een fout of
  // trage/hangende dependency hier mag de offerte nooit laten falen of
  // onbeperkt laten wachten.
  if (deps.recordShadow) {
    try {
      await recordDeadheadShadow(deps, dropoff, route.distanceKm, route.durationMin);
    } catch (e) {
      deps.recordShadow({
        shadowSkipped: true,
        reason:
          e instanceof ShadowTimeoutError
            ? "timeout"
            : e instanceof NoServiceRoleClientError
              ? "no_service_role_client"
              : "load_error",
      });
    }
  }

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

/**
 * SHADOW-ONLY. Classificeert de bestemming en berekent de deadhead-shadow-
 * uitkomst (of registreert een skip-reden bij ontbrekende config). Wordt door
 * de caller (`tryDistanceTariff`) in een try/catch aangeroepen — een fout hier
 * mag de offerte nooit laten falen. Geen enkel resultaat hiervan beïnvloedt
 * `price`/`single`/`returnPrice`.
 */
async function recordDeadheadShadow(
  deps: ResolveQuoteDeps,
  dropoff: LocationRow | null,
  distanceKm: number,
  durationMin: number
): Promise<void> {
  if (!deps.loadDeadheadConfig || !deps.loadHighDemandZones || !deps.recordShadow) return;

  // Parallel laden (geen serieel wachten), begrensd door SHADOW_LOAD_TIMEOUT_MS
  // in totaal — niet per aanroep — zodat de bovengrens op de toegevoegde
  // latency altijd hetzelfde is, ongeacht hoeveel afhankelijkheden er laden.
  const [config, zones] = await withTimeout(
    Promise.all([deps.loadDeadheadConfig(), deps.loadHighDemandZones()]),
    SHADOW_LOAD_TIMEOUT_MS
  );
  if (!config) {
    deps.recordShadow({ shadowSkipped: true, reason: "missing_config" });
    return;
  }

  const classification = classifyDestination({
    dropoff: dropoff ? { id: dropoff.id, city_id: dropoff.city_id } : null,
    highDemandLocationIds: zones.locationIds,
    highDemandCityIds: zones.cityIds,
  });

  deps.recordShadow(computeShadowDeadhead({ distanceKm, durationMin, classification, config }));
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
