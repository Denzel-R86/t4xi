// ─────────────────────────────────────────────────────────────────────────────
// Pure, IO-vrije tarieflaag voor de afstand-fallback. GEEN Supabase, GEEN fetch —
// puur rekenwerk zodat het deterministisch te testen en overal veilig te
// importeren is. De prijsmotor (service.ts) gebruikt dit alleen wanneer er geen
// vaste route bestaat en er een echte rij-afstand + rijtijd beschikbaar is.
// ─────────────────────────────────────────────────────────────────────────────

export type DistanceTariff = {
  /** Vast starttarief (€). */
  baseFare: number;
  /** Prijs per gereden kilometer (€). */
  perKm: number;
  /** Prijs per minuut rijtijd (€). */
  perMinute: number;
  /** Ondergrens: geen rit kost minder dan dit (€). */
  minimumFare: number;
  /** Btw-percentage (taxivervoer NL = 9). */
  vatRate: number;
};

/**
 * COMMERCIËLE PARAMETERS — door de eigenaar goedgekeurd (cost-plus, afgeleid van
 * het kostenmodel overhead €7 + €0,42/km + €0,72/min met margedoel 35%, ondergrens
 * €30). Dit is een prijsbeslissing, GEEN automatisch afgeleide waarde: niet zonder
 * expliciet akkoord van de eigenaar wijzigen.
 */
export const DEFAULT_DISTANCE_TARIFF: DistanceTariff = {
  baseFare: 10.75,
  perKm: 0.65,
  perMinute: 1.1,
  minimumFare: 30,
  vatRate: 9,
};

/**
 * Ruwe (niet-afgeronde, geen minimum afgedwongen) lineaire tariefuitkomst voor een
 * afstand (km) + rijtijd (min). Niet-eindige/negatieve invoer telt als 0, zodat een
 * kapotte routing-schatting nooit tot een negatief of NaN-bedrag leidt.
 *
 * Puur rekenwerk — gedeeld tussen `priceFromDistance` (bindende klantprijs) en de
 * deadhead-shadowmodule (`lib/pricing/deadhead-shadow.ts`), die dezelfde formule
 * hergebruikt op een aangepaste (effectieve) afstand zonder dit bestand te wijzigen.
 */
export function computeRawTariff(
  distanceKm: number,
  durationMin: number,
  tariff: DistanceTariff = DEFAULT_DISTANCE_TARIFF
): number {
  const km = Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : 0;
  const min = Number.isFinite(durationMin) && durationMin > 0 ? durationMin : 0;
  return tariff.baseFare + km * tariff.perKm + min * tariff.perMinute;
}

/**
 * Bindende ENKELE-rit prijs voor een afstand (km) + rijtijd (min), in HELE euro's.
 *
 * Volgorde (afgesproken): (1) lineair tarief berekenen, (2) minimumprijs afdwingen
 * op het ruwe bedrag, (3) pas dán normaal afronden naar de dichtstbijzijnde hele
 * euro. Zo is de klantprijs altijd een rond bedrag (€32,86 → €33, €73,44 → €73) en
 * kan het gelockte snapshot-totaal er exact mee overeenkomen.
 */
export function priceFromDistance(
  distanceKm: number,
  durationMin: number,
  tariff: DistanceTariff = DEFAULT_DISTANCE_TARIFF
): number {
  const raw = computeRawTariff(distanceKm, durationMin, tariff);
  // Minimum op het ruwe bedrag, dan afronden naar hele euro's.
  return Math.round(Math.max(tariff.minimumFare, raw));
}
