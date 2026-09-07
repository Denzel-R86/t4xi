// Tests voor de doelselectie van het shadow-rapport.
//
// Wat hier bewaakt wordt is niet "kiest hij het juiste doel", maar: kan
// productie NOOIT per ongeluk worden gekozen, en kan een productie-observatie
// nooit stilzwijgend als formeel 6.4-bewijs gelden zolang er geen bewezen
// activatiemoment is vastgelegd.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assertProjectRef,
  countsAsFormalEvidence,
  envFileFor,
  evidenceWindowFor,
  expectedProjectRef,
  resolveReportTarget,
  PRODUCTION_PROJECT_REF,
  PRODUCTION_SHADOW_START_ISO,
  STAGING_PROJECT_REF,
} from "@/lib/pricing/event-report-target";
import { MEASUREMENT_START_ISO, selectDecisionPopulation, type ShadowObservation } from "@/lib/pricing/event-shadow-report";

// ── Doelselectie ─────────────────────────────────────────────────────────────

test("zonder vlaggen is het doel staging", () => {
  assert.equal(resolveReportTarget([]), "staging");
  assert.equal(resolveReportTarget(["--matches", "--calibrate"]), "staging");
});

test("productie vereist een expliciete opt-in", () => {
  // Dit is de kern: geen enkele andere vlag, en geen ontbrekende vlag, mag
  // productie selecteren.
  assert.equal(resolveReportTarget(["--production"]), "staging");
  assert.equal(resolveReportTarget(["--all", "--since=none"]), "staging");
  assert.equal(resolveReportTarget(["--target=production"]), "production");
});

test("een onbekend of half getypt doel faalt hard, het valt niet terug", () => {
  for (const bad of ["--target=prod", "--target=", "--target=PRODUCTION", "--target=staging2"]) {
    assert.throws(() => resolveReportTarget([bad]), /VEILIGHEIDSSTOP/);
  }
});

test("env-variabelen kunnen het doel niet verschuiven", () => {
  // resolveReportTarget leest uitsluitend argv. Een omgeving die per ongeluk
  // naar productie wijst, verandert de doelkeuze niet.
  const eerder = process.env.APP_ENV;
  try {
    process.env.APP_ENV = "production";
    process.env.SUPABASE_TARGET = "production";
    assert.equal(resolveReportTarget([]), "staging");
  } finally {
    if (eerder === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = eerder;
    delete process.env.SUPABASE_TARGET;
  }
});

// ── Project-ref-validatie ────────────────────────────────────────────────────

test("staging met de productie-ref faalt hard", () => {
  assert.throws(() => assertProjectRef("staging", PRODUCTION_PROJECT_REF), /VEILIGHEIDSSTOP/);
});

test("productie met de staging-ref faalt hard", () => {
  assert.throws(() => assertProjectRef("production", STAGING_PROJECT_REF), /VEILIGHEIDSSTOP/);
});

test("een lege of onbekende ref faalt hard voor beide doelen", () => {
  assert.throws(() => assertProjectRef("staging", ""), /VEILIGHEIDSSTOP/);
  assert.throws(() => assertProjectRef("production", ""), /VEILIGHEIDSSTOP/);
  assert.throws(() => assertProjectRef("production", "willekeurigeref"), /VEILIGHEIDSSTOP/);
});

test("de juiste combinatie gaat door", () => {
  assert.doesNotThrow(() => assertProjectRef("staging", STAGING_PROJECT_REF));
  assert.doesNotThrow(() => assertProjectRef("production", PRODUCTION_PROJECT_REF));
});

test("elk doel heeft een eigen env-bestand — geen gedeeld bestand, geen fallback", () => {
  assert.equal(envFileFor("staging"), ".env.staging.local");
  assert.equal(envFileFor("production"), ".env.production.local");
  assert.notEqual(envFileFor("staging"), envFileFor("production"));
  assert.equal(expectedProjectRef("staging"), STAGING_PROJECT_REF);
  assert.equal(expectedProjectRef("production"), PRODUCTION_PROJECT_REF);
});

// ── Bewijsvenster ────────────────────────────────────────────────────────────

test("staging gebruikt de staging policy-start en levert formeel bewijs", () => {
  const w = evidenceWindowFor("staging", MEASUREMENT_START_ISO);
  assert.equal(w.since, MEASUREMENT_START_ISO);
  assert.equal(w.mode, "formal");
  assert.ok(countsAsFormalEvidence(w));
});

test("productie zonder vastgelegde start levert GEEN formeel bewijs", () => {
  const w = evidenceWindowFor("production", MEASUREMENT_START_ISO, null);
  assert.equal(w.mode, "diagnostic");
  assert.equal(countsAsFormalEvidence(w), false);
  assert.match(w.reason, /PRODUCTION_SHADOW_START_ISO/);
});

test("productie erft NOOIT de staging-startgrens", () => {
  // De valkuil die dit voorkomt: kalenderdagen meetellen waarin op productie
  // geen enkele valide observatie mogelijk was.
  const w = evidenceWindowFor("production", MEASUREMENT_START_ISO, null);
  assert.notEqual(w.since, MEASUREMENT_START_ISO);
  assert.equal(w.since, null);
});

test("PRODUCTION_SHADOW_START_ISO is nu bewust nog niet ingevuld", () => {
  assert.equal(PRODUCTION_SHADOW_START_ISO, null);
});

test("zodra productie een bewezen start heeft, telt hij wel formeel", () => {
  const w = evidenceWindowFor("production", MEASUREMENT_START_ISO, "2026-09-10T12:00:00Z");
  assert.equal(w.since, "2026-09-10T12:00:00Z");
  assert.equal(w.mode, "formal");
  assert.ok(countsAsFormalEvidence(w));
});

// ── Synthetic-uitsluiting geldt ook op productie ─────────────────────────────

let seq = 0;
function obs(o: Partial<ShadowObservation> = {}): ShadowObservation {
  seq += 1;
  return {
    id: `p-${seq}`, observedAt: "2026-09-10T13:00:00.000Z", mode: "shadow",
    quoteId: `q-${seq}`, leg: "outbound", pricingSource: "fixed_route_prices",
    matched: true, impactLevel: "high", potentialFeeCents: 2500,
    configuredFeeCents: 2500, maxUpliftPct: 40, isSynthetic: false,
    baselineSubtotalCents: 10000, eventSlugs: ["ade-2026"], windowIds: ["w1"],
    zoneTypes: ["location_slug"], matchSides: ["pickup"], concurrentEventCount: 1,
    upgradeApplied: false, cappedByMaxLevel: false, ...o,
  };
}

test("synthetische productierijen blijven buiten de beslispopulatie", () => {
  const w = evidenceWindowFor("production", MEASUREMENT_START_ISO, "2026-09-10T12:00:00Z");
  const sel = selectDecisionPopulation([obs(), obs({ isSynthetic: true }), obs()], { since: w.since });
  assert.equal(sel.population.length, 2);
  assert.equal(sel.excludedAsSynthetic, 1);
  assert.ok(sel.population.every((o) => !o.isSynthetic));
});

test("een uitsluitend synthetische productieprobe levert een lege populatie", () => {
  // Precies het scenario van de shadow activation gate: één gecontroleerde
  // probe mag de 6.4-teller niet van 0 af krijgen.
  const w = evidenceWindowFor("production", MEASUREMENT_START_ISO, "2026-09-10T12:00:00Z");
  const sel = selectDecisionPopulation([obs({ isSynthetic: true })], { since: w.since });
  assert.equal(sel.population.length, 0);
  assert.equal(sel.excludedAsSynthetic, 1);
});

// ── Cohorten lopen niet door elkaar ──────────────────────────────────────────

test("staging- en productievensters delen geen startgrens", () => {
  const s = evidenceWindowFor("staging", MEASUREMENT_START_ISO);
  const p = evidenceWindowFor("production", MEASUREMENT_START_ISO, "2026-09-10T12:00:00Z");
  assert.notEqual(s.since, p.since);
});

test("een observatie van vóór de productiestart valt buiten de populatie", () => {
  // Zelfs met dezelfde database zou een oudere rij nooit in het productie-
  // bewijsvenster mogen vallen.
  const w = evidenceWindowFor("production", MEASUREMENT_START_ISO, "2026-09-10T12:00:00Z");
  const sel = selectDecisionPopulation(
    [obs({ observedAt: "2026-09-01T10:00:00.000Z" }), obs({ observedAt: "2026-09-10T13:00:00.000Z" })],
    { since: w.since }
  );
  assert.equal(sel.population.length, 1);
  assert.equal(sel.excludedByPeriod, 1);
});
