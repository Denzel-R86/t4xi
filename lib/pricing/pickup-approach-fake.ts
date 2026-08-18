// ─────────────────────────────────────────────────────────────────────────────
// TEST-ONLY hulpmiddel (2026-08-18) — NOOIT importeren vanuit productiecode.
//
// Vóór het pickup-aanrijmodel hadden bestaande deadhead-/afstand-tarief-tests
// geen pickup-aanrijstap: `tryDistanceTariff()` riep die simpelweg niet aan.
// Nu is die stap FAIL-CLOSED en EERST in de pijplijn (landelijke beperking,
// door de eigenaar bevestigd) — zonder werkende pickup-aanrijdeps wordt élke
// dynamische offerte "Offerte op aanvraag", wat al deze oudere, ongerelateerde
// tests zou breken.
//
// Dit bestand levert een NEUTRALE, altijd-geldige set pickup-aanrijdeps: een
// vaste, altijd-toegewezen standplaats waarvan de "aanrijafstand" naar elke
// pickup exact 2km is — ruim binnen de vrije afstand (freeKm=5 in de
// productieconfiguratie) — zodat de aanrijcomponent altijd €0,00 is en de
// bestaande, ongewijzigde prijsassertions van die tests exact blijven kloppen.
// `wrapGetRouteWithNeutralApproach` onderscheidt de (interne) basis→pickup-
// aanroep van de eigenlijke passagiersroute op exacte origin-string-match —
// geen enkele bestaande testinvoer kan die string ooit toevallig raken.
// ─────────────────────────────────────────────────────────────────────────────

import type { ApproachFeeConfig } from "@/lib/pricing/approach-fee";
import type { OperationalBase } from "@/lib/pricing/service";
import { normalizeGemeenteNaam } from "@/lib/pricing/service-area";
import type { DrivingRoute } from "@/lib/pricing/routing";

export const NEUTRAL_APPROACH_CONFIG: ApproachFeeConfig = {
  customerSharePct: 0.5,
  freeKm: 5,
  fullCoverageKm: 15,
  maxCustomerComponentCents: 2500,
  maxApproachKm: 35,
  perKmCents: 65,
  perMinCents: 110,
};

export const NEUTRAL_BASE: OperationalBase = {
  id: "neutral-base-id",
  slug: "neutral-base",
  label: "Neutraal",
  postcode: "0000AA",
  latitude: 52.0,
  longitude: 5.0,
};

/** Exacte origin-string die resolvePickupApproach() voor de basis→pickup-route opbouwt. */
export const NEUTRAL_BASE_ADDRESS = `${NEUTRAL_BASE.postcode} ${NEUTRAL_BASE.label}`;

export const NEUTRAL_GEMEENTE = "Neutrale Testgemeente";

export const neutralPickupApproachDeps = {
  loadApproachFeeConfig: async () => NEUTRAL_APPROACH_CONFIG,
  loadOperationalBases: async () => new Map([[NEUTRAL_BASE.slug, NEUTRAL_BASE]]),
  loadServiceAreaBaseSlugs: async () => new Map([[normalizeGemeenteNaam(NEUTRAL_GEMEENTE), NEUTRAL_BASE.slug]]),
  lookupOfficialGemeente: async () => NEUTRAL_GEMEENTE,
};

/**
 * Wikkelt een test-eigen `getRoute`-fake zodat de basis→pickup-aanroep van
 * resolvePickupApproach() altijd exact 2km/5min oplevert (→ €0,00
 * aanrijcomponent, zie NEUTRAL_APPROACH_CONFIG.freeKm), terwijl elke andere
 * aanroep (de echte passagiersroute) ongewijzigd naar `passengerGetRoute` gaat.
 */
export function wrapGetRouteWithNeutralApproach(
  passengerGetRoute: (origin: string, destination: string, departureAt?: string) => Promise<DrivingRoute | null>
): (origin: string, destination: string, departureAt?: string) => Promise<DrivingRoute | null> {
  return async (origin, destination, departureAt) => {
    if (origin === NEUTRAL_BASE_ADDRESS) return { distanceKm: 2, durationMin: 5 };
    return passengerGetRoute(origin, destination, departureAt);
  };
}
