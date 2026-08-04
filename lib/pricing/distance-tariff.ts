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

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Bindende ENKELE-rit prijs voor een afstand (km) + rijtijd (min). Onder de
 * minimumprijs wordt afgekapt. Niet-eindige/negatieve invoer telt als 0, zodat een
 * kapotte routing-schatting nooit tot een negatieve of NaN-prijs leidt — in het
 * ergste geval wordt het de minimumprijs.
 */
export function priceFromDistance(
  distanceKm: number,
  durationMin: number,
  tariff: DistanceTariff = DEFAULT_DISTANCE_TARIFF
): number {
  const km = Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : 0;
  const min = Number.isFinite(durationMin) && durationMin > 0 ? durationMin : 0;
  const raw = tariff.baseFare + km * tariff.perKm + min * tariff.perMinute;
  return round2(Math.max(tariff.minimumFare, raw));
}
