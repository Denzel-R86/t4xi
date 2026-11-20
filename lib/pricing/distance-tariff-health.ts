/**
 * Gezondheid van het afstand-tarief (2026-11-19, uitgebreid 2026-11-21 als
 * "Monitoring 2.0") — puur, geen IO.
 *
 * Aanleiding: het afstand-tarief gaf van 8 september 2026 tot in november geen
 * enkele prijs (Google weigerde de sleutel), en niemand merkte het. Elke rit
 * buiten de vaste routes kreeg stil "Offerte op aanvraag". Deze module beslist
 * op basis van tellingen uit `pricing_quote_logs` of dat opnieuw gebeurt.
 *
 * Signalen, bewust eenvoudig en uitlegbaar:
 *   1. INFRASTRUCTURE_FAILING (nieuw) — aantoonbare infrastructuurstoringen in
 *      het venster van 24 uur: `data_unavailable`,
 *      `airport_arrival_surcharge_unavailable`, of een rij met
 *      `price_breakdown.infraFailure` (configuratie-timeout/-fout, ontbrekende
 *      service-role-client, PDOK onbereikbaar). Zie de drempels hieronder.
 *   2. ROUTING_FAILING — in het venster minstens één expliciete routingstoring
 *      (`routing_unavailable:*`) en nul geslaagde afstandsprijzen.
 *   3. STALE (7-daags vangnet, ongewijzigd) — de laatste geslaagde
 *      afstandsprijs is ouder dan `staleAfterDays`, terwijl er in die periode
 *      minstens `minMissesForStale` aanvragen zonder prijs waren. Vangt ook het
 *      gemaskeerde geval van vóór de diagnostiekfix.
 *
 * Statussen (achterwaarts compatibel): `ok` (= healthy), `idle`, `degraded`
 * (nieuw), `unhealthy`. Alleen `unhealthy` geeft HTTP 503 en laat de workflow
 * falen; `degraded` geeft 200 en een waarschuwing in de workflow-log.
 *
 * Geen verkeer en geen storingssignalen betekent "idle", nooit een alarm: nul
 * aanvragen is een vraagprobleem, geen storing. Een legitieme aanvraag buiten
 * het servicegebied (`outside_service_area` / `beyond_max_approach`) telt
 * nergens mee.
 */

export type DistanceTariffCounts = {
  /** Geslaagde afstandsprijzen in het venster (24 uur). */
  successesInWindow: number;
  /** `routing_unavailable:*` in het venster. */
  routingFailuresInWindow: number;
  /** Aanvragen zonder prijs (`unknown_location`, `route_not_fixed`, `routing_unavailable:*`, infrastructuurstoringen) sinds `staleAfterDays`. */
  missesInStalePeriod: number;
  /** Tijdstip van de laatste geslaagde afstandsprijs ooit, of null. */
  lastSuccessAt: Date | null;
  /** Monitoring 2.0: infrastructuurstoringen in het venster (24 uur). Ontbreekt = 0. */
  infraFailuresInWindow?: number;
  /** Monitoring 2.0: ALLE geprijsde offertes (vaste route + afstand) in het venster. Ontbreekt = 0. */
  pricedQuotesInWindow?: number;
};

export type DistanceTariffHealthOptions = {
  now: Date;
  staleAfterDays?: number;
  minMissesForStale?: number;
};

export type DistanceTariffHealth =
  | { status: "ok"; reason: "recent_success" | "no_signal" }
  | { status: "idle"; reason: "no_traffic" }
  | { status: "degraded"; reason: "infrastructure_errors"; infraFailuresInWindow: number }
  | {
      status: "unhealthy";
      reason: "routing_failing" | "stale" | "infrastructure_failing";
      daysSinceLastSuccess: number | null;
    };

export const DEFAULT_STALE_AFTER_DAYS = 7;
export const DEFAULT_MIN_MISSES_FOR_STALE = 3;

/**
 * Drempels voor infrastructuurstoringen in 24 uur (Monitoring 2.0).
 *
 * Het verkeer is laag (enkele prijsaanvragen per dag), dus de drempels moeten
 * klein zijn om binnen 24 uur iets te zien, maar één losse timeout (koude
 * start die ook de ene retry verliest) mag niemand wekken:
 *
 *   - UNHEALTHY bij >= 2 storingen EN nul geprijsde offertes in 24 uur. Twee
 *     storingen zonder één enkele werkende prijs is geen toeval meer; een
 *     klant die het twee keer probeert is precies het scenario dat we willen
 *     zien.
 *   - UNHEALTHY bij >= 5 storingen in 24 uur, ook als er tussendoor prijzen
 *     lukten (bv. alleen vaste routes werken nog). Bij dit verkeer is vijf
 *     een structureel probleem.
 *   - DEGRADED bij elke andere storing (>= 1): zichtbaar als waarschuwing,
 *     geen mail.
 */
export const INFRA_UNHEALTHY_MIN_WITHOUT_SUCCESS = 2;
export const INFRA_UNHEALTHY_MIN_ALWAYS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export function evaluateDistanceTariffHealth(
  counts: DistanceTariffCounts,
  opts: DistanceTariffHealthOptions
): DistanceTariffHealth {
  const staleAfterDays = opts.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS;
  const minMisses = opts.minMissesForStale ?? DEFAULT_MIN_MISSES_FOR_STALE;
  const infra = counts.infraFailuresInWindow ?? 0;
  const priced = Math.max(counts.pricedQuotesInWindow ?? 0, counts.successesInWindow);

  const daysSinceLastSuccess =
    counts.lastSuccessAt === null
      ? null
      : Math.floor((opts.now.getTime() - counts.lastSuccessAt.getTime()) / DAY_MS);

  // 1. Aantoonbare infrastructuurstoring — ook zonder één geslaagde afstandsprijs.
  if (
    infra >= INFRA_UNHEALTHY_MIN_ALWAYS ||
    (infra >= INFRA_UNHEALTHY_MIN_WITHOUT_SUCCESS && priced === 0)
  ) {
    return { status: "unhealthy", reason: "infrastructure_failing", daysSinceLastSuccess };
  }

  if (counts.successesInWindow > 0) {
    return infra > 0
      ? { status: "degraded", reason: "infrastructure_errors", infraFailuresInWindow: infra }
      : { status: "ok", reason: "recent_success" };
  }

  if (counts.routingFailuresInWindow > 0) {
    return { status: "unhealthy", reason: "routing_failing", daysSinceLastSuccess };
  }

  // 2. Het 7-daagse vangnet blijft ongewijzigd bestaan.
  const stale = daysSinceLastSuccess === null || daysSinceLastSuccess >= staleAfterDays;
  if (stale && counts.missesInStalePeriod >= minMisses) {
    return { status: "unhealthy", reason: "stale", daysSinceLastSuccess };
  }

  if (infra > 0) return { status: "degraded", reason: "infrastructure_errors", infraFailuresInWindow: infra };
  if (counts.missesInStalePeriod === 0) return { status: "idle", reason: "no_traffic" };
  return { status: "ok", reason: "no_signal" };
}

/** Grove, contractvrije samenvatting naast `health.status` (Monitoring 2.0). */
export type HealthState = "healthy" | "idle" | "degraded" | "unhealthy";

export function healthState(health: DistanceTariffHealth): HealthState {
  return health.status === "ok" ? "healthy" : health.status;
}
