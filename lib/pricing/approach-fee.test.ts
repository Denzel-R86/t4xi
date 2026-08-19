// Pure unit tests voor de pickup-aanrijcomponent-berekening (2026-08-18).
// Geen database/netwerk: uitsluitend computeExemptionFactor/computeApproachFee
// met de door de eigenaar goedgekeurde productieconfiguratie.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeApproachFee, computeExemptionFactor, type ApproachFeeConfig } from "@/lib/pricing/approach-fee";

// maxApproachKm: 35 → 40 (2026-08-19, tweede bijwerking van PR #20). Reden:
// Utrecht Centraal (36,0km) en Utrecht centrum (35,8km) zitten allebei net
// boven de oude 35km-grens terwijl gemeente Utrecht expliciet aan basis
// Amsterdam-Zuidoost is toegewezen; Lelystad (38,8km vanaf basis Almere)
// evenzo. De cap op €25 klantcomponent en de "boven de grens → Offerte op
// aanvraag"-regel blijven ongewijzigd — alleen de grens zelf schuift op.
const CONFIG: ApproachFeeConfig = {
  customerSharePct: 0.5,
  freeKm: 5,
  fullCoverageKm: 15,
  maxCustomerComponentCents: 2500,
  maxApproachKm: 40,
  perKmCents: 65,
  perMinCents: 110,
};

// ── Vrijstellingsfactor: vloeiend, geen sprong rond 5km/15km ─────────────────

test("computeExemptionFactor: 0km → 0", () => {
  assert.equal(computeExemptionFactor(0, CONFIG), 0);
});
test("computeExemptionFactor: 1km → 0", () => {
  assert.equal(computeExemptionFactor(1, CONFIG), 0);
});
test("computeExemptionFactor: 4.9km → 0 (net onder de vrije grens)", () => {
  assert.equal(computeExemptionFactor(4.9, CONFIG), 0);
});
test("computeExemptionFactor: exact 5km (freeKm) → 0", () => {
  assert.equal(computeExemptionFactor(5, CONFIG), 0);
});
test("computeExemptionFactor: 5.1km → net iets boven 0, geen sprong t.o.v. 4.9km", () => {
  const f = computeExemptionFactor(5.1, CONFIG);
  assert.ok(f > 0 && f < 0.02, `verwacht een kleine factor, kreeg ${f}`);
});
test("computeExemptionFactor: 10km (midden 5-15) → 0.5", () => {
  assert.equal(computeExemptionFactor(10, CONFIG), 0.5);
});
test("computeExemptionFactor: exact 15km (fullCoverageKm) → 1", () => {
  assert.equal(computeExemptionFactor(15, CONFIG), 1);
});
test("computeExemptionFactor: 20km → 1", () => {
  assert.equal(computeExemptionFactor(20, CONFIG), 1);
});
test("computeExemptionFactor: 30km → 1", () => {
  assert.equal(computeExemptionFactor(30, CONFIG), 1);
});
test("computeExemptionFactor: 40km (maxApproachKm) → 1", () => {
  assert.equal(computeExemptionFactor(40, CONFIG), 1);
});

// ── computeApproachFee: prijs/flow op de vereiste kilometerpunten ───────────

test("computeApproachFee: 0km/0min → status fee, component €0,00 (binnen vrije afstand, nog steeds 'toegepast')", () => {
  const r = computeApproachFee({ distanceKm: 0, durationMin: 0, config: CONFIG });
  assert.equal(r.status, "fee");
  if (r.status !== "fee") return;
  assert.equal(r.customerComponentCents, 0);
  assert.equal(r.exemptionFactor, 0);
  assert.equal(r.capped, false);
});

test("computeApproachFee: 4.9km/0min en 5.1km/0min zijn beide ~€0 — geen sprong rond de vrije grens", () => {
  const below = computeApproachFee({ distanceKm: 4.9, durationMin: 0, config: CONFIG });
  const above = computeApproachFee({ distanceKm: 5.1, durationMin: 0, config: CONFIG });
  assert.equal(below.status, "fee");
  assert.equal(above.status, "fee");
  if (below.status !== "fee" || above.status !== "fee") return;
  assert.equal(below.customerComponentCents, 0);
  assert.ok(above.customerComponentCents <= 2, `verwacht een kleine component vlak boven de vrije grens, kreeg ${above.customerComponentCents}`);
});

test("computeApproachFee: 10km/0min → referentie 650ct, factor 0.5, component 163ct (round(0.5*650*0.5))", () => {
  const r = computeApproachFee({ distanceKm: 10, durationMin: 0, config: CONFIG });
  assert.equal(r.status, "fee");
  if (r.status !== "fee") return;
  assert.equal(r.referenceCents, 650);
  assert.equal(r.exemptionFactor, 0.5);
  assert.equal(r.customerComponentBeforeCapCents, 163);
  assert.equal(r.customerComponentCents, 163);
  assert.equal(r.capped, false);
  assert.equal(r.t4xiAbsorbedReferenceCents, 650 - 163);
});

test("computeApproachFee: 15km/0min (fullCoverageKm) → volledige dekking, component = 50% van de referentie", () => {
  const r = computeApproachFee({ distanceKm: 15, durationMin: 0, config: CONFIG });
  assert.equal(r.status, "fee");
  if (r.status !== "fee") return;
  assert.equal(r.referenceCents, 975); // 15*65
  assert.equal(r.exemptionFactor, 1);
  assert.equal(r.customerComponentCents, 488); // round(0.5*975)
});

test("computeApproachFee: 20km/10min → status fee, geen cap (component < €25)", () => {
  const r = computeApproachFee({ distanceKm: 20, durationMin: 10, config: CONFIG });
  assert.equal(r.status, "fee");
  if (r.status !== "fee") return;
  // referentie = 20*65 + 10*110 = 1300+1100 = 2400; component = round(0.5*2400) = 1200
  assert.equal(r.referenceCents, 2400);
  assert.equal(r.customerComponentCents, 1200);
  assert.equal(r.capped, false);
});

test("computeApproachFee: 30km/0min → geen cap", () => {
  const r = computeApproachFee({ distanceKm: 30, durationMin: 0, config: CONFIG });
  assert.equal(r.status, "fee");
  if (r.status !== "fee") return;
  assert.equal(r.referenceCents, 1950); // 30*65
  assert.equal(r.customerComponentCents, 975); // round(0.5*1950)
  assert.equal(r.capped, false);
});

test("computeApproachFee: 39.9km (net onder maxApproachKm) → status fee, automatische prijs", () => {
  const r = computeApproachFee({ distanceKm: 39.9, durationMin: 0, config: CONFIG });
  assert.equal(r.status, "fee");
});

test("computeApproachFee: exact 40km (maxApproachKm) → nog steeds status fee, niet offer_on_request", () => {
  const r = computeApproachFee({ distanceKm: 40, durationMin: 0, config: CONFIG });
  assert.equal(r.status, "fee");
});

test("computeApproachFee: 40.1km (net boven maxApproachKm) → offer_on_request", () => {
  const r = computeApproachFee({ distanceKm: 40.1, durationMin: 0, config: CONFIG });
  assert.equal(r.status, "offer_on_request");
});

test("computeApproachFee: 50km → offer_on_request, geen component berekend", () => {
  const r = computeApproachFee({ distanceKm: 50, durationMin: 40, config: CONFIG });
  assert.deepEqual(r, { status: "offer_on_request" });
});

// ── Cap ───────────────────────────────────────────────────────────────────────

test("computeApproachFee: cap bij €25 — grote referentie wordt afgetopt, capped=true, t4xiAbsorbedReferenceCents blijft kloppen", () => {
  // 40km + 100min (op de nieuwe maxApproachKm) → referentie = 40*65 + 100*110 = 2600 + 11000 = 13600ct.
  // component vóór cap = round(0.5*13600*1) = 6800ct > 2500ct → gecapt.
  const r = computeApproachFee({ distanceKm: 40, durationMin: 100, config: CONFIG });
  assert.equal(r.status, "fee");
  if (r.status !== "fee") return;
  assert.equal(r.referenceCents, 13600);
  assert.equal(r.customerComponentBeforeCapCents, 6800);
  assert.equal(r.customerComponentCents, 2500);
  assert.equal(r.capped, true);
  assert.equal(r.t4xiAbsorbedReferenceCents, 13600 - 2500);
});

test("computeApproachFee: net onder de cap → capped=false", () => {
  // component vóór cap moet <= 2500 zijn. km=25,min=50: ref=25*65+50*110=1625+5500=7125;
  // component=round(0.5*7125*1)=3563 > 2500 → nog steeds gecapt. Kies kleinere waarden:
  // km=20,min=20: ref=20*65+20*110=1300+2200=3500; component=round(0.5*3500)=1750 (<2500, niet gecapt).
  const r = computeApproachFee({ distanceKm: 20, durationMin: 20, config: CONFIG });
  assert.equal(r.status, "fee");
  if (r.status !== "fee") return;
  assert.equal(r.customerComponentCents, 1750);
  assert.equal(r.capped, false);
});

// ── Randgevallen ──────────────────────────────────────────────────────────────

test("computeApproachFee: negatieve/NaN afstand of tijd wordt als 0 behandeld (defensief, geen crash)", () => {
  const r = computeApproachFee({ distanceKm: -5, durationMin: Number.NaN, config: CONFIG });
  assert.equal(r.status, "fee");
  if (r.status !== "fee") return;
  assert.equal(r.referenceCents, 0);
  assert.equal(r.customerComponentCents, 0);
});
