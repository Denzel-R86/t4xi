// ─────────────────────────────────────────────────────────────────────────────
// Meetlaag voor de Event Pricing shadow-observaties (Phase 6.3).
//
// PUUR en IO-VRIJ: aggregatie, poortbeoordeling en rapportopmaak over een
// ingegeven verzameling observaties. Leest niets, schrijft niets, kent geen
// database. De leeslaag zit in scripts/event-shadow-report.ts.
//
// WAT DEZE LAAG WEL EN NIET KAN
//   Shadow-data bewijst dat de detectie technisch werkt. Ze bewijst NIET dat
//   een tarief van €25/€40/€60 commercieel juist is, en evenmin dat elke match
//   semantisch terecht was. Dat eerste vergt marktdata, dat tweede menselijke
//   beoordeling. Deze module rekent daarom nooit een "accuracy"-percentage uit
//   dat ze niet kan onderbouwen; ontbrekend bewijs leidt tot de uitkomst
//   INSUFFICIENT EVIDENCE, niet tot een gunstige aanname.
//
// DRIE UITKOMSTEN, GEEN TWEE
//   GO / NO-GO / INSUFFICIENT EVIDENCE. Een harde poortovertreding is meteen
//   NO-GO; te weinig of niet-meetbaar bewijs is INSUFFICIENT EVIDENCE. Alleen
//   wanneer alle poorten slagen én de bewijsdrempels gehaald zijn, staat er GO.
// ─────────────────────────────────────────────────────────────────────────────

/** Eén geëvalueerd ritdeel, genormaliseerd uit pricing_event_shadow_logs. */
export type ShadowObservation = {
  readonly id: string;
  readonly observedAt: string;
  readonly mode: string;
  readonly quoteId: string | null;
  readonly leg: string;
  readonly pricingSource: string | null;
  readonly matched: boolean;
  readonly impactLevel: string;
  /** EFFECTIEF bedrag, ná de uplift-cap. */
  readonly potentialFeeCents: number;
  /**
   * Geconfigureerd bedrag vóór de cap. `null` voor observaties van vóór de
   * cap-policy (Phase 6.3.2) — die worden bewust niet gebackfild, dus voor die
   * cohort is configuratieconsistentie simpelweg niet meetbaar.
   */
  readonly configuredFeeCents: number | null;
  /** De toegepaste cap, of null. */
  readonly maxUpliftPct: number | null;
  /**
   * Ritprijs vóór snapshot-adjustments (quote.priceCents). LET OP: dit is het
   * SUBTOTAAL, niet het uiteindelijke klanttotaal — nachttarief zit er niet in.
   * Elk opslagpercentage hieronder is dus relatief aan het subtotaal en wordt
   * ook zo benoemd.
   */
  readonly baselineSubtotalCents: number | null;
  readonly eventSlugs: readonly string[];
  readonly windowIds: readonly string[];
  readonly zoneTypes: readonly string[];
  readonly matchSides: readonly string[];
  readonly concurrentEventCount: number;
  readonly upgradeApplied: boolean;
  readonly cappedByMaxLevel: boolean;
};

export const LEGS = ["outbound", "return"] as const;
export const PRICING_SOURCES = ["fixed_route_prices", "distance_tariff"] as const;

// ── Bewijsdrempels ───────────────────────────────────────────────────────────
// Bewust klein gehouden: T4XI draait op enkele boekingen per maand. Drempels op
// enterprise-schaal zouden betekenen dat er nooit een besluit valt. De maat is
// daarom "genoeg om een materiële prijsfout te zien", niet statistische
// significantie — en dat verschil staat expliciet in het rapport.

export type EvidenceThresholds = {
  readonly minEvaluatedLegs: number;
  readonly minMatchedLegs: number;
  readonly minMatchedPerPricingSource: number;
  readonly minDropoffSideMatches: number;
  readonly minReturnLegsEvaluated: number;
  readonly minDistinctImpactLevels: number;
  readonly minObservationDays: number;
};

export const DEFAULT_EVIDENCE: EvidenceThresholds = {
  minEvaluatedLegs: 200,
  minMatchedLegs: 30,
  minMatchedPerPricingSource: 5,
  minDropoffSideMatches: 3,
  minReturnLegsEvaluated: 3,
  minDistinctImpactLevels: 2,
  minObservationDays: 14,
};

/**
 * Grenswaarden voor de economische sanity-poort, in drie banden:
 *
 *   opslag <= reviewUpliftPct        → in orde
 *   reviewUpliftPct .. failUpliftPct → handmatig bekijken (REVIEW)
 *   > failUpliftPct                  → afkeuren (FAIL)
 *   toeslag >= subtotaal             → altijd afkeuren
 *
 * Het absolute bedrag wordt daarnaast apart bewaakt: een lage procentuele
 * opslag op een dure lange rit kan nog steeds een absurd bedrag opleveren als
 * de configuratie ooit verandert.
 */
export type EconomicLimits = {
  readonly maxFeeCents: number;
  readonly reviewUpliftPct: number;
  readonly failUpliftPct: number;
};

export const DEFAULT_ECONOMIC_LIMITS: EconomicLimits = {
  maxFeeCents: 6000,
  reviewUpliftPct: 40,
  failUpliftPct: 50,
};

/** Handmatige beoordeling; `null` = nog niet uitgevoerd, dus niet meetbaar. */
export type ManualReview = {
  readonly reviewed: number;
  readonly correct: number;
  readonly incorrect: number;
  readonly ambiguous: number;
};

/**
 * Feiten die NIET uit de shadow-tabel volgen en dus van buiten komen.
 * `null` betekent consequent "niet gemeten", nooit "in orde".
 */
export type ExternalEvidence = {
  /** Runtime-fouten toe te schrijven aan Event Pricing in de meetperiode. */
  readonly runtimeErrors: number | null;
  /** Event-adjustments aangetroffen op klantsnapshots in shadow-modus. Moet 0 zijn. */
  readonly eventAdjustmentsOnShadowSnapshots: number | null;
  /** Is opslag-immutabiliteit van snapshots structureel afgedwongen (geen UPDATE-recht)? */
  readonly snapshotUpdateRevoked: boolean | null;
  /** Verboden locatiekolommen aangetroffen in de logtabel. Moet 0 zijn. */
  readonly prohibitedPiiColumns: number | null;
  readonly manualReview: ManualReview | null;
};

export const NO_EXTERNAL_EVIDENCE: ExternalEvidence = {
  runtimeErrors: null,
  eventAdjustmentsOnShadowSnapshots: null,
  snapshotUpdateRevoked: null,
  prohibitedPiiColumns: null,
  manualReview: null,
};

// ── Aggregatie ───────────────────────────────────────────────────────────────

export type FeeStats = {
  readonly count: number;
  readonly totalCents: number;
  readonly averageCents: number;
  readonly medianCents: number;
  readonly p90Cents: number;
  readonly maxCents: number;
};

export type UpliftStats = {
  readonly count: number;
  readonly averagePct: number;
  readonly p90Pct: number;
  readonly maxPct: number;
};

export type ShadowMetrics = {
  readonly evaluatedLegs: number;
  readonly matchedLegs: number;
  readonly nonMatchedLegs: number;
  /** Aandeel gematchte ritdelen, 0–1. `null` bij een lege dataset. */
  readonly matchRate: number | null;
  readonly firstObservedAt: string | null;
  readonly lastObservedAt: string | null;
  readonly observationDays: number;
  readonly byEvent: ReadonlyMap<string, number>;
  readonly byPricingSource: ReadonlyMap<string, { evaluated: number; matched: number }>;
  readonly byLeg: ReadonlyMap<string, { evaluated: number; matched: number }>;
  readonly byZoneType: ReadonlyMap<string, number>;
  readonly byMatchSide: ReadonlyMap<string, number>;
  readonly byImpactLevel: ReadonlyMap<string, number>;
  readonly fee: FeeStats;
  readonly upliftVsSubtotal: UpliftStats;
  /** Matches met een potentieel bedrag van €0 — meestal een ontbrekende tariefregel. */
  readonly zeroFeeMatches: number;
  readonly upgradesApplied: number;
  readonly cappedResults: number;
  /** Observaties met ontbrekende of ongeldige meetvelden. */
  readonly malformed: readonly string[];
  /** Dubbele economische observaties: dezelfde quote_id + leg meer dan eens. */
  readonly duplicates: readonly string[];
  /** Observaties die de economische grenswaarden overschrijden. */
  readonly economicOutliers: readonly string[];
  /** Verdeling van de matches over de drie opslagbanden. */
  readonly upliftBands: { readonly ok: number; readonly review: number; readonly fail: number };
  /** Matches waarvan de toeslag de ritprijs evenaart of overtreft. */
  readonly feeAtOrAboveSubtotal: number;
  /** Matches boven de absolute bedragsgrens. */
  readonly absoluteFeeOutliers: number;
  /**
   * Impactniveaus waarvoor niet-identieke GECONFIGUREERDE bedragen zijn gezien.
   * Bewust op het geconfigureerde bedrag: onder een uplift-cap zijn ongelijke
   * EFFECTIEVE bedragen juist de bedoeling, dus die zeggen niets over drift.
   */
  readonly inconsistentFeePerLevel: readonly string[];
  /** Matches met een geconfigureerd bedrag (nieuwe cohort) versus zonder (oude). */
  readonly configuredFeeCoverage: { readonly withConfigured: number; readonly withoutConfigured: number };
  /** Matches waarbij de cap het bedrag daadwerkelijk verlaagde. */
  readonly capAppliedCount: number;
};

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

function median(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function bump<K>(map: Map<K, number>, key: K, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

/** Is deze observatie intern consistent? Retourneert de reden, of null. */
function malformedReason(o: ShadowObservation): string | null {
  if (!(LEGS as readonly string[]).includes(o.leg)) return `onbekende leg '${o.leg}'`;
  if (!Number.isInteger(o.potentialFeeCents) || o.potentialFeeCents < 0) return "ongeldig bedrag";
  if (o.baselineSubtotalCents !== null && o.baselineSubtotalCents < 0) return "negatief subtotaal";
  if (o.matched && o.eventSlugs.length === 0) return "matched zonder evenement";
  if (!o.matched && o.eventSlugs.length > 0) return "niet-matched mét evenement";
  if (!o.matched && o.potentialFeeCents !== 0) return "niet-matched met bedrag";
  if (o.matched && o.impactLevel === "none") return "matched op niveau 'none'";
  if (!o.pricingSource) return "geen prijsbron";
  if (Number.isNaN(Date.parse(o.observedAt))) return "ongeldig tijdstempel";
  return null;
}

export function aggregateShadowObservations(
  observations: readonly ShadowObservation[],
  limits: EconomicLimits = DEFAULT_ECONOMIC_LIMITS
): ShadowMetrics {
  const byEvent = new Map<string, number>();
  const byPricingSource = new Map<string, { evaluated: number; matched: number }>();
  const byLeg = new Map<string, { evaluated: number; matched: number }>();
  const byZoneType = new Map<string, number>();
  const byMatchSide = new Map<string, number>();
  const byImpactLevel = new Map<string, number>();
  const malformed: string[] = [];
  const duplicates: string[] = [];
  const economicOutliers: string[] = [];
  const feeSeen = new Map<string, Set<number>>();
  const seenLegKeys = new Set<string>();

  const fees: number[] = [];
  const uplifts: number[] = [];
  const bands = { ok: 0, review: 0, fail: 0 };
  let withConfigured = 0;
  let withoutConfigured = 0;
  let capAppliedCount = 0;
  let feeAtOrAboveSubtotal = 0;
  let absoluteFeeOutliers = 0;
  let matched = 0;
  let zeroFeeMatches = 0;
  let upgrades = 0;
  let capped = 0;
  let first: number | null = null;
  let last: number | null = null;

  for (const o of observations) {
    const reason = malformedReason(o);
    if (reason) malformed.push(`${o.id}: ${reason}`);

    const t = Date.parse(o.observedAt);
    if (!Number.isNaN(t)) {
      first = first === null ? t : Math.min(first, t);
      last = last === null ? t : Math.max(last, t);
    }

    if (o.quoteId) {
      const key = `${o.quoteId}|${o.leg}`;
      if (seenLegKeys.has(key)) duplicates.push(`${o.quoteId} / ${o.leg}`);
      else seenLegKeys.add(key);
    }

    const src = o.pricingSource ?? "onbekend";
    const srcEntry = byPricingSource.get(src) ?? { evaluated: 0, matched: 0 };
    srcEntry.evaluated += 1;
    const legEntry = byLeg.get(o.leg) ?? { evaluated: 0, matched: 0 };
    legEntry.evaluated += 1;

    if (o.matched) {
      matched += 1;
      srcEntry.matched += 1;
      legEntry.matched += 1;
      bump(byImpactLevel, o.impactLevel);
      for (const s of o.eventSlugs) bump(byEvent, s);
      for (const z of o.zoneTypes) bump(byZoneType, z);
      for (const s of o.matchSides) bump(byMatchSide, s);
      fees.push(o.potentialFeeCents);
      if (o.potentialFeeCents === 0) zeroFeeMatches += 1;
      if (o.upgradeApplied) upgrades += 1;
      if (o.cappedByMaxLevel) capped += 1;

      // Consistentie meten op het GECONFIGUREERDE bedrag; onder een cap lopen de
      // effectieve bedragen per ontwerp uiteen.
      if (o.configuredFeeCents === null) {
        withoutConfigured += 1;
      } else {
        withConfigured += 1;
        const levelFees = feeSeen.get(o.impactLevel) ?? new Set<number>();
        levelFees.add(o.configuredFeeCents);
        feeSeen.set(o.impactLevel, levelFees);
        if (o.potentialFeeCents < o.configuredFeeCents) capAppliedCount += 1;
      }

      if (o.potentialFeeCents > limits.maxFeeCents) {
        absoluteFeeOutliers += 1;
        economicOutliers.push(`${o.id}: toeslag €${(o.potentialFeeCents / 100).toFixed(2)} boven de absolute grens`);
      }
      if (o.baselineSubtotalCents !== null && o.baselineSubtotalCents > 0) {
        const pct = (o.potentialFeeCents / o.baselineSubtotalCents) * 100;
        uplifts.push(pct);
        if (pct > limits.failUpliftPct) {
          bands.fail += 1;
          economicOutliers.push(`${o.id}: opslag ${pct.toFixed(1)}% — boven ${limits.failUpliftPct}%`);
        } else if (pct > limits.reviewUpliftPct) {
          bands.review += 1;
          economicOutliers.push(`${o.id}: opslag ${pct.toFixed(1)}% — beoordelen`);
        } else {
          bands.ok += 1;
        }
        if (o.potentialFeeCents >= o.baselineSubtotalCents) {
          feeAtOrAboveSubtotal += 1;
          economicOutliers.push(`${o.id}: toeslag evenaart of overtreft de ritprijs`);
        }
      }
    }
    byPricingSource.set(src, srcEntry);
    byLeg.set(o.leg, legEntry);
  }

  const inconsistent = [...feeSeen.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([level, set]) => `${level}: ${[...set].sort((a, b) => a - b).map((c) => `€${(c / 100).toFixed(2)}`).join(" / ")}`);

  const sortedFees = [...fees].sort((a, b) => a - b);
  const sortedUplifts = [...uplifts].sort((a, b) => a - b);
  const evaluated = observations.length;
  const days = first !== null && last !== null ? Math.max(1, Math.ceil((last - first) / 86_400_000)) : 0;

  return {
    evaluatedLegs: evaluated,
    matchedLegs: matched,
    nonMatchedLegs: evaluated - matched,
    matchRate: evaluated === 0 ? null : matched / evaluated,
    firstObservedAt: first === null ? null : new Date(first).toISOString(),
    lastObservedAt: last === null ? null : new Date(last).toISOString(),
    observationDays: days,
    byEvent,
    byPricingSource,
    byLeg,
    byZoneType,
    byMatchSide,
    byImpactLevel,
    fee: {
      count: sortedFees.length,
      totalCents: sortedFees.reduce((n, c) => n + c, 0),
      averageCents: sortedFees.length === 0 ? 0 : Math.round(sortedFees.reduce((n, c) => n + c, 0) / sortedFees.length),
      medianCents: median(sortedFees),
      p90Cents: percentile(sortedFees, 90),
      maxCents: sortedFees.length === 0 ? 0 : sortedFees[sortedFees.length - 1]!,
    },
    upliftVsSubtotal: {
      count: sortedUplifts.length,
      averagePct: sortedUplifts.length === 0 ? 0 : sortedUplifts.reduce((n, c) => n + c, 0) / sortedUplifts.length,
      p90Pct: percentile(sortedUplifts, 90),
      maxPct: sortedUplifts.length === 0 ? 0 : sortedUplifts[sortedUplifts.length - 1]!,
    },
    zeroFeeMatches,
    upgradesApplied: upgrades,
    cappedResults: capped,
    malformed,
    duplicates,
    economicOutliers,
    upliftBands: bands,
    feeAtOrAboveSubtotal,
    absoluteFeeOutliers,
    inconsistentFeePerLevel: inconsistent,
    configuredFeeCoverage: { withConfigured, withoutConfigured },
    capAppliedCount,
  };
}

// ── Policy-calibratie (Phase 6.3.1) ──────────────────────────────────────────
// Simuleert ALTERNATIEVE tariefbeleidsregels op reeds vastgelegde observaties.
// Verandert niets aan de prijsengine: dit is rekenwerk op historie, bedoeld om
// een beleidskeuze te onderbouwen vóórdat er code wijzigt.
//
// Het gesimuleerde model is een HYBRIDE cap, geen volledig procentueel tarief:
//
//   effectief tarief = min(geconfigureerd tarief, round(subtotaal × cap))
//
// Daarmee blijft het vlakke bedrag intact op ritten die het dragen, en wordt
// uitsluitend de disproportionele uitschieter op korte ritten afgevangen.
// BEWUST GEEN ondergrens: als een korte rit maar een klein bedrag toelaat, is
// dat informatie — geen probleem dat je met een minimumtoeslag moet verbergen.

export type CapPolicySimulation = {
  /** `null` = het huidige vlakke model, zonder cap. */
  readonly capPct: number | null;
  readonly matchedLegs: number;
  readonly totalCents: number;
  readonly averageCents: number;
  readonly medianCents: number;
  readonly maxCents: number;
  readonly maxUpliftPct: number;
  /** Aantal matches waarvan het bedrag door de cap is verlaagd. */
  readonly cappedCount: number;
  /** Verschil met het huidige vlakke model, in centen (negatief = lager). */
  readonly deltaVsFlatCents: number;
  readonly byPricingSource: ReadonlyMap<string, { count: number; totalCents: number; maxUpliftPct: number }>;
};

/** Effectief tarief onder een cap. `null` = geen cap. */
export function cappedFeeCents(
  configuredFeeCents: number,
  baselineSubtotalCents: number | null,
  capPct: number | null
): number {
  if (capPct === null || baselineSubtotalCents === null || baselineSubtotalCents <= 0) return configuredFeeCents;
  // Zelfde afrondingsrichting als resolveEventFee: naar beneden, zodat de cap
  // een strikt plafond is en simulatie en engine niet uiteenlopen.
  return Math.min(configuredFeeCents, Math.floor((baselineSubtotalCents * capPct) / 100));
}

export function simulateCapPolicy(
  observations: readonly ShadowObservation[],
  capPct: number | null
): CapPolicySimulation {
  const matched = observations.filter((o) => o.matched);
  const bySource = new Map<string, { count: number; totalCents: number; maxUpliftPct: number }>();
  const fees: number[] = [];
  let flatTotal = 0;
  let cappedCount = 0;
  let maxUplift = 0;

  for (const o of matched) {
    // Simuleren doe je vanaf het GECONFIGUREERDE bedrag; het effectieve bedrag
    // kan al gecapt zijn en zou dan dubbel worden afgeknepen.
    const base = o.configuredFeeCents ?? o.potentialFeeCents;
    const fee = cappedFeeCents(base, o.baselineSubtotalCents, capPct);
    fees.push(fee);
    flatTotal += base;
    if (fee < base) cappedCount += 1;

    const uplift =
      o.baselineSubtotalCents && o.baselineSubtotalCents > 0 ? (fee / o.baselineSubtotalCents) * 100 : 0;
    if (uplift > maxUplift) maxUplift = uplift;

    const src = o.pricingSource ?? "onbekend";
    const entry = bySource.get(src) ?? { count: 0, totalCents: 0, maxUpliftPct: 0 };
    entry.count += 1;
    entry.totalCents += fee;
    entry.maxUpliftPct = Math.max(entry.maxUpliftPct, uplift);
    bySource.set(src, entry);
  }

  const sorted = [...fees].sort((a, b) => a - b);
  const total = sorted.reduce((n, c) => n + c, 0);
  return {
    capPct,
    matchedLegs: matched.length,
    totalCents: total,
    averageCents: sorted.length === 0 ? 0 : Math.round(total / sorted.length),
    medianCents: median(sorted),
    maxCents: sorted.length === 0 ? 0 : sorted[sorted.length - 1]!,
    maxUpliftPct: maxUplift,
    cappedCount,
    deltaVsFlatCents: total - flatTotal,
    byPricingSource: bySource,
  };
}

/** Vergelijkt het huidige vlakke model met een reeks capvarianten. */
export function compareCapPolicies(
  observations: readonly ShadowObservation[],
  caps: readonly number[] = [30, 35, 40, 45, 50]
): readonly CapPolicySimulation[] {
  return [null, ...caps].map((c) => simulateCapPolicy(observations, c));
}
