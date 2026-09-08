// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY. Leeslaag voor de Event Pricing-configuratie (Phase 4). Haalt de
// evenementen, tijdvensters, zones, tariefregels en moduleconfiguratie op en
// levert die AAN `resolveEventFee()` — meer niet.
//
// Bewust GEEN businesslogica hier: geen matching, geen niveaubepaling, geen
// bedragen, geen kloklogica anders dan het ene `now`-moment dat bepaalt welke
// rijen nog relevant zijn. Geen externe API's, geen scraping, geen geocoding.
//
// Historie wordt niet geladen: evenementen waarvan de laatste dag al voorbij
// is, vallen buiten de query (partiële index pricing_events_enabled_ends_at_idx).
// Ze blijven wél in de database staan voor latere analyse.
// ─────────────────────────────────────────────────────────────────────────────
import { createPricingLogClient, type PricingSupabaseClient } from "@/lib/supabase/server";
import { cachedLoader, withRetryOnce } from "@/lib/pricing/service";
import {
  isEventImpactLevel,
  isEventPricingMode,
  isEventStatus,
  type EventFeeRule,
  type EventFeeRules,
  type EventImpactLevel,
  type EventPricingConfig,
  type PricingEvent,
  type PricingEventWindow,
  type PricingEventZone,
} from "@/lib/pricing/event-pricing";

/**
 * Alles wat `resolveEventFee()` nodig heeft, in één momentopname. `null` als
 * bron betekent nooit "geen toeslag by accident": een mislukte load levert
 * `null` op en de caller behandelt dat expliciet als "geen evenemententarief"
 * (fail-open op de PRIJS — liever niets in rekening brengen dan een bedrag op
 * gegevens die we niet hebben kunnen bevestigen).
 */
export type EventPricingData = {
  readonly config: EventPricingConfig;
  readonly events: readonly PricingEvent[];
  readonly windows: readonly PricingEventWindow[];
  readonly zones: readonly PricingEventZone[];
  readonly rules: EventFeeRules;
};

/**
 * Statussen die überhaupt kunnen prijzen — spiegelt PRICEABLE_STATUSES in
 * event-fee.ts. Hier uitsluitend om de query te versmallen; de beslissing
 * blijft in de rekenlaag, zodat er nooit twee waarheden ontstaan.
 */
const PRICEABLE_STATUSES = ["expected", "confirmed", "changed"] as const;

/**
 * Timeoutbudget voor het laden. Ruimer dan het shadow-budget (400ms) omdat dit
 * drie opeenvolgende round trips zijn (config → evenementen → vensters+zones),
 * en krapper dan de routing-call. Dankzij de cache raakt dit budget hooguit
 * één keer per TTL een verzoek; faalt het toch, dan is er simpelweg geen
 * evenemententarief.
 */
export const EVENT_LOAD_TIMEOUT_MS = 800;
export const EVENT_LOAD_RETRY_TIMEOUT_MS = 800;

/**
 * Cache-TTL: 60 seconden, gelijk aan SHADOW_CONFIG_CACHE_TTL_MS voor de
 * deadhead-configuratie. Bewust conservatief:
 *
 *  • evenementdata verandert in de praktijk hooguit een paar keer per week,
 *    dus vier tabellen per offerte opnieuw ophalen is pure verspilling;
 *  • een wijziging — een nieuw tarief, een geannuleerd evenement, of het
 *    omzetten van de kill switch — is binnen een minuut overal actief. Een
 *    langere TTL zou betekenen dat een uitgezette module nog minutenlang door
 *    blijft prijzen, en dat is precies het gedrag dat je bij een noodknop niet
 *    wilt;
 *  • de cache bevat UITSLUITEND configuratie: geen route-, adres- of
 *    klantgegevens.
 */
export const EVENT_PRICING_CACHE_TTL_MS = 60_000;

const CONFIG_COLS =
  "mode, concurrent_upgrade_enabled, concurrent_upgrade_min_events, concurrent_upgrade_min_level, max_impact_level";
const EVENT_COLS =
  "id, slug, name, category, city, venue, starts_at, ends_at, status, expected_attendance, source_url, source_name, source_type, source_priority, verification_status, last_verified_at, last_changed_at, requires_annual_confirmation, pricing_enabled";
const WINDOW_COLS =
  "id, event_id, starts_at, ends_at, event_phase, pickup_impact_level, dropoff_impact_level";
const ZONE_COLS =
  "id, event_id, zone_type, location_slug, gemeente_naam, locality, postcode4, direction, impact_override";

/** Modus 'off': het antwoord waarop resolveEventFee() direct afhaakt. */
const DISABLED: EventPricingData = {
  config: {
    mode: "off",
    concurrentUpgradeEnabled: false,
    concurrentUpgradeMinEvents: 2,
    concurrentUpgradeMinLevel: "high",
    maxImpactLevel: "extreme",
  },
  events: [],
  windows: [],
  zones: [],
  rules: new Map(),
};

function asLevel(value: unknown, fallback: EventImpactLevel): EventImpactLevel {
  return typeof value === "string" && isEventImpactLevel(value) ? value : fallback;
}

/**
 * Laadt de actuele Event Pricing-momentopname. Werkt in drie stappen zodat er
 * niets onnodigs over de lijn gaat:
 *
 *   1. configuratie — staat de kill switch uit, dan stopt het hier;
 *   2. vrijgegeven evenementen met een prijsbare status die nog niet voorbij zijn;
 *   3. de vensters en zones van UITSLUITEND die evenementen, parallel.
 *
 * Rijen met een onbekende enum-waarde worden overgeslagen (fail-closed): liever
 * een evenement dat niet meeprijst dan een niveau dat we niet kennen.
 */
export async function loadEventPricingData(
  client: PricingSupabaseClient,
  now: Date = new Date()
): Promise<EventPricingData> {
  const configRes = await client.from("pricing_event_config").select(CONFIG_COLS).eq("active", true).limit(1);
  if (configRes.error) throw configRes.error;
  const configRow = configRes.data?.[0];
  // Onbekende modus → behandelen als 'off' (fail-closed): liever niets doen dan
  // rekenen op een toestand die we niet kennen.
  if (!configRow || !isEventPricingMode(configRow.mode) || configRow.mode === "off") return DISABLED;

  const config: EventPricingConfig = {
    mode: configRow.mode,
    concurrentUpgradeEnabled: configRow.concurrent_upgrade_enabled,
    concurrentUpgradeMinEvents: configRow.concurrent_upgrade_min_events,
    concurrentUpgradeMinLevel: asLevel(configRow.concurrent_upgrade_min_level, "high"),
    maxImpactLevel: asLevel(configRow.max_impact_level, "extreme"),
  };

  const nowIso = now.toISOString();
  const [eventsRes, rulesRes] = await Promise.all([
    client
      .from("pricing_events")
      .select(EVENT_COLS)
      .eq("pricing_enabled", true)
      .in("status", [...PRICEABLE_STATUSES])
      .gte("ends_at", nowIso),
    client.from("pricing_event_fee_rules").select("impact_level, amount_cents, max_uplift_pct").eq("active", true),
  ]);
  if (eventsRes.error) throw eventsRes.error;
  if (rulesRes.error) throw rulesRes.error;

  const rules = new Map<EventImpactLevel, EventFeeRule>();
  for (const row of rulesRes.data ?? []) {
    if (!isEventImpactLevel(row.impact_level) || !Number.isInteger(row.amount_cents)) continue;
    // Een onbruikbare cap (0, negatief, boven 100) wordt genegeerd in plaats van
    // toegepast: liever het vlakke tarief dan een cap die we niet vertrouwen.
    const cap = row.max_uplift_pct;
    const usableCap = typeof cap === "number" && cap > 0 && cap <= 100 ? cap : null;
    rules.set(row.impact_level, { feeCents: row.amount_cents, maxUpliftPct: usableCap });
  }

  const events: PricingEvent[] = [];
  for (const row of eventsRes.data ?? []) {
    if (!isEventStatus(row.status)) continue;
    events.push({
      id: row.id,
      slug: row.slug,
      name: row.name,
      category: row.category as PricingEvent["category"],
      city: row.city,
      venue: row.venue,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      status: row.status,
      expectedAttendance: row.expected_attendance,
      sourceUrl: row.source_url,
      sourceName: row.source_name,
      sourceType: row.source_type as PricingEvent["sourceType"],
      sourcePriority: row.source_priority,
      verificationStatus: row.verification_status as PricingEvent["verificationStatus"],
      lastVerifiedAt: row.last_verified_at,
      lastChangedAt: row.last_changed_at,
      requiresAnnualConfirmation: row.requires_annual_confirmation,
      pricingEnabled: row.pricing_enabled,
    });
  }
  if (events.length === 0) return { config, events: [], windows: [], zones: [], rules };

  const eventIds = events.map((e) => e.id);
  const [windowsRes, zonesRes] = await Promise.all([
    client
      .from("pricing_event_windows")
      .select(WINDOW_COLS)
      .eq("active", true)
      .in("event_id", eventIds)
      .gte("ends_at", nowIso),
    client.from("pricing_event_zones").select(ZONE_COLS).eq("active", true).in("event_id", eventIds),
  ]);
  if (windowsRes.error) throw windowsRes.error;
  if (zonesRes.error) throw zonesRes.error;

  const windows: PricingEventWindow[] = [];
  for (const row of windowsRes.data ?? []) {
    if (!isEventImpactLevel(row.pickup_impact_level) || !isEventImpactLevel(row.dropoff_impact_level)) continue;
    windows.push({
      id: row.id,
      eventId: row.event_id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      phase: row.event_phase as PricingEventWindow["phase"],
      pickupImpactLevel: row.pickup_impact_level,
      dropoffImpactLevel: row.dropoff_impact_level,
    });
  }

  const zones: PricingEventZone[] = [];
  for (const row of zonesRes.data ?? []) {
    const override = row.impact_override;
    if (override !== null && !isEventImpactLevel(override)) continue;
    zones.push({
      id: row.id,
      eventId: row.event_id,
      zoneType: row.zone_type as PricingEventZone["zoneType"],
      locationSlug: row.location_slug,
      gemeenteNaam: row.gemeente_naam,
      locality: row.locality,
      postcode4: row.postcode4,
      direction: row.direction as PricingEventZone["direction"],
      impactOverride: override,
    });
  }

  return { config, events, windows, zones, rules };
}

/**
 * Gecachete, retryende loader — hetzelfde patroon als de deadhead-configuratie
 * in service.ts. De client wordt bij ELKE poging opnieuw gemaakt (goedkoop,
 * synchroon); uitsluitend het RESULTAAT wordt gecachet.
 *
 * Levert `null` wanneer er geen service-role client is of het laden faalt. De
 * caller vertaalt dat naar "geen evenemententarief" — nooit naar een fout die
 * de offerte breekt.
 */
export const loadCachedEventPricingData: () => Promise<EventPricingData | null> = cachedLoader(
  EVENT_PRICING_CACHE_TTL_MS,
  () =>
    withRetryOnce(
      async () => {
        const client = createPricingLogClient();
        if (!client) return null;
        return await loadEventPricingData(client);
      },
      EVENT_LOAD_TIMEOUT_MS,
      EVENT_LOAD_RETRY_TIMEOUT_MS
    ).catch(() => null)
);
