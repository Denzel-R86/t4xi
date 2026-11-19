/**
 * Gezondheid van het afstand-tarief (2026-11-19) — puur, geen IO.
 *
 * Aanleiding: het afstand-tarief gaf van 8 september 2026 tot in november geen
 * enkele prijs (Google weigerde de sleutel), en niemand merkte het. Elke rit
 * buiten de vaste routes kreeg stil "Offerte op aanvraag". Deze module beslist
 * op basis van tellingen uit `pricing_quote_logs` of dat opnieuw gebeurt.
 *
 * Twee signalen, bewust eenvoudig en uitlegbaar:
 *   1. ROUTING_FAILING — in het venster minstens één expliciete routingstoring
 *      (`routing_unavailable:*`) en nul geslaagde afstandsprijzen.
 *   2. STALE — de laatste geslaagde afstandsprijs is ouder dan `staleAfterDays`,
 *      terwijl er in die periode minstens `minMissesForStale` aanvragen zonder
 *      prijs waren (`unknown_location` / `route_not_fixed`). Vangt ook het
 *      gemaskeerde geval van vóór de diagnostiekfix.
 *
 * Geen verkeer betekent "idle", nooit een alarm: nul aanvragen is een
 * vraagprobleem, geen storing.
 */

export type DistanceTariffCounts = {
  /** Geslaagde afstandsprijzen in het venster (24 uur). */
  successesInWindow: number;
  /** `routing_unavailable:*` in het venster. */
  routingFailuresInWindow: number;
  /** Aanvragen zonder prijs (`unknown_location`, `route_not_fixed`, `routing_unavailable:*`) sinds `staleAfterDays`. */
  missesInStalePeriod: number;
  /** Tijdstip van de laatste geslaagde afstandsprijs ooit, of null. */
  lastSuccessAt: Date | null;
};

export type DistanceTariffHealthOptions = {
  now: Date;
  staleAfterDays?: number;
  minMissesForStale?: number;
};

export type DistanceTariffHealth =
  | { status: "ok"; reason: "recent_success" | "no_signal" }
  | { status: "idle"; reason: "no_traffic" }
  | { status: "unhealthy"; reason: "routing_failing" | "stale"; daysSinceLastSuccess: number | null };

export const DEFAULT_STALE_AFTER_DAYS = 7;
export const DEFAULT_MIN_MISSES_FOR_STALE = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export function evaluateDistanceTariffHealth(
  counts: DistanceTariffCounts,
  opts: DistanceTariffHealthOptions
): DistanceTariffHealth {
  const staleAfterDays = opts.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS;
  const minMisses = opts.minMissesForStale ?? DEFAULT_MIN_MISSES_FOR_STALE;

  const daysSinceLastSuccess =
    counts.lastSuccessAt === null
      ? null
      : Math.floor((opts.now.getTime() - counts.lastSuccessAt.getTime()) / DAY_MS);

  if (counts.successesInWindow > 0) return { status: "ok", reason: "recent_success" };

  if (counts.routingFailuresInWindow > 0) {
    return { status: "unhealthy", reason: "routing_failing", daysSinceLastSuccess };
  }

  const stale = daysSinceLastSuccess === null || daysSinceLastSuccess >= staleAfterDays;
  if (stale && counts.missesInStalePeriod >= minMisses) {
    return { status: "unhealthy", reason: "stale", daysSinceLastSuccess };
  }

  if (counts.missesInStalePeriod === 0) return { status: "idle", reason: "no_traffic" };
  return { status: "ok", reason: "no_signal" };
}
