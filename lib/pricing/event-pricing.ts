// ─────────────────────────────────────────────────────────────────────────────
// Domeintypen voor het evenemententarief (Event Availability Pricing, Phase 2).
// PUUR en IO-VRIJ: uitsluitend typen, constanten en type-guards die het
// database-contract van 20260827120000_pricing_events.sql spiegelen. GEEN
// berekening (Phase 3), GEEN Supabase-toegang, GEEN koppeling aan de
// quote-pijplijn (Phase 4) — dit bestand mag daarom overal geïmporteerd worden.
//
// Commercieel uitgangspunt: het evenemententarief is een ADDITIEVE, vooraf
// vastgestelde beschikbaarheidsprijs bovenop de normale ritprijs — nooit een
// vermenigvuldiging van de basisprijs en nooit een dynamische surge. Het landt
// als één regel in de BESTAANDE snapshot-adjustments (zie snapshot.ts /
// PriceSnapshotAdjustment), zodat `total = subtotal + Σ adjustments` blijft
// gelden en de quote-lock ongewijzigd blijft werken.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stabiele codes van de evenement-adjustments in de prijs-snapshot — PER
 * RITDEEL, exact volgens het bestaande patroon van `night_outbound`/
 * `night_return` (zie NIGHT_ADJUSTMENT_CODES in snapshot.ts). Bewust geen
 * afwijkend patroon: een retour naar én vanaf hetzelfde evenement kan per
 * ritdeel een ander niveau hebben, en beide regels moeten los verklaarbaar
 * en los sommeerbaar blijven.
 *
 * Binnen ÉÉN ritdeel is er altijd hoogstens één regel, ook als meerdere
 * evenementen tegelijk spelen: tarieven worden nooit opgeteld, het hoogste
 * toepasselijke tarief wint (zie EventPricingConfig).
 */
export const EVENT_ADJUSTMENT_CODES = ["event_outbound", "event_return"] as const;
export type EventAdjustmentCode = (typeof EVENT_ADJUSTMENT_CODES)[number];

/** Spiegelbeeld van isNightAdjustmentCode() in snapshot.ts. */
export function isEventAdjustmentCode(code: string): boolean {
  return (EVENT_ADJUSTMENT_CODES as readonly string[]).includes(code);
}

/**
 * Impactniveaus, OPLOPEND van geen tot uitzonderlijk. De volgorde is
 * betekenisvol: `eventImpactRank()` leunt erop en "hoogste wint" is de
 * standaardresolutie bij overlappende evenementen.
 */
export const EVENT_IMPACT_LEVELS = ["none", "elevated", "high", "very_high", "extreme"] as const;
export type EventImpactLevel = (typeof EVENT_IMPACT_LEVELS)[number];

export function isEventImpactLevel(value: string): value is EventImpactLevel {
  return (EVENT_IMPACT_LEVELS as readonly string[]).includes(value);
}

/**
 * Positie van een niveau in de oplopende reeks (none = 0 … extreme = 4).
 * Uitsluitend een ORDENING — geen bedrag: wat een niveau kost staat in de
 * database (pricing_event_fee_rules), nooit in code.
 */
export function eventImpactRank(level: EventImpactLevel): number {
  return EVENT_IMPACT_LEVELS.indexOf(level);
}

/** Levenscyclus van een evenement; spiegelt de status-CHECK in de migratie. */
export const EVENT_STATUSES = [
  "expected",
  "confirmed",
  "changed",
  "cancelled",
  "completed",
  "verification_required",
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export function isEventStatus(value: string): value is EventStatus {
  return (EVENT_STATUSES as readonly string[]).includes(value);
}

/** Fase binnen een evenement; bepaalt niet zelf een tarief, wel de leesbaarheid. */
export const EVENT_PHASES = ["arrival", "active", "exit", "overnight", "departure", "custom"] as const;
export type EventPhase = (typeof EVENT_PHASES)[number];

export const EVENT_CATEGORIES = [
  "festival",
  "concert",
  "sports",
  "city_event",
  "public_holiday",
  "conference",
  "other",
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/**
 * Zonesoorten — bewust beperkt tot wat de prijspijplijn AL kent van een rit,
 * zonder extra externe aanroep. In volgorde van betrouwbaarheid:
 *
 *   location_slug → de opgeloste catalogus-slug (quote.route.pickupSlug/dropoffSlug)
 *   postcode4     → de vier cijfers uit het adreslabel; het scherpste signaal
 *                   voor een venue of een deel van een stad
 *   locality      → de woonplaats uit het adreslabel (Phase 5.5). Hiermee zijn
 *                   ook bestemmingen ZONDER catalogus-slug zoneerbaar
 *   gemeente      → officiële PDOK-gemeente; alleen beschikbaar wanneer de
 *                   aanrijcomponent die toch al heeft opgezocht, dus nooit de
 *                   primaire zonering
 *
 * Er is vandaag GEEN coördinaat van een vrij ingetypt ophaaladres, dus een
 * radius-match zou een extra geocode-aanroep per offerte kosten. Zodra die
 * coördinaat er wel is, is dat een additieve uitbreiding van dit type.
 */
export const EVENT_ZONE_TYPES = ["location_slug", "postcode4", "locality", "gemeente"] as const;
export type EventZoneType = (typeof EVENT_ZONE_TYPES)[number];

/** Een rit NAAR een festival is commercieel iets anders dan een rit VANAF datzelfde festival. */
export const EVENT_ZONE_DIRECTIONS = ["pickup", "dropoff", "both"] as const;
export type EventZoneDirection = (typeof EVENT_ZONE_DIRECTIONS)[number];

/** Bronautoriteit: 1 = organisator/officieel … 5 = overig. Lager = zwaarder. */
export const EVENT_SOURCE_TYPES = ["organiser", "venue", "municipality", "ticketing", "other"] as const;
export type EventSourceType = (typeof EVENT_SOURCE_TYPES)[number];

export const EVENT_VERIFICATION_STATUSES = ["unverified", "verified", "needs_review"] as const;
export type EventVerificationStatus = (typeof EVENT_VERIFICATION_STATUSES)[number];

/**
 * Eén evenement zoals de prijslaag het leest. `startsAt`/`endsAt` zijn
 * INFORMATIEF (de totale duur) en bepalen zelf geen prijs — dat doen
 * uitsluitend de vensters. `pricingEnabled` is fail-closed: false betekent dat
 * het evenement wel bestaat en bewaard blijft, maar geen enkele offerte raakt.
 */
export type PricingEvent = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly category: EventCategory;
  readonly city: string;
  readonly venue: string | null;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: EventStatus;
  readonly expectedAttendance: number | null;
  readonly sourceUrl: string | null;
  readonly sourceName: string | null;
  readonly sourceType: EventSourceType;
  readonly sourcePriority: number;
  readonly verificationStatus: EventVerificationStatus;
  readonly lastVerifiedAt: string | null;
  readonly lastChangedAt: string | null;
  /** True = datum elk jaar opnieuw bevestigen; nooit automatisch doorrollen. */
  readonly requiresAnnualConfirmation: boolean;
  readonly pricingEnabled: boolean;
};

/**
 * Prijsbepalend tijdvenster. Ophalen en afzetten hebben een EIGEN niveau —
 * er is bewust geen derde, generiek niveau dat ermee zou kunnen botsen. Een
 * venster dat alleen ophalen raakt, zet `dropoffImpactLevel` op "none".
 *
 * Overlappende vensters binnen hetzelfde evenement zijn toegestaan; de
 * hoogste toepasselijke waarde wint (resolutie volgt in Phase 3).
 */
export type PricingEventWindow = {
  readonly id: string;
  readonly eventId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly phase: EventPhase;
  readonly pickupImpactLevel: EventImpactLevel;
  readonly dropoffImpactLevel: EventImpactLevel;
};

/**
 * Geografische reikwijdte. Precies één identificerend veld is gevuld, passend
 * bij `zoneType` — database-side afgedwongen, zodat een zone nooit op twee
 * manieren tegelijk kan matchen.
 */
export type PricingEventZone = {
  readonly id: string;
  readonly eventId: string;
  readonly zoneType: EventZoneType;
  readonly locationSlug: string | null;
  readonly gemeenteNaam: string | null;
  readonly locality: string | null;
  readonly postcode4: number | null;
  readonly direction: EventZoneDirection;
  /** Afwijking van het vensterniveau voor déze zone; null = venster volgen. */
  readonly impactOverride: EventImpactLevel | null;
};

/**
 * Tariefregel per impactniveau. Beide waarden komen uit de database
 * (pricing_event_fee_rules) — nooit uit code.
 *
 * Sinds Phase 6.3.2 is het model HYBRIDE:
 *
 *     effectief tarief = min(feeCents, round(subtotaal × maxUpliftPct))
 *
 * Het vaste bedrag blijft dus intact op ritten die het dragen; alleen op korte
 * ritten, waar een vlak tarief richting 50–70% opslag ging, knijpt de cap.
 * Bewust geen ondergrens. `maxUpliftPct = null` betekent: geen cap, puur vlak.
 */
export type EventFeeRule = {
  /** Het geconfigureerde bedrag in HELE CENTEN, vóór de cap. */
  readonly feeCents: number;
  /** Bovengrens als percentage van het ritsubtotaal, of null voor geen cap. */
  readonly maxUpliftPct: number | null;
};

export type EventFeeRules = ReadonlyMap<EventImpactLevel, EventFeeRule>;

/**
 * Operationele toestand van de module. Drie expliciete waarden in één veld —
 * geen stapel booleans die elkaar kunnen tegenspreken:
 *
 *   off    → niets laden, niets berekenen, niets loggen. De noodknop.
 *   shadow → volledig berekenen en observeren, maar NOOIT afrekenen. De
 *            klantprijs is cent-identiek aan die zonder deze module.
 *   live   → berekenen, observeren én als adjustment aan de prijs toevoegen.
 *
 * Let op het verschil tussen 'off' en 'shadow': dit is precies waarom de
 * oorspronkelijke kill switch niet als shadow mode kon dienen. Die brak op
 * drie plekken af vóór de matching, dus er viel niets te observeren.
 */
export const EVENT_PRICING_MODES = ["off", "shadow", "live"] as const;
export type EventPricingMode = (typeof EVENT_PRICING_MODES)[number];

export function isEventPricingMode(value: string): value is EventPricingMode {
  return (EVENT_PRICING_MODES as readonly string[]).includes(value);
}

/**
 * Moduleconfiguratie. `mode` bepaalt of er wordt gerekend en of dat geld kost;
 * bij 'off' gedraagt de prijspijplijn zich exact zoals vóór deze module,
 * ongeacht de inhoud van de evenemententabellen.
 */
export type EventPricingConfig = {
  readonly mode: EventPricingMode;
  /**
   * Bij overlappende evenementen wordt NOOIT opgeteld. Standaard wint het
   * hoogste individuele tarief; staat dit aan, dan mag het niveau één stap
   * omhoog zodra er ten minste `concurrentUpgradeMinEvents` evenementen van
   * ten minste `concurrentUpgradeMinLevel` tegelijk op het ritdeel van
   * toepassing zijn.
   */
  readonly concurrentUpgradeEnabled: boolean;
  readonly concurrentUpgradeMinEvents: number;
  readonly concurrentUpgradeMinLevel: EventImpactLevel;
  /**
   * GLOBALE bovengrens op het toegepaste niveau — niet alleen op de upgrade.
   * De enige knop waarmee de module getemperd kan worden zonder haar uit te
   * zetten of alle evenementen opnieuw te configureren.
   */
  readonly maxImpactLevel: EventImpactLevel;
};

/**
 * Uitkomst per synchronisatieronde per bron (Phase 6). Uitsluitend tellingen
 * en bronaanduidingen — nooit adres-, klant- of persoonsgegevens.
 */
export type EventSyncLogEntry = {
  readonly source: string;
  readonly eventsSeen: number;
  readonly eventsAdded: number;
  readonly eventsChanged: number;
  readonly eventsCancelled: number;
  readonly eventsNeedingReview: number;
  readonly errorCount: number;
  readonly errorSummary: string | null;
  readonly durationMs: number;
};
