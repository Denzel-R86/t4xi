/**
 * Event Pricing shadow-rapport (Phase 6.3) — VOLLEDIG READ-ONLY.
 *
 * Draaien:
 *   node --import tsx scripts/event-shadow-report.ts             # staging (standaard)
 *   node --import tsx scripts/event-shadow-report.ts --matches   # + reviewlijst
 *   node --import tsx scripts/event-shadow-report.ts --calibrate # + capvergelijking
 *   node --import tsx scripts/event-shadow-report.ts --all       # cohorten samen
 *   node --import tsx scripts/event-shadow-report.ts --since=none # zonder startgrens
 *   node --import tsx scripts/event-shadow-report.ts --target=production  # productie
 *
 * Doel: staging tenzij `--target=production` letterlijk is meegegeven. Elk doel
 * heeft een eigen env-bestand en wordt hard tegen zijn project-ref gevalideerd;
 * er is geen fallback en geen env-variabele die het doel kan verschuiven. Zie
 * `lib/pricing/event-report-target.ts` voor het veiligheidsmodel.
 *
 * Zolang `PRODUCTION_SHADOW_START_ISO` niet is vastgelegd, is productie wél
 * leesbaar maar telt niets als formeel 6.4-bewijs — het rapport zegt dat dan
 * expliciet en toont geen poortoordeel.
 *
 * Schrijft niets: geen insert, geen update, geen configwijziging. Het rapport
 * bevat uitsluitend niet-herleidbare gegevens.
 *
 * De handmatige beoordeling (poort 8) en het aantal runtime-fouten (poort 1)
 * zijn niet uit de shadow-tabel af te leiden. Die blijven `null` en leiden tot
 * UNKNOWN — nooit tot een stilzwijgend "in orde".
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  aggregateShadowObservations,
  cappedFeeCents,
  MEASUREMENT_START_ISO,
  selectDecisionPopulation,
  compareCapPolicies,
  NO_EXTERNAL_EVIDENCE,
  type ExternalEvidence,
  type ShadowObservation,
} from "@/lib/pricing/event-shadow-report";
import { evaluateGates, formatShadowReport } from "@/lib/pricing/event-shadow-gates";
import {
  assertProjectRef,
  countsAsFormalEvidence,
  envFileFor,
  evidenceWindowFor,
  resolveReportTarget,
} from "@/lib/pricing/event-report-target";

/** Kolomnamen die nooit in de observatietabel mogen voorkomen. */
const PROHIBITED_COLUMNS = [
  "pickup", "dropoff", "address", "adres", "postcode", "postal",
  "locality", "woonplaats", "latitude", "longitude", "lat", "lon", "lng",
  "name", "naam", "email", "phone", "telefoon",
];

function loadEnvFor(target: Parameters<typeof envFileFor>[0]): void {
  const naam = envFileFor(target);
  const file = resolve(process.cwd(), naam);
  let inhoud: string;
  try {
    inhoud = readFileSync(file, "utf8");
  } catch {
    // Bewust geen fallback naar een ander env-bestand: liever stoppen dan het
    // verkeerde project lezen.
    throw new Error(`VEILIGHEIDSSTOP: '${naam}' ontbreekt — vereist voor doel '${target}'.`);
  }
  for (const line of inhoud.split(/\r?\n/)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

async function main(): Promise<void> {
  const target = resolveReportTarget(process.argv);
  loadEnvFor(target);
  const { assertSafeEnvironment } = await import("@/lib/config/environment");
  assertSafeEnvironment(process.env);
  const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/^https:\/\/([a-z0-9]+)\..*$/, "$1");
  assertProjectRef(target, ref);
  console.log(`DOEL: ${target} (project-ref ${ref})\n`);

  const { createPricingLogClient } = await import("@/lib/supabase/server");
  const db = createPricingLogClient();
  if (!db) throw new Error("geen service-role client beschikbaar");

  // 1. Observaties.
  const { data: rows, error } = await db
    .from("pricing_event_shadow_logs")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const observations: ShadowObservation[] = (rows ?? []).map((r) => ({
    id: String(r.id),
    observedAt: String(r.created_at),
    mode: String(r.mode),
    quoteId: r.quote_id === null ? null : String(r.quote_id),
    leg: String(r.leg),
    pricingSource: r.pricing_source === null ? null : String(r.pricing_source),
    matched: Boolean(r.matched),
    impactLevel: String(r.impact_level),
    potentialFeeCents: Number(r.amount_cents),
    configuredFeeCents: r.configured_fee_cents === null || r.configured_fee_cents === undefined ? null : Number(r.configured_fee_cents),
    maxUpliftPct: r.max_uplift_pct === null || r.max_uplift_pct === undefined ? null : Number(r.max_uplift_pct),
    isSynthetic: r.is_synthetic === true,
    baselineSubtotalCents: r.base_subtotal_cents === null ? null : Number(r.base_subtotal_cents),
    eventSlugs: r.event_slugs ?? [],
    windowIds: r.window_ids ?? [],
    zoneTypes: r.zone_types ?? [],
    matchSides: r.match_sides ?? [],
    concurrentEventCount: Number(r.concurrent_event_count),
    upgradeApplied: Boolean(r.upgrade_applied),
    cappedByMaxLevel: Boolean(r.capped_by_max_level),
  }));

  // 2. Extern bewijs dat wél meetbaar is.
  const shadowQuoteIds = observations
    .filter((o) => o.mode === "shadow" && o.quoteId !== null)
    .map((o) => o.quoteId as string);

  // `price_snapshot_adjustments` staat niet in de gegenereerde databasetypes
  // (net als in snapshot-store.ts) — daarom hier dezelfde smalle, ongetypeerde
  // vorm in plaats van de tabel aan het typebestand toe te voegen.
  type LooseFrom = {
    from: (t: string) => {
      select: (c: string) => {
        in: (col: string, vals: string[]) => Promise<{ data: { code: string }[] | null; error: unknown }>;
      };
    };
  };

  let eventAdjustmentsOnShadowSnapshots = 0;
  if (shadowQuoteIds.length > 0) {
    const loose = db as unknown as LooseFrom;
    const { data: adj, error: adjErr } = await loose
      .from("price_snapshot_adjustments")
      .select("quote_id, code")
      .in("quote_id", shadowQuoteIds);
    if (adjErr) throw adjErr;
    eventAdjustmentsOnShadowSnapshots = (adj ?? []).filter((a) => String(a.code).startsWith("event_")).length;
  }

  // 3. PII-check op de kolommen die de tabel daadwerkelijk teruggeeft.
  const observedColumns = new Set<string>();
  for (const r of rows ?? []) for (const k of Object.keys(r)) observedColumns.add(k.toLowerCase());
  const offending = [...observedColumns].filter((c) => PROHIBITED_COLUMNS.some((p) => c.includes(p)));

  const externalFinal: ExternalEvidence = {
    ...NO_EXTERNAL_EVIDENCE,
    eventAdjustmentsOnShadowSnapshots,
    // Structureel afgedwongen in migratie 20260730120000: geen UPDATE-recht op
    // price_snapshots, dus een opgeslagen totaal kan niet meer wijzigen.
    snapshotUpdateRevoked: true,
    prohibitedPiiColumns: offending.length,
  };

  // 4. Policy-cohorten gescheiden houden. Observaties van vóór de uplift-cap
  //    (Phase 6.3.2) zijn onder een ander tariefmodel ontstaan; ze bij elkaar
  //    optellen zou een go/no-go-besluit baseren op beleid dat niet meer geldt.
  //    De poorten worden daarom beoordeeld op de HUIDIGE cohort zodra die
  //    bestaat; de oude cohort blijft zichtbaar als historie.
  // Formele startgrens van de meetperiode. Observaties van vóór dit moment —
  // testquotes, verificatieruns, alles wat niet uit echt klantverkeer komt —
  // tellen niet mee voor de bewijsdrempels. Zonder deze grens zou een enkele
  // diagnostische run de teller vervuilen.
  // De formele startgrens is de DEFAULT, niet een vlag die je moet onthouden.
  // `--since=` overschrijft hem; `--since=none` zet hem uit voor ad-hocanalyse.
  // Het bewijsvenster hangt af van het DOEL, niet van een gedeelde constante:
  // staging gebruikt MEASUREMENT_START_ISO, productie uitsluitend zijn eigen
  // PRODUCTION_SHADOW_START_ISO. Zolang die laatste niet is vastgelegd, is
  // productie diagnostisch leesbaar maar levert het geen formeel bewijs.
  const window = evidenceWindowFor(target, MEASUREMENT_START_ISO);
  const formeel = countsAsFormalEvidence(window);
  const sinceArg = process.argv.find((a) => a.startsWith("--since="))?.slice("--since=".length);
  const sinceValue = sinceArg === "none" ? null : (sinceArg ?? window.since);
  const selection = selectDecisionPopulation(observations, {
    since: sinceValue,
    includeAll: process.argv.includes("--all"),
  });
  const { population, legacy: legacyPolicy, excludedByPeriod, excludedAsSynthetic, usingCurrentPolicy: usingCurrent } = selection;
  const since = sinceValue ? Date.parse(sinceValue) : null;

  console.log(
    (since === null
      ? "MEETPERIODE: geen startgrens opgegeven — alle observaties tellen mee (--since=<ISO> om te begrenzen).\n"
      : `MEETPERIODE: vanaf ${new Date(since).toISOString()}; ${excludedByPeriod} observatie(s) daarvóór buiten beschouwing.\n`) +
    `SYNTHETISCH: ${excludedAsSynthetic} test-/diagnostische observatie(s) uitgesloten.\n` +
    `POLICY-COHORTEN: ${observations.filter((o) => o.configuredFeeCents === null).length} onder het vlakke model, ` +
    `${observations.filter((o) => o.configuredFeeCents !== null).length} onder de uplift-cap ` +
    `(waarvan ${population.length} in de beslispopulatie).\n` +
    (usingCurrent
      ? "De poorten hieronder gelden UITSLUITEND voor de cap-cohort (--all om alles samen te nemen).\n"
      : "Er zijn nog geen cap-observaties; de poorten gelden voor de volledige set.\n")
  );

  const metrics = aggregateShadowObservations(population);
  if (!formeel) {
    // Geen poortoordeel zonder geldige bewijsstart. Cijfers tonen mag — ze als
    // 6.4-bewijs presenteren niet, want er is geen bewezen moment vanaf wanneer
    // ze zouden tellen.
    console.log(
      "╔═══ DIAGNOSTISCH — GEEN FORMEEL BEWIJS ═══\n" +
      `║ ${window.reason}.\n` +
      "║ De cijfers hieronder zijn ter oriëntatie. Poort 10 en de 6.4-tellers\n" +
      "║ blijven ongeldig tot het activatiemoment is vastgelegd.\n" +
      "╚══════════════════════════════════════════\n"
    );
    console.log(
      `Waargenomen ritdelen : ${metrics.evaluatedLegs}\n` +
      `Waargenomen matches  : ${metrics.matchedLegs}\n` +
      `Synthetisch uitgesloten: ${excludedAsSynthetic}\n\n` +
      "EINDOORDEEL: NIET VAN TOEPASSING — diagnostische run."
    );
    return;
  }
  const gates = evaluateGates(metrics, externalFinal);
  console.log(formatShadowReport(metrics, gates, externalFinal));

  if (usingCurrent && legacyPolicy.length > 0) {
    const legacy = aggregateShadowObservations(legacyPolicy);
    console.log(
      `\nHISTORIE (vlak model, niet meegewogen): ${legacy.evaluatedLegs} ritdelen, ${legacy.matchedLegs} matches, ` +
      `max opslag ${legacy.upliftVsSubtotal.maxPct.toFixed(1)}%, totaal €${(legacy.fee.totalCents / 100).toFixed(2)}`
    );
  }

  if (offending.length > 0) {
    console.log(`\nLET OP — verdachte kolomnamen: ${offending.join(", ")}`);
  }

  // 5. Policy-calibratie (Phase 6.3.1): wat zou een uplift-cap doen met exact
  //    dezelfde historische observaties? Puur rekenwerk — de prijsengine en de
  //    opgeslagen observaties blijven ongemoeid.
  if (process.argv.includes("--calibrate")) {
    const sims = compareCapPolicies(observations);
    console.log("\n\nPOLICY-CALIBRATIE — hybride cap: min(vast tarief, subtotaal × cap)");
    console.log("Simulatie op bestaande observaties. Er wordt niets gewijzigd.\n");
    console.log(
      "  cap      matches  totaal      gemiddeld  mediaan   max      max opslag  gecapt  vs vlak"
    );
    for (const s of sims) {
      const label = s.capPct === null ? "geen" : `${s.capPct}%`;
      console.log(
        `  ${label.padEnd(8)} ${String(s.matchedLegs).padStart(7)}  ` +
        `€${(s.totalCents / 100).toFixed(2).padStart(8)}  ` +
        `€${(s.averageCents / 100).toFixed(2).padStart(8)}  ` +
        `€${(s.medianCents / 100).toFixed(2).padStart(7)}  ` +
        `€${(s.maxCents / 100).toFixed(2).padStart(6)}  ` +
        `${s.maxUpliftPct.toFixed(1).padStart(9)}%  ` +
        `${String(s.cappedCount).padStart(6)}  ` +
        `${s.deltaVsFlatCents === 0 ? "—" : "€" + (s.deltaVsFlatCents / 100).toFixed(2)}`
      );
    }

    console.log("\n  Per prijsbron:");
    for (const s of sims) {
      const label = s.capPct === null ? "geen cap" : `cap ${s.capPct}%`;
      const parts = [...s.byPricingSource.entries()].map(
        ([src, v]) => `${src} ${v.count}× €${(v.totalCents / 100).toFixed(2)} (max ${v.maxUpliftPct.toFixed(1)}%)`
      );
      console.log(`    ${label.padEnd(10)} ${parts.join("   ")}`);
    }

    console.log("\n  Per match (subtotaal → effectief tarief):");
    const caps = [null, 30, 35, 40, 45, 50] as const;
    console.log(`    ${"subtotaal".padEnd(11)}${"bron".padEnd(20)}${"niveau".padEnd(11)}` +
      caps.map((c) => (c === null ? "vlak" : `${c}%`).padStart(8)).join(""));
    for (const o of observations.filter((x) => x.matched)) {
      const base = o.baselineSubtotalCents;
      console.log(
        `    €${((base ?? 0) / 100).toFixed(2).padEnd(10)}${String(o.pricingSource).padEnd(20)}${o.impactLevel.padEnd(11)}` +
        caps.map((c) => `€${(cappedFeeCents(o.potentialFeeCents, base, c) / 100).toFixed(2)}`.padStart(8)).join("")
      );
    }
  }

  // 6. Reviewlijst voor poort 8 (handmatige beoordeling), zonder PII.
  if (process.argv.includes("--matches")) {
    console.log("\nTE BEOORDELEN MATCHES (geen adresgegevens — beoordeel op evenement, venster, zone en kant)");
    const matched = observations.filter((o) => o.matched);
    if (matched.length === 0) console.log("  (geen)");
    for (const o of matched) {
      console.log(
        `  ${o.observedAt}  ${o.leg.padEnd(8)} ${String(o.pricingSource).padEnd(18)} ` +
        `${o.impactLevel.padEnd(10)} €${(o.potentialFeeCents / 100).toFixed(2).padStart(6)}  ` +
        `basis €${o.baselineSubtotalCents === null ? "?" : (o.baselineSubtotalCents / 100).toFixed(2)}  ` +
        `${o.eventSlugs.join(",")} / ${o.zoneTypes.join(",")} / ${o.matchSides.join(",")}  quote ${o.quoteId?.slice(0, 8) ?? "-"}`
      );
    }
  }
}

void main().catch((e) => {
  console.error(`\n✗ ${(e as Error).message}\n`);
  process.exit(1);
});
