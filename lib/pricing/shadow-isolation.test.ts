// Audit: bewijst dat SHADOW-ONLY data (deadhead-model) NERGENS in de publieke
// quote-API-response of de bindende prijs-snapshot terechtkomt — uitsluitend in
// pricing_quote_logs.price_breakdown (service-role, niet publiek leesbaar).
// Statisch/structureel bewijs (bronbestand-scan), zelfde patroon als de
// bestaande security-checks in snapshot-store.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SHADOW_IDENTIFIERS = [
  "shadowPrice",
  "candidateShadowPrice",
  "candidateDeadheadKm",
  "candidateEffectiveKm",
  "candidateDeltaFromLive",
  "deadheadKm",
  "effectiveKm",
  "deltaFromLive",
  "eligibleForActivation",
  "analysisOnly",
  "classificationConfidence",
  "exclusionReason",
  "ShadowDeadheadResult",
  "ShadowLogEntry",
  "deadhead-shadow",
  "basePrice",
  "finalPrice",
  "resolveDeadheadPricing",
  "zoneEligible",
  "pricing_deadhead_eligible_zones",
  "loadDeadheadZoneAllowlist",
  "lookupOfficialWoonplaats",
  "resolveZoneCityIdFromWoonplaats",
  "resolveZoneCityIdFromPostcode4Fallback",
  "woonplaatsnaam",
  "deadhead-zone",
  "pdok-woonplaats",
  "couldPlausiblyBeInZone",
  "zone_lookup_unavailable",
  "withRetryOnce",
  "cachedLoader",
  "PdokLookupError",
];

function sourceOf(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), "utf8");
}

function assertNoShadowIdentifiers(relPath: string) {
  const src = sourceOf(relPath);
  for (const id of SHADOW_IDENTIFIERS) {
    assert.ok(!src.includes(id), `${relPath} mag "${id}" niet bevatten`);
  }
}

test("publieke quote-route (app/api/pricing/quote/route.ts) bevat geen enkele shadow-identifier", () => {
  assertNoShadowIdentifiers("app/api/pricing/quote/route.ts");
});

test("booking-route (app/api/bookings/route.ts) bevat geen enkele shadow-identifier", () => {
  assertNoShadowIdentifiers("app/api/bookings/route.ts");
});

test("prijs-snapshot (bouw + opslag) bevat geen enkele shadow-identifier", () => {
  assertNoShadowIdentifiers("lib/pricing/snapshot.ts");
  assertNoShadowIdentifiers("lib/pricing/snapshot-store.ts");
});

test("engine.ts (centrale booking-prijs-entrypoint) bevat geen enkele shadow-identifier", () => {
  assertNoShadowIdentifiers("lib/pricing/engine.ts");
});

test("PricingQuoteResult-typedefinitie zelf bevat geen shadow-velden", () => {
  const src = sourceOf("lib/pricing/service.ts");
  const start = src.indexOf("export type PricingQuoteResult");
  const end = src.indexOf("type LocationRow");
  assert.ok(start > -1 && end > start, "kon PricingQuoteResult-blok niet lokaliseren voor de scan");
  const typeBlock = src.slice(start, end);
  for (const id of SHADOW_IDENTIFIERS) {
    assert.ok(!typeBlock.includes(id), `PricingQuoteResult mag "${id}" niet bevatten`);
  }
});
