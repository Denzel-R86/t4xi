import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  EXCLUDED_TEST_TRAFFIC,
  EXCLUDED_TEST_QUOTE_IDS,
  MACHINE_PACED_MAX_GAP_SECONDS,
} from "@/lib/pricing/event-shadow-test-traffic";
import { selectDecisionPopulation, type ShadowObservation } from "@/lib/pricing/event-shadow-report";

/**
 * Uitsluiting van verificatieverkeer uit de Gate 6.4-tellers.
 *
 * Wat hier bewaakt wordt: dat uitsluitend AANTOONBAAR testverkeer afvalt, dat de
 * historische observaties ongemoeid blijven, dat de pure meetlaag de lijst niet
 * zelf kent, en dat de leeslaag hem daadwerkelijk meegeeft. Dat laatste is een
 * broncode-lock: zonder die wiring zouden de poorten stilzwijgend overtellen.
 */

function obs(quoteId: string | null, over: Partial<ShadowObservation> = {}): ShadowObservation {
  return {
    id: `o-${quoteId ?? "null"}-${Math.random().toString(36).slice(2, 8)}`,
    observedAt: "2026-10-12T06:47:35.000Z",
    mode: "shadow",
    quoteId,
    leg: "outbound",
    pricingSource: "fixed_route_prices",
    matched: false,
    impactLevel: "none",
    potentialFeeCents: 0,
    isSynthetic: false,
    configuredFeeCents: 0,
    ...(over as Record<string, unknown>),
  } as ShadowObservation;
}

// ── De lijst zelf ────────────────────────────────────────────────────────────

test("zeventien quotes, elk met een herleidbaar bewijs", () => {
  assert.equal(EXCLUDED_TEST_TRAFFIC.length, 17);
  assert.equal(EXCLUDED_TEST_QUOTE_IDS.size, 17, "geen dubbele id's");
  for (const q of EXCLUDED_TEST_TRAFFIC) {
    assert.match(q.quoteId, /^[0-9a-f-]{36}$/, `geen geldig uuid: ${q.quoteId}`);
    assert.ok(q.reden.length > 20, `reden te mager voor ${q.quoteId}`);
    assert.ok(!Number.isNaN(Date.parse(q.at)), `ongeldig tijdstip voor ${q.quoteId}`);
  }
});

test("het bewijs is het machinale interval, niet een tijdvenster", () => {
  // Eén quote per reeks heeft geen voorganger (gapSeconds null); één quote is de
  // start van de tweede batch binnen blok 2 (18,99 s). Alle overige intervallen
  // moeten onder de machinale grens liggen.
  const metGat = EXCLUDED_TEST_TRAFFIC.filter((q) => q.gapSeconds !== null);
  const machinaal = metGat.filter((q) => q.gapSeconds! < MACHINE_PACED_MAX_GAP_SECONDS);
  assert.ok(
    machinaal.length >= metGat.length - 1,
    `verwacht hoogstens één niet-machinaal interval, vond ${metGat.length - machinaal.length}`
  );
  const hoogste = Math.max(...machinaal.map((q) => q.gapSeconds!));
  assert.ok(hoogste < MACHINE_PACED_MAX_GAP_SECONDS, `hoogste machinale interval ${hoogste}s`);
});

test("de machinale grens ligt ruim onder het laagste gemeten menselijke tempo", () => {
  // Gemeten op 2026-10-12: het niet-uitgesloten blok liep op 13,98–44,88 s.
  const LAAGSTE_MENSELIJK = 13.98;
  assert.ok(
    MACHINE_PACED_MAX_GAP_SECONDS < LAAGSTE_MENSELIJK,
    "de grens mag menselijk verkeer niet kunnen raken"
  );
});

test("het niet-aantoonbare blok van 07:02–07:04 staat er bewust NIET in", () => {
  for (const q of EXCLUDED_TEST_TRAFFIC) {
    assert.ok(
      Date.parse(q.at) < Date.parse("2026-10-12T07:00:00Z"),
      `${q.quoteId} valt in het menselijk getempode blok en mag niet uitgesloten zijn`
    );
  }
});

// ── Werking in de beslislaag ─────────────────────────────────────────────────

test("uitgesloten quotes vallen uit de populatie, de rest blijft", () => {
  const test1 = EXCLUDED_TEST_TRAFFIC[0]!.quoteId;
  const test2 = EXCLUDED_TEST_TRAFFIC[1]!.quoteId;
  const echt = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  const r = selectDecisionPopulation([obs(test1), obs(test2), obs(echt)], {
    excludedQuoteIds: EXCLUDED_TEST_QUOTE_IDS,
  });

  assert.equal(r.excludedAsTestTraffic, 2);
  assert.equal(r.population.length + r.legacy.length >= 1, true);
  assert.ok(
    [...r.population, ...r.legacy].every((o) => o.quoteId === echt),
    "alleen het echte verkeer mag overblijven"
  );
});

test("zonder de set wordt er niets uitgesloten, en dat is zichtbaar", () => {
  const r = selectDecisionPopulation([obs(EXCLUDED_TEST_TRAFFIC[0]!.quoteId)], {});
  assert.equal(r.excludedAsTestTraffic, 0, "geen stille uitsluiting zonder opdracht");
});

test("een observatie zonder quoteId blijft altijd staan", () => {
  const r = selectDecisionPopulation([obs(null)], { excludedQuoteIds: EXCLUDED_TEST_QUOTE_IDS });
  assert.equal(r.excludedAsTestTraffic, 0);
  assert.equal(r.population.length + r.legacy.length, 1);
});

test("includeAll laat alles staan, uitsluitend voor debugging", () => {
  const r = selectDecisionPopulation([obs(EXCLUDED_TEST_TRAFFIC[0]!.quoteId)], {
    excludedQuoteIds: EXCLUDED_TEST_QUOTE_IDS,
    includeAll: true,
  });
  assert.equal(r.excludedAsTestTraffic, 0);
});

test("uitsluiting raakt ook matched legs, niet alleen evaluated", () => {
  const q = EXCLUDED_TEST_TRAFFIC[2]!.quoteId;
  const r = selectDecisionPopulation([obs(q, { matched: true }), obs(q, { matched: true })], {
    excludedQuoteIds: EXCLUDED_TEST_QUOTE_IDS,
  });
  assert.equal(r.excludedAsTestTraffic, 2);
  assert.equal([...r.population, ...r.legacy].filter((o) => o.matched).length, 0);
});

// ── Architectuur- en wiring-locks ────────────────────────────────────────────

test("de meetlaag blijft puur: geen enkele import", () => {
  const src = readFileSync(new URL("./event-shadow-report.ts", import.meta.url), "utf8");
  const imports = src.split(/\r?\n/).filter((l) => /^\s*import\s/.test(l));
  assert.deepEqual(imports, [], "event-shadow-report.ts moet IO- en importvrij blijven");
});

test("de leeslaag geeft de uitsluitingslijst daadwerkelijk mee", () => {
  // Zonder deze wiring zouden de poorten het verificatieverkeer blijven meetellen.
  const src = readFileSync(new URL("../../scripts/event-shadow-report.ts", import.meta.url), "utf8");
  assert.match(src, /EXCLUDED_TEST_QUOTE_IDS/, "lijst wordt geïmporteerd");
  assert.match(src, /excludedQuoteIds:\s*EXCLUDED_TEST_QUOTE_IDS/, "lijst wordt meegegeven");
  assert.match(src, /excludedAsTestTraffic/, "het aantal wordt gerapporteerd");
});

test("de lijst wijzigt geen historische observatie — alleen selectie", () => {
  const ruw = readFileSync(new URL("./event-shadow-test-traffic.ts", import.meta.url), "utf8");
  // Commentaar eruit: de toelichting bénoemt `is_synthetic = false` als oorzaak
  // van het probleem, en die uitleg mag de scan niet laten afgaan.
  const code = ruw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n")
    .toLowerCase();

  for (const verboden of ["update ", "delete ", "insert ", "is_synthetic ="]) {
    assert.ok(!code.includes(verboden), `mag geen mutatie bevatten: ${verboden}`);
  }
  // En de module mag niets kunnen schrijven: geen client, geen supabase.
  for (const verboden of ["supabase", "createclient", "from("]) {
    assert.ok(!code.includes(verboden), `mag geen databasetoegang bevatten: ${verboden}`);
  }
});
