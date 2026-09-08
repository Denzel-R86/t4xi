// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY. Observatielaag voor het evenemententarief (Phase 6).
//
// Schrijft per GEËVALUEERD ritdeel één regel naar pricing_event_shadow_logs —
// in shadow én in live, zodat beide met dezelfde meetlat te vergelijken zijn.
// Ook een ritdeel ZONDER match wordt vastgelegd: zonder noemer is er geen
// matchratio en dus geen oordeel over de zonering.
//
// PRIVACY BY CONSTRUCTION
//   Dit bestand kan geen adres lekken omdat het er geen kent: de invoer bestaat
//   uitsluitend uit het al berekende EventFeeResult, de quote-UUID en de
//   prijsbron. Geen pickup/dropoff, geen postcode, geen coördinaat, geen naam.
//   (`pricing_quote_logs` draagt die velden wél — daarom staat deze observatie
//   bewust in een eigen tabel; zie de migratie voor de volledige motivatie.)
//
// NOOIT BLOKKEREND
//   Een mislukte observatie mag een offerte nooit breken. Alle fouten worden
//   ingeslikt; de prijs is en blijft leidend. Een try/catch dekt alleen fouten,
//   niet een insert die blíjft hangen — daarom staat er ook een harde timeout
//   omheen. Zonder die grens zou een trage of vastgelopen databaseverbinding de
//   offerte alsnog laten wachten.
// ─────────────────────────────────────────────────────────────────────────────
import { createPricingLogClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/lib/types/database";
import type { EventFeeResult } from "@/lib/pricing/event-fee";
import type { EventPricingMode } from "@/lib/pricing/event-pricing";

export type EventShadowObservation = {
  /** Nooit 'off': in die modus wordt er niets berekend en dus niets gelogd. */
  readonly mode: Exclude<EventPricingMode, "off">;
  /** Server-side quote-UUID; null op het boekingspad zonder quoteId. */
  readonly quoteId: string | null;
  readonly leg: "outbound" | "return";
  readonly pricingSource: string | null;
  /** De normale ritprijs waarop de toeslag zou zijn gekomen, in hele centen. */
  readonly baseSubtotalCents: number | null;
  /**
   * True voor test-, verificatie- en diagnostische flows. Zulke observaties
   * tellen NOOIT mee voor de bewijsdrempels van de meetperiode. Normaal
   * klantverkeer laat dit op false — de default, zodat je synthetisch verkeer
   * expliciet moet aanzetten en nooit per ongeluk als echt telt.
   */
  readonly synthetic?: boolean;
  readonly result: EventFeeResult;
};

export type EventShadowObservationRow = TablesInsert<"pricing_event_shadow_logs">;

/** Injecteerbaar voor tests; default schrijft naar Supabase met de service-role. */
export type EventShadowObservationDeps = {
  write?: (row: EventShadowObservationRow) => Promise<void>;
  /** Injecteerbaar voor tests; default SHADOW_LOG_TIMEOUT_MS. */
  timeoutMs?: number;
};

/** Pure projectie van een observatie naar de databaserij. Bevat geen adresdata. */
export function observationRow(entry: EventShadowObservation): EventShadowObservationRow {
  const { result } = entry;
  const unique = <T,>(values: readonly T[]): T[] => [...new Set(values)];
  return {
    mode: entry.mode,
    quote_id: entry.quoteId,
    leg: entry.leg,
    pricing_source: entry.pricingSource,
    matched: result.matches.length > 0,
    impact_level: result.level,
    // `amount_cents` is het EFFECTIEVE bedrag ná de cap; `configured_fee_cents`
    // legt vast wat er op dat moment geconfigureerd stond. Samen maken ze het
    // toegepaste beleid achteraf herleidbaar zonder de configuratie te moeten
    // reconstrueren.
    amount_cents: result.amountCents,
    configured_fee_cents: result.configuredFeeCents,
    max_uplift_pct: result.maxUpliftPct,
    base_subtotal_cents: entry.baseSubtotalCents,
    is_synthetic: entry.synthetic === true,
    concurrent_event_count: result.concurrentEventCount,
    upgrade_applied: result.upgradeApplied,
    capped_by_max_level: result.cappedByMaxLevel,
    event_slugs: unique(result.matches.map((m) => m.eventSlug)),
    window_ids: unique(result.matches.map((m) => m.windowId)),
    zone_types: unique(result.matches.map((m) => m.zoneType)),
    match_sides: unique(result.matches.map((m) => m.side)),
  };
}

/**
 * Timeoutbudget voor het wegschrijven van observaties.
 *
 * Krapper dan het laadbudget (800ms): dit is één insert zonder retry, en hij
 * gebeurt NA de prijsberekening. Alles wat hier wordt gewacht is pure extra
 * latency voor de klant zonder enige invloed op de prijs. Wordt het budget
 * overschreden, dan verliezen we één observatie — dat is de goedkoopste van de
 * twee kosten.
 */
export const SHADOW_LOG_TIMEOUT_MS = 400;

/** Verwerpt na `ms`; breekt de onderliggende insert niet af, laat hem los. */
export function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`shadow log exceeded ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e as Error);
      }
    );
  });
}

/**
 * Legt één of meer observaties vast. Best-effort en niet-blokkerend: zonder
 * service-role client, bij een databasefout én bij een hangende verbinding
 * gebeurt er simpelweg niets.
 */
export async function recordEventShadowLog(
  entries: readonly EventShadowObservation[],
  deps: EventShadowObservationDeps = {}
): Promise<void> {
  if (entries.length === 0) return;
  const rows = entries.map(observationRow);
  try {
    // De timeout omvat bewust ook `createPricingLogClient()` en het opbouwen
    // van de query: elke stap hier zit in het live quotepad en mag daar geen
    // onbegrensde wachttijd introduceren.
    await withDeadline(
      (async () => {
        if (deps.write) {
          for (const row of rows) await deps.write(row);
          return;
        }
        const client = createPricingLogClient();
        if (!client) return;
        await client.from("pricing_event_shadow_logs").insert(rows);
      })(),
      deps.timeoutMs ?? SHADOW_LOG_TIMEOUT_MS
    );
  } catch {
    // Observatie is nooit belangrijker dan de offerte. Geldt voor een
    // databasefout, een ontbrekende client én een overschreden deadline.
  }
}
