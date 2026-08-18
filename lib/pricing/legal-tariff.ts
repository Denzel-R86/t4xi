// ─────────────────────────────────────────────────────────────────────────────
// Pure, IO-vrije vergelijkingslaag: wettelijke maximumtarieven (straattaxi) naast
// de bindende T4XI vaste ritprijs. Uitsluitend voor de marketingvergelijking op
// /tarieven — GEEN prijsbron. De bindende prijs komt altijd van de Pricing Engine
// (zie lib/pricing/distance-tariff.ts en service.ts).
// ─────────────────────────────────────────────────────────────────────────────

export type LegalTaxiTariff = {
  /** Vast starttarief bij instappen (€), opstapmarkt. */
  starttarief: number;
  /** Prijs per gereden kilometer (€), opstapmarkt. */
  kilometertarief: number;
  /** Prijs per minuut reistijd (€), opstapmarkt. */
  minuuttarief: number;
  /** Btw-percentage op personenvervoer (NL = 9). */
  btwPercentage: number;
};

/**
 * WETTELIJKE MAXIMUMTARIEVEN — vastgesteld door de Rijksoverheid voor de
 * opstapmarkt (straattaxi), geldig 2026. Uitsluitend ter vergelijking op
 * /tarieven; dit is GEEN eigen tarief en NIET de bron voor de bindende vaste
 * ritprijs. Alleen wijzigen na een officiële overheidstariefaanpassing.
 */
export const LEGAL_TAXI_TARIFF: LegalTaxiTariff = {
  starttarief: 4.31,
  kilometertarief: 3.17,
  minuuttarief: 0.52,
  btwPercentage: 9,
};

export type TariffComparisonResult = {
  /**
   * Kilometers zoals gebruikt voor de vergelijking (afgerond op hele km).
   * De interface MOET exact dit getal tonen — nooit los van hier opnieuw afronden.
   */
  km: number;
  /**
   * Minuten zoals gebruikt voor de vergelijking (afgerond op hele minuten).
   * De interface MOET exact dit getal tonen — nooit los van hier opnieuw afronden.
   */
  min: number;
  /** Indicatief maximumbedrag via taxameter, wettelijk tarief (€, 2 decimalen). */
  taxameterMaximum: number;
  /** taxameterMaximum − vastePrijs (€, 2 decimalen; 0 bij ongeldige invoer of geen voordeel). */
  voordeelInEuro: number;
  /** voordeelInEuro als percentage van taxameterMaximum, afgerond op een heel getal (0 bij ongeldige invoer of geen voordeel). */
  voordeelPercentage: number;
  /** true wanneer alle invoer geldig is EN de vaste prijs daadwerkelijk lager is dan het taxametermaximum. */
  isVoordeliger: boolean;
  /** Evenredig aandeel van het starttarief in de vaste ritprijs (€, 2 decimalen). */
  startcomponent: number;
  /** Evenredig aandeel van de afstand in de vaste ritprijs (€, 2 decimalen); absorbeert afrondingsverschillen. */
  afstandscomponent: number;
  /** Evenredig aandeel van de reistijd in de vaste ritprijs (€, 2 decimalen). */
  tijdscomponent: number;
  /** Vaste ritprijs exclusief btw (€, 2 decimalen). */
  bedragExclusiefBtw: number;
  /** Btw-bedrag over de vaste ritprijs (€, 2 decimalen). */
  btwBedrag: number;
};

const toCents = (euro: number) => Math.round(euro * 100);
const fromCents = (cents: number) => cents / 100;

/**
 * Vergelijkt de bindende vaste ritprijs met het wettelijke taxametermaximum en
 * leidt er een evenredige prijsopbouw (start/afstand/tijd + btw) van af.
 *
 * Afstand en reistijd worden hier — als ENIGE plek — afgerond op hele km/min.
 * Die afgeronde waarden worden vervolgens voor ALLE bedragen gebruikt én
 * teruggegeven (`km`, `min`), zodat de interface nooit zelf opnieuw hoeft af te
 * ronden en dus per definitie dezelfde kilometers/minuten toont als waarmee is
 * gerekend.
 *
 * De drie zichtbare opbouwcomponenten worden in centen berekend en het
 * afrondingsverschil van maximaal één cent wordt in de afstandscomponent
 * verwerkt, zodat ze altijd exact optellen tot de vaste ritprijs.
 *
 * Bij ongeldige invoer (NaN, negatief of nul voor afstand, reistijd of prijs)
 * wordt nooit een onbetrouwbare positieve besparing gerapporteerd: voordeel en
 * percentage vallen dan terug op 0 en isVoordeliger op false.
 */
export function computeTariffComparison(
  distanceKm: number,
  durationMin: number,
  vastePrijs: number,
  tariff: LegalTaxiTariff = LEGAL_TAXI_TARIFF
): TariffComparisonResult {
  const validKm = Number.isFinite(distanceKm) && distanceKm > 0;
  const validMin = Number.isFinite(durationMin) && durationMin > 0;
  const validPrijs = Number.isFinite(vastePrijs) && vastePrijs > 0;
  const inputsValid = validKm && validMin && validPrijs;

  const km = validKm ? Math.round(distanceKm) : 0;
  const min = validMin ? Math.round(durationMin) : 0;
  const prijs = validPrijs ? vastePrijs : 0;

  const taxameterMaximumRaw = tariff.starttarief + km * tariff.kilometertarief + min * tariff.minuuttarief;
  const taxameterMaximum = fromCents(toCents(taxameterMaximumRaw));

  const verhoudingsfactor = taxameterMaximum > 0 ? prijs / taxameterMaximum : 0;
  const priceCents = toCents(prijs);
  const startCents = toCents(tariff.starttarief * verhoudingsfactor);
  const tijdCents = toCents(min * tariff.minuuttarief * verhoudingsfactor);
  const afstandCents = priceCents - startCents - tijdCents;

  const exclBtwCents = Math.round(priceCents / (1 + tariff.btwPercentage / 100));
  const btwCents = priceCents - exclBtwCents;

  let voordeelInEuro = 0;
  let voordeelPercentage = 0;
  let isVoordeliger = false;
  if (inputsValid) {
    voordeelInEuro = fromCents(toCents(taxameterMaximum - prijs));
    voordeelPercentage = taxameterMaximum > 0 ? Math.round((voordeelInEuro / taxameterMaximum) * 100) : 0;
    isVoordeliger = voordeelInEuro > 0;
  }

  return {
    km,
    min,
    taxameterMaximum,
    voordeelInEuro,
    voordeelPercentage,
    isVoordeliger,
    startcomponent: fromCents(startCents),
    afstandscomponent: fromCents(afstandCents),
    tijdscomponent: fromCents(tijdCents),
    bedragExclusiefBtw: fromCents(exclBtwCents),
    btwBedrag: fromCents(btwCents),
  };
}
