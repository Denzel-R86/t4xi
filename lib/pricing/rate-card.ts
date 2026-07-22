/**
 * Publieke tarievenkaart — leest UIT DEZELFDE BRON als de Pricing Engine
 * (public.fixed_route_prices), server-side. Geen hardcoded prijzen, geen
 * client-fetch: de tarievenpagina en de quote-engine kunnen zo nooit stilletjes
 * uiteenlopen.
 *
 * Groepering gebeurt op BETROUWBARE velden (geen `includes("Amsterdam")`):
 *   · vertrekstad  → locations.city_id → cities   (elke wijk kent zijn stad)
 *   · routetype    → dropoff = schiphol-airport → "Naar Schiphol";
 *                    service_type = 'intercity'  → "Intercity"
 *
 * De groeperingslogica (`groupRoutes`) is puur en apart getest.
 */

import { createPricingReadClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Genormaliseerde route-rij zoals de grouping die verwacht (puur, testbaar). */
export type RawRateRow = {
  pickupName: string;
  citySlug: string;
  cityName: string;
  dropoffSlug: string;
  dropoffName: string;
  /** locations.location_type van de bestemming ("airport", "city", …). */
  dropoffType: string;
  serviceType: string;
  single: number;
  retour: number | null;
  distanceKm: number;
};

export type RateEntry = {
  from: string;
  to: string;
  distanceKm: number;
  single: number;
  retour: number | null;
};

export type CityRates = {
  citySlug: string;
  cityName: string;
  toSchiphol: RateEntry[];
  intercity: RateEntry[];
  /**
   * Routes naar een luchthaven die niet Schiphol is (nu: Rotterdam The Hague
   * Airport). Tot 2026-07-22 werden deze rijen stilzwijgend weggegooid — twee
   * actieve, betaalde routes (Amsterdam €119, Rotterdam €39) stonden daardoor
   * nergens op /tarieven.
   */
  otherAirports: RateEntry[];
};

/** Vaste volgorde van de hoofd-vertreksteden; overige steden volgen alfabetisch. */
const CITY_ORDER = ["amsterdam", "rotterdam", "almere", "utrecht"];

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v));
const validPrice = (n: number): boolean => Number.isFinite(n) && n > 0;

/**
 * Pure groepering: RawRateRow[] → één sectie per vertrekstad, met twee
 * gescheiden routegroepen (Naar Schiphol / Intercity). Sorteert op prijs,
 * dedupliceert op (from → to), en weigert ongeldige prijzen.
 */
export function groupRoutes(rows: RawRateRow[]): CityRates[] {
  const byCity = new Map<string, CityRates>();
  const seen = new Set<string>();

  for (const r of rows) {
    if (!r.citySlug) continue; // zonder betrouwbare stad niet groeperen
    if (!validPrice(r.single)) continue; // geen lege/NaN/negatieve prijs

    let city = byCity.get(r.citySlug);
    if (!city) {
      city = { citySlug: r.citySlug, cityName: r.cityName, toSchiphol: [], intercity: [], otherAirports: [] };
      byCity.set(r.citySlug, city);
    }

    const isSchiphol = r.dropoffSlug === "schiphol-airport";
    const isOtherAirport = !isSchiphol && r.dropoffType === "airport";
    const isIntercity = r.serviceType === "intercity";
    if (!isSchiphol && !isOtherAirport && !isIntercity) continue; // onbekend routetype → niet tonen

    const entry: RateEntry = {
      from: isSchiphol || isOtherAirport ? r.pickupName : r.cityName,
      to: isSchiphol ? "Schiphol" : r.dropoffName,
      distanceKm: r.distanceKm,
      single: r.single,
      retour: r.retour !== null && validPrice(r.retour) ? r.retour : null,
    };

    const key = `${r.citySlug}|${entry.from}→${entry.to}`;
    if (seen.has(key)) continue; // iedere route maximaal één keer
    seen.add(key);

    (isSchiphol ? city.toSchiphol : isOtherAirport ? city.otherAirports : city.intercity).push(entry);
  }

  const sortByPrice = (a: RateEntry, b: RateEntry) => a.single - b.single;
  const sections = Array.from(byCity.values());
  sections.forEach((c) => {
    c.toSchiphol.sort(sortByPrice);
    c.intercity.sort(sortByPrice);
    c.otherAirports.sort(sortByPrice);
  });

  sections.sort((a, b) => {
    const ia = CITY_ORDER.indexOf(a.citySlug);
    const ib = CITY_ORDER.indexOf(b.citySlug);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.cityName.localeCompare(b.cityName, "nl");
  });

  return sections;
}

type Row = Record<string, unknown>;

/** Leest alle actieve routes en groepeert ze. Lege lijst als config ontbreekt. */
export async function loadRateCard(): Promise<CityRates[]> {
  const typed = createPricingReadClient();
  if (!typed) return [];
  const supabase = typed as unknown as SupabaseClient;

  const { data, error } = await supabase
    .from("fixed_route_prices")
    .select(
      `price, return_price, distance_km, service_type,
       pickup:locations!fixed_route_prices_pickup_location_id_fkey ( name, city:cities ( slug, name ) ),
       dropoff:locations!fixed_route_prices_dropoff_location_id_fkey ( slug, name, location_type )`
    )
    .eq("active", true);

  if (error) {
    console.error("[rate-card] kon tarieven niet lezen:", error.message);
    return [];
  }

  const rows: RawRateRow[] = ((data ?? []) as Row[]).flatMap((r) => {
    const pickup = (r.pickup ?? {}) as Row;
    const city = (pickup.city ?? {}) as Row;
    const dropoff = (r.dropoff ?? {}) as Row;
    const citySlug = city.slug ? String(city.slug) : "";
    if (!citySlug) return [];
    return [
      {
        pickupName: String(pickup.name ?? ""),
        citySlug,
        cityName: String(city.name ?? ""),
        dropoffSlug: String(dropoff.slug ?? ""),
        dropoffName: String(dropoff.name ?? ""),
        dropoffType: String(dropoff.location_type ?? ""),
        serviceType: String(r.service_type ?? ""),
        single: num(r.price),
        retour: r.return_price === null || r.return_price === undefined ? null : num(r.return_price),
        distanceKm: num(r.distance_km),
      },
    ];
  });

  return groupRoutes(rows);
}
