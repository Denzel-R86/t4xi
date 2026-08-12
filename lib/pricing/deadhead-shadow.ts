// ─────────────────────────────────────────────────────────────────────────────
// Pure, IO-vrije shadow-analyse voor lange, perifere ritten ("deadhead-model").
// GEEN Supabase, GEEN fetch. Berekent UITSLUITEND een kandidaat-prijs voor
// observatie/logging — raakt nooit de bindende klantprijs (priceFromDistance
// blijft de enige bron van de teruggegeven `price`).
//
// Classificatie is fail-closed: een onopgeloste bestemming (`dropoff: null`)
// wordt NOOIT automatisch als "perifeer" behandeld. Bij een lange afstand levert
// dat wel expliciet gemarkeerde analysis-only kandidaatdata op (`analysisOnly:
// true`), zodat de productie-observatie ook iets oplevert voor bestemmingen die
// nog niet in `locations` voorkomen (bv. Eindhoven Airport, Designer Outlet
// Roermond, Maastricht) — maar die kandidaat telt nooit als bewijs van
// geschiktheid: `qualifies`/`eligibleForActivation` blijven voor "unknown"
// altijd `false`.
// ─────────────────────────────────────────────────────────────────────────────
import {
  computeRawTariff,
  priceFromDistance,
  DEFAULT_DISTANCE_TARIFF,
  type DistanceTariff,
} from "@/lib/pricing/distance-tariff";

export type Classification = "high_demand" | "peripheral" | "unknown";
export type ClassificationSource = "location_row" | "unresolved";
export type ExclusionReason =
  | "unresolved_destination"
  | "high_demand_zone"
  | "below_distance_threshold";

/** Minimale, structurele vorm van de opgeloste bestemming — geen afhankelijkheid van service.ts. */
export type ClassifiableLocation = {
  id: string;
  city_id: string | null;
};

export type DeadheadConfig = {
  minDistanceKm: number;
  deadheadFactor: number;
  maxDeadheadKm: number;
};

export type DestinationClassification = {
  classification: Classification;
  source: ClassificationSource;
  confidence: 0 | 1;
};

export type ShadowDeadheadResult = {
  classification: Classification;
  classificationSource: ClassificationSource;
  classificationConfidence: 0 | 1;
  /** Uitsluitend true bij "peripheral" + distanceKm > config.minDistanceKm. */
  qualifies: boolean;
  /**
   * == qualifies vandaag. Apart veld, want dit is het ENIGE veld dat toekomstige
   * activatielogica mag lezen — voorkomt dat een candidate*-veld ooit per
   * ongeluk als "safe to activate" wordt behandeld.
   */
  eligibleForActivation: boolean;
  exclusionReason: ExclusionReason | null;
  /** true uitsluitend voor het unknown-kandidaatpad hieronder. */
  analysisOnly: boolean;

  // Normaal pad — uitsluitend gevuld bij qualifies === true.
  deadheadKm: number | null;
  effectiveKm: number | null;
  shadowPrice: number | null;
  deltaFromLive: number | null;

  // Analysis-only kandidaatpad — uitsluitend gevuld bij classification === "unknown"
  // EN distanceKm > config.minDistanceKm. Nooit gebruikt voor qualifies/eligibleForActivation.
  candidateDeadheadKm: number | null;
  candidateEffectiveKm: number | null;
  candidateShadowPrice: number | null;
  candidateDeltaFromLive: number | null;
};

/**
 * Fail-closed classificatie. `dropoff === null` (onopgelost adres) → altijd
 * "unknown" — nooit een gok naar "perifeer". Verderop in de flow is er vandaag
 * geen betrouwbare coördinaat/adresmetadata voor een onopgeloste bestemming
 * (zie plan §1); zonder een `LocationRow` is "unknown" de enige eerlijke uitkomst.
 */
export function classifyDestination(params: {
  dropoff: ClassifiableLocation | null;
  highDemandLocationIds: ReadonlySet<string>;
  highDemandCityIds: ReadonlySet<string>;
}): DestinationClassification {
  const { dropoff, highDemandLocationIds, highDemandCityIds } = params;
  if (!dropoff) {
    return { classification: "unknown", source: "unresolved", confidence: 0 };
  }
  const isHighDemand =
    highDemandLocationIds.has(dropoff.id) ||
    (dropoff.city_id !== null && highDemandCityIds.has(dropoff.city_id));
  return {
    classification: isHighDemand ? "high_demand" : "peripheral",
    source: "location_row",
    confidence: 1,
  };
}

function shadowPriceFor(
  distanceKm: number,
  deadheadKm: number,
  durationMin: number,
  tariff: DistanceTariff
): number {
  const effectiveKm = distanceKm + deadheadKm;
  return Math.round(Math.max(tariff.minimumFare, computeRawTariff(effectiveKm, durationMin, tariff)));
}

/**
 * Berekent de shadow-deadheaduitkomst voor observatie/logging. Raakt de
 * bindende klantprijs nooit aan — de caller (service.ts) gebruikt uitsluitend
 * `priceFromDistance` voor `price`, ongeacht wat hier wordt teruggegeven.
 */
export function computeShadowDeadhead(params: {
  distanceKm: number;
  durationMin: number;
  classification: DestinationClassification;
  config: DeadheadConfig;
  tariff?: DistanceTariff;
}): ShadowDeadheadResult {
  const { distanceKm, durationMin, classification, config } = params;
  const tariff = params.tariff ?? DEFAULT_DISTANCE_TARIFF;

  const qualifies = classification.classification === "peripheral" && distanceKm > config.minDistanceKm;
  const eligibleForActivation = qualifies;

  let exclusionReason: ExclusionReason | null = null;
  if (classification.classification === "high_demand") {
    exclusionReason = "high_demand_zone";
  } else if (classification.classification === "unknown") {
    exclusionReason = "unresolved_destination";
  } else if (!qualifies) {
    exclusionReason = "below_distance_threshold";
  }

  let deadheadKm: number | null = null;
  let effectiveKm: number | null = null;
  let shadowPrice: number | null = null;
  let deltaFromLive: number | null = null;
  if (qualifies) {
    deadheadKm = Math.min(distanceKm * config.deadheadFactor, config.maxDeadheadKm);
    effectiveKm = distanceKm + deadheadKm;
    shadowPrice = shadowPriceFor(distanceKm, deadheadKm, durationMin, tariff);
    deltaFromLive = shadowPrice - priceFromDistance(distanceKm, durationMin, tariff);
  }

  let analysisOnly = false;
  let candidateDeadheadKm: number | null = null;
  let candidateEffectiveKm: number | null = null;
  let candidateShadowPrice: number | null = null;
  let candidateDeltaFromLive: number | null = null;
  if (classification.classification === "unknown" && distanceKm > config.minDistanceKm) {
    analysisOnly = true;
    candidateDeadheadKm = Math.min(distanceKm * config.deadheadFactor, config.maxDeadheadKm);
    candidateEffectiveKm = distanceKm + candidateDeadheadKm;
    candidateShadowPrice = shadowPriceFor(distanceKm, candidateDeadheadKm, durationMin, tariff);
    candidateDeltaFromLive = candidateShadowPrice - priceFromDistance(distanceKm, durationMin, tariff);
  }

  return {
    classification: classification.classification,
    classificationSource: classification.source,
    classificationConfidence: classification.confidence,
    qualifies,
    eligibleForActivation,
    exclusionReason,
    analysisOnly,
    deadheadKm,
    effectiveKm,
    shadowPrice,
    deltaFromLive,
    candidateDeadheadKm,
    candidateEffectiveKm,
    candidateShadowPrice,
    candidateDeltaFromLive,
  };
}
