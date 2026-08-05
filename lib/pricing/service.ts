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

type LocationRow = Pick<Tables<"locations">, "id" | "slug" | "name" | "active" | "location_type">;
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

// ── Publieke service ─────────────────────────────────────────────────────────

/**
 * Levert een prijsofferte voor een rit. In v1 uitsluitend voor vaste routes;
 * al het overige → "offerte op aanvraag". Loggt elke offerte (best-effort).
 */
export async function getPricingQuote(
  input: PricingQuoteInput
): Promise<PricingQuoteResult> {
  const result = await resolveQuote(input);
  // Loggen mag de offerte nooit blokkeren of laten falen.
  void logQuote(input, result).catch(() => {});
  return result;
}

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
};

async function resolveQuote(
  input: PricingQuoteInput
): Promise<PricingQuoteResult> {
  const supabase = createPricingReadClient();
  if (!supabase) return unavailable("data_unavailable");

  const deps: ResolveQuoteDeps = {
    findLocation: (raw) => findLocation(supabase, raw),
    findVehicleClass: (code) => findVehicleClass(supabase, code),
    findFixedRoute: (pickupId, dropoffId, vehicleClassId) =>
      findFixedRoute(supabase, pickupId, dropoffId, vehicleClassId),
    getRoute: getDrivingRoute,
  };
  return resolveQuoteWith(input, deps);
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
      };
    }
  }

  // 2. Geen vaste route → afstand-tarief (bindende prijs) mits de routing-API een
  //    echte rij-afstand levert. Werkt óók voor vrije adressen die niet in
  //    `locations` staan; Google Directions accepteert vrije-tekstadressen.
  const byDistance = await tryDistanceTariff(
    deps.getRoute,
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
  getRoute: (
    origin: string,
    destination: string,
    departureAt?: string
  ) => Promise<DrivingRoute | null>,
  input: PricingQuoteInput,
  pickupRaw: string,
  dropoffRaw: string,
  classCode: string,
  pickup: LocationRow | null,
  dropoff: LocationRow | null,
  vehicleClass: VehicleClassRow | null,
  airport: AirportContext
): Promise<PricingQuoteResult | null> {
  const route = await getRoute(pickupRaw, dropoffRaw, input.departureAt);
  if (!route) return null;

  // Enkel is al een heel bedrag (priceFromDistance rondt af); retour = 2× → ook heel.
  const single = priceFromDistance(route.distanceKm, route.durationMin);
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
  };
}

// ── Locatie-/klasse-resolutie ────────────────────────────────────────────────

/** Zoekt één actieve locatie op exacte slug. */
async function locationBySlug(
  supabase: PricingSupabaseClient,
  slug: string
): Promise<LocationRow | null> {
  const res = await supabase
    .from("locations")
    .select("id, slug, name, active, location_type")
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
    .select("id, slug, name, active, location_type")
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

// ── Regel-gebaseerde fallback (INTERN — v1 niet klantzichtbaar) ──────────────

// ── Analytics-/auditlog ──────────────────────────────────────────────────────

/** Schrijft de offerte weg naar pricing_quote_logs (service_role). Nooit blokkerend. */
async function logQuote(
  input: PricingQuoteInput,
  result: PricingQuoteResult
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
    price_source: result.available ? "fixed_route_prices" : null,
    data_source: result.available ? "supabase" : null,
    distance_km: result.available ? result.distanceKm : null,
    estimated_duration_min: result.available ? result.estimatedDurationMin : null,
    error_code: result.available ? null : result.reason,
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
