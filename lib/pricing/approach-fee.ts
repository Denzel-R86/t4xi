// ─────────────────────────────────────────────────────────────────────────────
// Pure, IO-vrije berekening van de pickup-aanrijcomponent (2026-08-18,
// commercieel akkoord). Rekent uitsluitend in HELE CENTEN — nooit in floats-
// als-euro's — om afrondingsdrift te voorkomen: de klantcomponent wordt
// precies ÉÉNMAAL afgerond, aan het eind van de pijplijn.
//
// `approachReference` is NADRUKKELIJK geen bewezen kostprijs en geen
// technisch afgedwongen chauffeursuitbetaling — uitsluitend een rekenkundige
// referentie (km × tarief + min × tarief) waarvan de klant een percentage
// betaalt en T4XI de rest intern (boekhoudkundig) toerekent. Zie
// service.ts/ApproachFeeBreakdown voor de logvelden — bewust NIET
// `driverPayout`/`chauffeurCost`/`settlement` genoemd: die uitbetaling
// bestaat vandaag technisch niet (zie het auditrapport van 2026-08-18).
// ─────────────────────────────────────────────────────────────────────────────

export type ApproachFeeConfig = {
  /** Aandeel van de volledige referentie dat de klant betaalt, bv. 0.5 = 50%. */
  customerSharePct: number;
  /** Aanrijafstand (km) tot waar de vrijstellingsfactor 0 is. */
  freeKm: number;
  /** Aanrijafstand (km) vanaf waar de vrijstellingsfactor 1 is (volledige dekking). */
  fullCoverageKm: number;
  /** Bovengrens op de klantcomponent, in HELE CENTEN. */
  maxCustomerComponentCents: number;
  /** Boven deze aanrijafstand (km): "Offerte op aanvraag" — de cap geldt dan niet als automatische prijs. */
  maxApproachKm: number;
  /** Referentietarief per aanrijkilometer, in HELE CENTEN. */
  perKmCents: number;
  /** Referentietarief per aanrijminuut, in HELE CENTEN. */
  perMinCents: number;
};

export type ApproachFeeResult =
  | { status: "offer_on_request" }
  | {
      status: "fee";
      /** Volledige (100%) referentie vóór vrijstelling/cap, afgerond op hele centen — uitsluitend voor logging/weergave. */
      referenceCents: number;
      /** 0..1 — 0 binnen de vrije afstand, 1 vanaf de volledige-dekkingsafstand, lineair ertussenin. */
      exemptionFactor: number;
      /** customerSharePct × referenceCents × exemptionFactor, ÉÉNMAAL afgerond op hele centen — VÓÓR de cap. Uitsluitend voor logging (punt "klantcomponent vóór en na cap"). */
      customerComponentBeforeCapCents: number;
      /** Definitieve klantcomponent: customerComponentBeforeCapCents, gecapt op maxCustomerComponentCents. */
      customerComponentCents: number;
      /** True als de cap de klantcomponent daadwerkelijk heeft verlaagd. */
      capped: boolean;
      /** referenceCents − customerComponentCents — het niet-doorbelaste referentiedeel; puur informatief, geen uitbetaling. */
      t4xiAbsorbedReferenceCents: number;
    };

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Vloeiende vrijstelling (2026-08-18, ter vervanging van een harde grens):
 * 0 tot en met `freeKm` → factor 0; `freeKm` tot `fullCoverageKm` → lineair
 * oplopend; vanaf `fullCoverageKm` → factor 1. Geen sprong bij 4,9 km/5,1 km.
 */
export function computeExemptionFactor(distanceKm: number, config: ApproachFeeConfig): number {
  const km = finiteNonNegative(distanceKm);
  if (km <= config.freeKm) return 0;
  if (km >= config.fullCoverageKm) return 1;
  const span = config.fullCoverageKm - config.freeKm;
  if (span <= 0) return 1; // defensief; de migratie-CHECK sluit dit al uit
  return (km - config.freeKm) / span;
}

/**
 * Berekent de pickup-aanrijcomponent voor een gegeven basis→pickup-afstand/tijd.
 * Retourneert `{status:"offer_on_request"}` boven `maxApproachKm` — de caller
 * mag dan NOOIT de cap als automatische prijs gebruiken, ongeacht wat de
 * (dan niet berekende) klantcomponent zou zijn geweest.
 */
export function computeApproachFee(params: {
  distanceKm: number;
  durationMin: number;
  config: ApproachFeeConfig;
}): ApproachFeeResult {
  const { config } = params;
  const km = finiteNonNegative(params.distanceKm);
  const min = finiteNonNegative(params.durationMin);

  if (km > config.maxApproachKm) {
    return { status: "offer_on_request" };
  }

  const referenceCentsRaw = km * config.perKmCents + min * config.perMinCents;
  const exemptionFactor = computeExemptionFactor(km, config);
  const customerComponentRaw = config.customerSharePct * referenceCentsRaw * exemptionFactor;
  const customerComponentBeforeCapCents = Math.round(customerComponentRaw);
  const capped = customerComponentRaw > config.maxCustomerComponentCents;
  const customerComponentCents = Math.round(Math.min(customerComponentRaw, config.maxCustomerComponentCents));
  const referenceCents = Math.round(referenceCentsRaw);

  return {
    status: "fee",
    referenceCents,
    exemptionFactor,
    customerComponentBeforeCapCents,
    customerComponentCents,
    capped,
    t4xiAbsorbedReferenceCents: referenceCents - customerComponentCents,
  };
}
