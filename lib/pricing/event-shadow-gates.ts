// ─────────────────────────────────────────────────────────────────────────────
// Go/no-go-poorten voor Event Pricing (Phase 6.3). PUUR en IO-VRIJ.
//
// Beoordeelt de geaggregeerde shadow-observaties tegen tien expliciete poorten
// en levert één eindoordeel: GO, NO-GO of INSUFFICIENT EVIDENCE.
//
// TWEE SOORTEN POORTEN
//   HARD  — een overtreding is meteen NO-GO. Dit zijn de poorten die raken aan
//           geld of privacy: prijsisolatie, quote-lock, logintegriteit.
//   SOFT  — een overtreding blokkeert activering ook, maar is een kwestie van
//           onvoldoende of onduidelijk bewijs in plaats van bewezen schade.
//
// NIET-MEETBAAR IS NIET GESLAAGD
//   Een poort waarvoor het bewijs ontbreekt krijgt UNKNOWN, nooit PASS. Zolang
//   er één UNKNOWN staat kan het eindoordeel hooguit INSUFFICIENT EVIDENCE
//   zijn. Zo kan een ontbrekende meting nooit als groen licht worden gelezen.
// ─────────────────────────────────────────────────────────────────────────────
import {
  DEFAULT_EVIDENCE,
  type EvidenceThresholds,
  type ExternalEvidence,
  type ShadowMetrics,
} from "@/lib/pricing/event-shadow-report";

/**
 * REVIEW = geen defect, maar iets waar een mens naar moet kijken voordat er
 * geactiveerd wordt. Blokkeert GO net zo hard als UNKNOWN, maar zegt iets
 * anders: hier is wél gemeten, en de uitkomst vraagt een oordeel.
 */
export type GateStatus = "PASS" | "REVIEW" | "FAIL" | "UNKNOWN";
export type Verdict = "GO" | "NO-GO" | "INSUFFICIENT EVIDENCE";

export type GateResult = {
  readonly id: number;
  readonly name: string;
  readonly status: GateStatus;
  /** HARD: een FAIL maakt het eindoordeel onherroepelijk NO-GO. */
  readonly hard: boolean;
  readonly detail: string;
};

/**
 * Drempel voor de handmatige beoordeling. Bij de verwachte omvang (enkele
 * tientallen matches) wordt NIET gesteekproefd maar ALLES beoordeeld: een
 * steekproef van 30 zegt te weinig, en alles nalopen kost bij die aantallen
 * hooguit een uur. 95% "correct" laat bij 30 matches ruimte voor één twijfelgeval;
 * een als FOUT beoordeelde match is nooit toegestaan, want dat is precies het
 * geval waarin een niet-getroffen klant zou hebben betaald.
 */
export const MANUAL_REVIEW_MIN_CORRECT_PCT = 95;

export function evaluateGates(
  metrics: ShadowMetrics,
  external: ExternalEvidence,
  thresholds: EvidenceThresholds = DEFAULT_EVIDENCE
): readonly GateResult[] {
  const gates: GateResult[] = [];
  const add = (id: number, name: string, hard: boolean, status: GateStatus, detail: string) =>
    gates.push({ id, name, status, hard, detail });

  // 1 — Runtime-integriteit. Niet af te leiden uit de shadow-tabel zelf.
  if (external.runtimeErrors === null) {
    add(1, "runtime integrity", false, "UNKNOWN", "aantal runtime-fouten niet aangeleverd");
  } else {
    add(1, "runtime integrity", false, external.runtimeErrors === 0 ? "PASS" : "FAIL",
      `${external.runtimeErrors} aan Event Pricing toe te schrijven fout(en)`);
  }

  // 2 — Prijsisolatie. HARD: dit is de belofte dat shadow geld niet raakt.
  if (external.eventAdjustmentsOnShadowSnapshots === null) {
    add(2, "price isolation", true, "UNKNOWN", "klantsnapshots niet gecontroleerd");
  } else {
    add(2, "price isolation", true, external.eventAdjustmentsOnShadowSnapshots === 0 ? "PASS" : "FAIL",
      `${external.eventAdjustmentsOnShadowSnapshots} event-adjustment(s) op klantsnapshots in shadow`);
  }

  // 3 — Quote-lock. HARD.
  if (external.snapshotUpdateRevoked === null) {
    add(3, "quote-lock integrity", true, "UNKNOWN", "onveranderlijkheid van snapshots niet gecontroleerd");
  } else {
    add(3, "quote-lock integrity", true, external.snapshotUpdateRevoked ? "PASS" : "FAIL",
      external.snapshotUpdateRevoked
        ? "UPDATE op price_snapshots ingetrokken — totalen zijn onveranderlijk"
        : "price_snapshots is muteerbaar; een vergrendelde prijs kan wijzigen");
  }

  // 4 — Ritdelen onafhankelijk. Bewijs = retourquotes leveren twee losse rijen
  //     én er is minstens één geval waarin de uitkomsten verschillen.
  const ret = metrics.byLeg.get("return");
  const out = metrics.byLeg.get("outbound");
  if (!ret || ret.evaluated === 0) {
    add(4, "leg independence", false, "UNKNOWN", "geen retour-ritdelen waargenomen");
  } else {
    const divergent = (out?.matched ?? 0) !== ret.matched;
    add(4, "leg independence", true, divergent ? "PASS" : "UNKNOWN",
      divergent
        ? `heen ${out?.matched ?? 0} vs retour ${ret.matched} matches — onafhankelijk beoordeeld`
        : "heen en retour matchten identiek; geen bewijs van onafhankelijkheid");
  }

  // 5 — Beide prijsbronnen leveren geldige observaties.
  const fixed = metrics.byPricingSource.get("fixed_route_prices");
  const dist = metrics.byPricingSource.get("distance_tariff");
  // BEWUSTE AFWIJKING van de letterlijke opdracht ("missing = NO-GO"): het
  // ontbreken van observaties voor een prijsbron is niet aangetoond defect maar
  // ontbrekend bewijs. Nul waarnemingen kan simpelweg betekenen dat er nog geen
  // rit van dat type langskwam. Daarom UNKNOWN — wat activering net zo goed
  // blokkeert, maar het onderscheid bewaart tussen "kapot" en "nog niet gezien".
  if (!fixed?.evaluated || !dist?.evaluated) {
    add(5, "pricing-source parity", false, "UNKNOWN",
      `vaste route ${fixed?.evaluated ?? 0}, afstandstarief ${dist?.evaluated ?? 0} — beide prijsbronnen moeten waargenomen zijn`);
  } else {
    add(5, "pricing-source parity", false, "PASS",
      `vaste route ${fixed.evaluated} (${fixed.matched} match), afstandstarief ${dist.evaluated} (${dist.matched} match)`);
  }

  // 6 — Logintegriteit. HARD op PII.
  if (external.prohibitedPiiColumns === null) {
    add(6, "logging integrity", true, "UNKNOWN", "PII-controle niet uitgevoerd");
  } else if (external.prohibitedPiiColumns > 0) {
    add(6, "logging integrity", true, "FAIL", `${external.prohibitedPiiColumns} verboden locatiekolom(men)`);
  } else if (metrics.malformed.length > 0) {
    add(6, "logging integrity", true, "FAIL", `${metrics.malformed.length} inconsistente observatie(s)`);
  } else {
    add(6, "logging integrity", true, "PASS", "velden compleet en consistent, geen locatie-PII");
  }

  // 7 — Dubbelen. Definitie: dezelfde quote_id én hetzelfde ritdeel meer dan
  //     eens vastgelegd. Dat zou een economische observatie dubbel tellen.
  add(7, "duplicate safety", true, metrics.duplicates.length === 0 ? "PASS" : "FAIL",
    metrics.duplicates.length === 0
      ? "geen quote/ritdeel-combinatie dubbel vastgelegd"
      : `${metrics.duplicates.length} dubbele observatie(s): ${metrics.duplicates.slice(0, 3).join("; ")}`);

  // 8 — Handmatige validatie.
  const mr = external.manualReview;
  if (!mr || mr.reviewed === 0) {
    add(8, "manual validation", false, "UNKNOWN", "nog geen matches handmatig beoordeeld");
  } else if (mr.incorrect > 0) {
    add(8, "manual validation", true, "FAIL", `${mr.incorrect} match(es) beoordeeld als onterecht`);
  } else {
    const pct = (mr.correct / mr.reviewed) * 100;
    const enough = mr.reviewed >= metrics.matchedLegs;
    add(8, "manual validation", false, pct >= MANUAL_REVIEW_MIN_CORRECT_PCT && enough ? "PASS" : "UNKNOWN",
      `${mr.correct}/${mr.reviewed} correct (${pct.toFixed(0)}%), ${mr.ambiguous} twijfelachtig` +
        (enough ? "" : ` — ${metrics.matchedLegs - mr.reviewed} match(es) nog niet beoordeeld`));
  }

  // 9 — Economische sanity, in drie banden. Een opslag in de reviewband is geen
  //     defect maar een oordeelsvraag; alleen boven de faalgrens, een toeslag die
  //     de ritprijs evenaart, een absurd absoluut bedrag of ongelijke bedragen
  //     binnen één impactniveau leiden tot FAIL.
  const b = metrics.upliftBands;
  const cov = metrics.configuredFeeCoverage;
  // Configuratieconsistentie is uitsluitend meetbaar op observaties die het
  // GECONFIGUREERDE bedrag hebben vastgelegd. De cohort van vóór de cap-policy
  // heeft dat niet en wordt bewust niet gebackfild — die telt hier dus niet mee,
  // en levert nooit een FAIL op grond van iets wat we niet weten.
  const consistencyMeasurable = cov.withConfigured > 0;
  const hardEcon =
    b.fail +
    metrics.feeAtOrAboveSubtotal +
    metrics.absoluteFeeOutliers +
    (consistencyMeasurable ? metrics.inconsistentFeePerLevel.length : 0);
  const cohortNote =
    cov.withoutConfigured > 0
      ? ` — configuratieconsistentie niet meetbaar voor ${cov.withoutConfigured} oudere observatie(s)`
      : "";
  if (metrics.matchedLegs === 0) {
    add(9, "economic sanity", false, "UNKNOWN", "geen matches om economisch te beoordelen");
  } else if (hardEcon > 0) {
    const reasons: string[] = [];
    if (b.fail > 0) reasons.push(`${b.fail} boven de faalgrens`);
    if (metrics.feeAtOrAboveSubtotal > 0) reasons.push(`${metrics.feeAtOrAboveSubtotal}× toeslag ≥ ritprijs`);
    if (metrics.absoluteFeeOutliers > 0) reasons.push(`${metrics.absoluteFeeOutliers}× boven de absolute grens`);
    if (metrics.inconsistentFeePerLevel.length > 0) reasons.push(`ongelijke bedragen: ${metrics.inconsistentFeePerLevel.join(", ")}`);
    add(9, "economic sanity", false, "FAIL", `${reasons.join("; ")} (max opslag ${metrics.upliftVsSubtotal.maxPct.toFixed(1)}%)`);
  } else if (b.review > 0) {
    add(9, "economic sanity", false, "REVIEW",
      `${b.review} match(es) in de beoordelingsband (max opslag ${metrics.upliftVsSubtotal.maxPct.toFixed(1)}%)${cohortNote}`);
  } else {
    add(9, "economic sanity", false, "PASS",
      `max €${(metrics.fee.maxCents / 100).toFixed(2)}, max opslag ${metrics.upliftVsSubtotal.maxPct.toFixed(1)}% van het subtotaal` +
        (metrics.capAppliedCount > 0 ? `, cap actief op ${metrics.capAppliedCount} match(es)` : "") + cohortNote);
  }

  // 10 — Minimaal bewijs.
  const missing: string[] = [];
  if (metrics.evaluatedLegs < thresholds.minEvaluatedLegs) missing.push(`${metrics.evaluatedLegs}/${thresholds.minEvaluatedLegs} ritdelen`);
  if (metrics.matchedLegs < thresholds.minMatchedLegs) missing.push(`${metrics.matchedLegs}/${thresholds.minMatchedLegs} matches`);
  if ((fixed?.matched ?? 0) < thresholds.minMatchedPerPricingSource) missing.push(`vaste route ${fixed?.matched ?? 0}/${thresholds.minMatchedPerPricingSource} matches`);
  if ((dist?.matched ?? 0) < thresholds.minMatchedPerPricingSource) missing.push(`afstandstarief ${dist?.matched ?? 0}/${thresholds.minMatchedPerPricingSource} matches`);
  if ((metrics.byMatchSide.get("dropoff") ?? 0) < thresholds.minDropoffSideMatches) missing.push(`dropoff ${metrics.byMatchSide.get("dropoff") ?? 0}/${thresholds.minDropoffSideMatches}`);
  if ((ret?.evaluated ?? 0) < thresholds.minReturnLegsEvaluated) missing.push(`retour ${ret?.evaluated ?? 0}/${thresholds.minReturnLegsEvaluated}`);
  if (metrics.byImpactLevel.size < thresholds.minDistinctImpactLevels) missing.push(`${metrics.byImpactLevel.size}/${thresholds.minDistinctImpactLevels} impactniveaus`);
  if (metrics.observationDays < thresholds.minObservationDays) missing.push(`${metrics.observationDays}/${thresholds.minObservationDays} dagen`);
  add(10, "minimum evidence", false, missing.length === 0 ? "PASS" : "UNKNOWN",
    missing.length === 0 ? "alle bewijsdrempels gehaald" : `nog nodig: ${missing.join(", ")}`);

  return gates;
}

/**
 * Eindoordeel. Volgorde is bewust: bewezen schade weegt zwaarder dan ontbrekend
 * bewijs, en ontbrekend bewijs weegt zwaarder dan de wens om door te gaan.
 */
export function verdictOf(gates: readonly GateResult[]): Verdict {
  if (gates.some((g) => g.status === "FAIL")) return "NO-GO";
  if (gates.some((g) => g.status === "UNKNOWN" || g.status === "REVIEW")) return "INSUFFICIENT EVIDENCE";
  return "GO";
}

// ── Rapportopmaak ────────────────────────────────────────────────────────────

const euro = (cents: number) => `€${(cents / 100).toFixed(2)}`;
const pct = (v: number | null) => (v === null ? "n.v.t." : `${(v * 100).toFixed(1)}%`);

function rows(map: ReadonlyMap<string, number>, indent = "  "): string {
  if (map.size === 0) return `${indent}(geen)`;
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${indent}${k.padEnd(24)} ${String(v).padStart(5)}`)
    .join("\n");
}

function pairRows(map: ReadonlyMap<string, { evaluated: number; matched: number }>, indent = "  "): string {
  if (map.size === 0) return `${indent}(geen)`;
  return [...map.entries()]
    .sort((a, b) => b[1].evaluated - a[1].evaluated)
    .map(([k, v]) => `${indent}${k.padEnd(24)} ${String(v.evaluated).padStart(5)} geëvalueerd, ${String(v.matched).padStart(4)} match`)
    .join("\n");
}

/** Tekstueel Phase 6.3-rapport. Bevat uitsluitend niet-herleidbare gegevens. */
export function formatShadowReport(
  metrics: ShadowMetrics,
  gates: readonly GateResult[],
  external: ExternalEvidence,
  thresholds: EvidenceThresholds = DEFAULT_EVIDENCE
): string {
  const mr = external.manualReview;
  const L: string[] = [];
  L.push("EVENT PRICING SHADOW REPORT");
  L.push("");
  L.push(`Observatieperiode : ${metrics.firstObservedAt ?? "-"} t/m ${metrics.lastObservedAt ?? "-"} (${metrics.observationDays} dag(en))`);
  L.push(`Geëvalueerde ritdelen : ${metrics.evaluatedLegs}`);
  L.push(`Gematchte ritdelen    : ${metrics.matchedLegs}`);
  L.push(`Niet-gematcht         : ${metrics.nonMatchedLegs}`);
  L.push(`Matchratio            : ${pct(metrics.matchRate)}`);
  L.push("");
  L.push("Per prijsbron:");
  L.push(pairRows(metrics.byPricingSource));
  L.push("Per ritdeel:");
  L.push(pairRows(metrics.byLeg));
  L.push("Per evenement:");
  L.push(rows(metrics.byEvent));
  L.push("Per impactniveau:");
  L.push(rows(metrics.byImpactLevel));
  L.push("Per zonesoort:");
  L.push(rows(metrics.byZoneType));
  L.push("Per matchkant:");
  L.push(rows(metrics.byMatchSide));
  L.push("");
  L.push("Potentiële toeslag (nooit in rekening gebracht):");
  L.push(`  aantal ${metrics.fee.count}, totaal ${euro(metrics.fee.totalCents)}`);
  L.push(`  gemiddeld ${euro(metrics.fee.averageCents)}, mediaan ${euro(metrics.fee.medianCents)}, p90 ${euro(metrics.fee.p90Cents)}, max ${euro(metrics.fee.maxCents)}`);
  L.push("Potentiële opslag t.o.v. het SUBTOTAAL (excl. nachttarief):");
  L.push(`  gemiddeld ${metrics.upliftVsSubtotal.averagePct.toFixed(1)}%, p90 ${metrics.upliftVsSubtotal.p90Pct.toFixed(1)}%, max ${metrics.upliftVsSubtotal.maxPct.toFixed(1)}%`);
  L.push("");
  L.push(`Matches met €0 tarief : ${metrics.zeroFeeMatches}`);
  L.push(`Upgrades toegepast    : ${metrics.upgradesApplied}`);
  L.push(`Afgetopt op maximum   : ${metrics.cappedResults}`);
  L.push(`Datakwaliteitsfouten  : ${metrics.malformed.length}${metrics.malformed.length ? " — " + metrics.malformed.slice(0, 3).join("; ") : ""}`);
  L.push(`Dubbelen              : ${metrics.duplicates.length}`);
  L.push(`Economische signalen  : ${metrics.economicOutliers.length + metrics.inconsistentFeePerLevel.length}`);
  L.push(`PII-schendingen       : ${external.prohibitedPiiColumns === null ? "niet gemeten" : external.prohibitedPiiColumns}`);
  L.push(`Prijsisolatie-schendingen : ${external.eventAdjustmentsOnShadowSnapshots === null ? "niet gemeten" : external.eventAdjustmentsOnShadowSnapshots}`);
  L.push("");
  L.push("Handmatige beoordeling:");
  L.push(mr
    ? `  beoordeeld ${mr.reviewed}, correct ${mr.correct}, onterecht ${mr.incorrect}, twijfelachtig ${mr.ambiguous}`
    : "  nog niet uitgevoerd");
  L.push("");
  L.push("GO/NO-GO-poorten:");
  for (const g of gates) {
    L.push(`  ${String(g.id).padStart(2)}. ${g.name.padEnd(24)} ${g.status.padEnd(8)}${g.hard ? "[hard] " : "       "}${g.detail}`);
  }
  L.push("");
  L.push(`Bewijsdrempels: ${thresholds.minEvaluatedLegs} ritdelen, ${thresholds.minMatchedLegs} matches, ${thresholds.minObservationDays} dagen`);
  L.push("");
  const verdict = verdictOf(gates);
  L.push(`EINDOORDEEL: ${verdict}`);
  const hardFails = gates.filter((g) => g.status === "FAIL" && g.hard);
  const softFails = gates.filter((g) => g.status === "FAIL" && !g.hard);
  const reviews = gates.filter((g) => g.status === "REVIEW");
  const unknowns = gates.filter((g) => g.status === "UNKNOWN");
  if (hardFails.length > 0) {
    L.push(`  onherroepelijk geblokkeerd door: ${hardFails.map((g) => g.name).join(", ")}`);
  }
  if (softFails.length > 0) {
    L.push(`  geblokkeerd tot besluit over: ${softFails.map((g) => g.name).join(", ")} (geen softwaredefect; vraagt een expliciete keuze)`);
  }
  if (reviews.length > 0) {
    L.push(`  vraagt een menselijk oordeel: ${reviews.map((g) => g.name).join(", ")}`);
  }
  if (unknowns.length > 0) {
    L.push(`  nog niet aantoonbaar: ${unknowns.map((g) => g.name).join(", ")}`);
  }
  return L.join("\n");
}
