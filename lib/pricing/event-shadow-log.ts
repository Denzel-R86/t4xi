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
//   ingeslikt; de prijs is en blijft leidend.
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
 * Legt één of meer observaties vast. Best-effort en niet-blokkerend: zonder
 * service-role client of bij een databasefout gebeurt er simpelweg niets.
 */
export async function recordEventShadowLog(
  entries: readonly EventShadowObservation[],
  deps: EventShadowObservationDeps = {}
): Promise<void> {
  if (entries.length === 0) return;
  const rows = entries.map(observationRow);
  try {
    if (deps.write) {
      for (const row of rows) await deps.write(row);
      return;
    }
    const client = createPricingLogClient();
    if (!client) return;
    await client.from("pricing_event_shadow_logs").insert(rows);
  } catch {
    // Observatie is nooit belangrijker dan de offerte.
  }
}
