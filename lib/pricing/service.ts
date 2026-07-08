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

/**
 * T4XI Pricing Service — v1 (App Router, server-side).
 *
 * Bron van waarheid: `fixed_route_prices` (price = enkel, return_price = retour).
 * Voor vaste routes wordt de retourprijs RECHTSTREEKS uit `return_price` gelezen;
 * er wordt GEEN kortingsmodel toegepast.
 *
 * Fallback (regel-gebaseerd): bestaat intern (zie computeRuleBasedQuote), maar
 * geeft in v1 GEEN klantzichtbare prijs terug. Onbekende routes leveren
 * "offerte op aanvraag". De vlag FALLBACK_CUSTOMER_VISIBLE bewaakt dit.
 *
 * Geen externe afstandsbron: de service leidt zelf geen km/reistijd af.
 */

// ── v1-schakelaar: fallback-prijzen NIET tonen aan klanten ──────────────────
const FALLBACK_CUSTOMER_VISIBLE = false as const;

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
};

export type UnavailableReason =
  | "invalid_input"
  | "unknown_location"
  | "route_not_fixed"
  | "capacity_exceeded"
  | "data_unavailable";

export type PricingQuoteResult =
  | {
      available: true;
      source: "fixed_route_prices";
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
      dataSource: "supabase";
    }
  | {
      available: false;
      reason: UnavailableReason;
      /** klantzichtbare tekst — v1: altijd "Offerte op aanvraag" */
      message: string;
    };

type LocationRow = Pick<Tables<"locations">, "id" | "slug" | "name" | "active">;
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

function unavailable(reason: UnavailableReason): PricingQuoteResult {
  return { available: false, reason, message: QUOTE_ON_REQUEST_MESSAGE };
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

async function resolveQuote(
  input: PricingQuoteInput
): Promise<PricingQuoteResult> {
  const pickupRaw = (input.pickup ?? "").trim();
  const dropoffRaw = (input.dropoff ?? "").trim();
  if (!pickupRaw || !dropoffRaw) return unavailable("invalid_input");

  const supabase = createPricingReadClient();
  if (!supabase) return unavailable("data_unavailable");

  const classCode = slugify(input.vehicleClass ?? DEFAULT_VEHICLE_CLASS) || DEFAULT_VEHICLE_CLASS;

  let pickup: LocationRow | null;
  let dropoff: LocationRow | null;
  let vehicleClass: VehicleClassRow | null;
  try {
    [pickup, dropoff, vehicleClass] = await Promise.all([
      findLocation(supabase, pickupRaw),
      findLocation(supabase, dropoffRaw),
      findVehicleClass(supabase, classCode),
    ]);
  } catch {
    return unavailable("data_unavailable");
  }

  if (!pickup || !dropoff) return unavailable("unknown_location");
  if (!vehicleClass) return unavailable("unknown_location");

  // Capaciteitscontrole (zacht): past de vraag binnen de klasse?
  const passengers = input.passengers ?? 1;
  const luggage = input.luggage ?? 0;
  if (passengers > vehicleClass.max_passengers || luggage > vehicleClass.max_luggage) {
    return unavailable("capacity_exceeded");
  }

  // 1. Vaste route = bron van waarheid
  let fixed: FixedRouteRow | null;
  try {
    fixed = await findFixedRoute(supabase, pickup.id, dropoff.id, vehicleClass.id);
  } catch {
    return unavailable("data_unavailable");
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
      dataSource: "supabase",
    };
  }

  // 2. Geen vaste route → regel-gebaseerde fallback (intern, v1: niet zichtbaar)
  const ruleBased = await computeRuleBasedQuote();
  if (FALLBACK_CUSTOMER_VISIBLE && ruleBased !== null) {
    return ruleBased;
  }

  return unavailable("route_not_fixed");
}

// ── Locatie-/klasse-resolutie ────────────────────────────────────────────────

/**
 * Vindt een actieve locatie. Volgorde:
 *   0. alias-resolutie: een vrij (straat)adres → canonieke fixed-route slug
 *      (Stap 9e — postcode/keyword-mapping, geen prijslogica).
 *   a. exacte slug (alias of geslugificeerde vrije tekst)
 *   b. naam case-insensitive (alleen zonder alias; de alias is al canoniek)
 */
async function findLocation(
  supabase: PricingSupabaseClient,
  raw: string
): Promise<LocationRow | null> {
  const alias = resolveLocationSlug(raw);
  const slug = alias ?? slugify(raw);

  // a. exacte slug (alias of geslugificeerde vrije tekst)
  const bySlug = await supabase
    .from("locations")
    .select("id, slug, name, active")
    .eq("active", true)
    .eq("slug", slug)
    .limit(1)
    .maybeSingle();
  if (bySlug.error) throw bySlug.error;
  if (bySlug.data) return bySlug.data;

  // b. naam case-insensitive — alleen zinvol zonder alias
  if (alias) return null;
  const byName = await supabase
    .from("locations")
    .select("id, slug, name, active")
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

/**
 * Placeholder voor de regel-gebaseerde prijsberekening (pricing_rules +
 * price_adjustments). In v1 uitgeschakeld voor klanten:
 *   - er is geen externe afstandsbron (km/reistijd ontbreken), en
 *   - de afronding/retourlogica is nog niet op T4XI gekalibreerd.
 * Retourneert daarom altijd null; de aanroeper geeft dan "offerte op aanvraag".
 * Bij het activeren (Stap 3+) leest deze functie pricing_rules/price_adjustments
 * en vereist distanceKm/estimatedDurationMin uit een afstandsbron.
 */
async function computeRuleBasedQuote(): Promise<PricingQuoteResult | null> {
  return null;
}

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
