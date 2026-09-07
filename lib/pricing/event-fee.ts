// ─────────────────────────────────────────────────────────────────────────────
// Pure, IO-vrije bepaling van het evenemententarief (Phase 3). Rekent
// uitsluitend in HELE CENTEN — nooit floats-als-euro's — en is volledig
// deterministisch: alle evenementen, vensters, zones, tarieven en configuratie
// worden INGEGEVEN, nooit hier geladen. Geen Supabase, geen Google, geen klok.
//
// PER RITDEEL, niet per boeking: een retour naar en vanaf hetzelfde festival
// heeft twee verschillende ophaaltijden én omgekeerde ophaal-/afzetlocaties.
// De caller (Phase 4) roept deze functie daarom één keer per ritdeel aan, met
// voor het retourdeel de omgedraaide context — precies zoals het nachttarief
// `night_outbound`/`night_return` per ritdeel bepaalt.
//
// Het resultaat is ADDITIEF: `amountCents` komt bovenop de normale ritprijs en
// vervangt of vermenigvuldigt die nooit. Bij meerdere gelijktijdige
// evenementen worden tarieven NOOIT opgeteld — het hoogste toepasselijke
// niveau wint (zie resolveEventFee).
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeGemeenteNaam } from "@/lib/pricing/service-area";
import {
  EMPTY_LOCATION_CONTEXT,
  normalizeLocality,
  type PricingLocationContext,
} from "@/lib/pricing/location-context";
import {
  EVENT_IMPACT_LEVELS,
  eventImpactRank,
  type EventFeeRules,
  type EventImpactLevel,
  type EventPricingConfig,
  type EventZoneType,
  type PricingEvent,
  type PricingEventWindow,
  type PricingEventZone,
} from "@/lib/pricing/event-pricing";

/**
 * Statussen waarbij een evenement überhaupt mee mag prijzen. Bewust een
 * ALLOWLIST (fail-closed): 'cancelled' spreekt voor zich, 'completed' hoort
 * in het verleden te liggen en 'verification_required' betekent dat de bron
 * tegenstrijdig of verdwenen is — dan liever geen toeslag dan een toeslag op
 * een evenement dat misschien niet doorgaat.
 */
const PRICEABLE_STATUSES = new Set<PricingEvent["status"]>(["expected", "confirmed", "changed"]);

/**
 * Eén kant van een ritdeel. Sinds Phase 5.5 exact de genormaliseerde
 * locatiecontext uit lib/pricing/location-context.ts — geen tweede vorm van
 * "wat weten we over deze kant van de rit".
 */
export type EventLegEndpoint = PricingLocationContext;

/** Eén ritdeel: waar het vertrekt, waar het aankomt en wanneer het VERTREKT. */
export type EventLegContext = {
  readonly pickup: EventLegEndpoint;
  readonly dropoff: EventLegEndpoint;
  /** Ophaalmoment van dít ritdeel. Bepaalt welke vensters van toepassing zijn. */
  readonly departureAt: Date;
};

export type EventFeeInput = {
  readonly leg: EventLegContext;
  readonly events: readonly PricingEvent[];
  readonly windows: readonly PricingEventWindow[];
  readonly zones: readonly PricingEventZone[];
  readonly rules: EventFeeRules;
  readonly config: EventPricingConfig;
  /**
   * Ritsubtotaal waartegen de uplift-cap wordt gerekend (quote.priceCents).
   * `null` → geen cap toepasbaar, het vlakke tarief blijft staan.
   *
   * LET OP bij een retour: dit is de prijs van de HELE boeking, niet van het
   * losse ritdeel. Elk ritdeel wordt dus tegen dezelfde noemer gecapt. Dat is
   * bewust dezelfde noemer die de meetlaag voor proportionaliteit gebruikt,
   * zodat cap en poort 9 niet uiteen kunnen lopen.
   */
  readonly baselineSubtotalCents: number | null;
};

/**
 * Eén vastgestelde reden waarom het tarief van toepassing is. Bewaart precies
 * genoeg om later te kunnen beantwoorden: welk evenement, welk venster, welke
 * zone en welke kant van de rit. Bevat GEEN adres- of persoonsgegevens.
 */
export type EventFeeMatch = {
  readonly eventId: string;
  readonly eventSlug: string;
  readonly eventName: string;
  readonly windowId: string;
  readonly zoneId: string;
  /** Welke matcher de zone gebruikte — nodig om zonering per soort te beoordelen. */
  readonly zoneType: EventZoneType;
  readonly side: "pickup" | "dropoff";
  readonly level: EventImpactLevel;
};

export type EventFeeResult = {
  /** Het uiteindelijk toegepaste niveau ná overlap-resolutie en cap. */
  readonly level: EventImpactLevel;
  /** EFFECTIEF bedrag in HELE CENTEN, ná de uplift-cap. Dit is wat telt. */
  readonly amountCents: number;
  /** Het geconfigureerde bedrag vóór de cap — observability, nooit de prijs. */
  readonly configuredFeeCents: number;
  /** De toegepaste cap, of null wanneer er geen gold. */
  readonly maxUpliftPct: number | null;
  /** True als de cap het bedrag daadwerkelijk heeft verlaagd. */
  readonly capApplied: boolean;
  /** Aantal ONDERSCHEIDEN evenementen dat op dit ritdeel van toepassing is. */
  readonly concurrentEventCount: number;
  /** True als het niveau één stap is verhoogd wegens gelijktijdige evenementen. */
  readonly upgradeApplied: boolean;
  /** True als `maxImpactLevel` het niveau daadwerkelijk heeft afgetopt. */
  readonly cappedByMaxLevel: boolean;
  /** Alle vastgestelde redenen, ongesorteerd-stabiel in invoervolgorde. */
  readonly matches: readonly EventFeeMatch[];
};

const NO_FEE: EventFeeResult = {
  level: "none",
  amountCents: 0,
  configuredFeeCents: 0,
  maxUpliftPct: null,
  capApplied: false,
  concurrentEventCount: 0,
  upgradeApplied: false,
  cappedByMaxLevel: false,
  matches: [],
};

/** Triviale normalisatie van een route-slug — geen fuzzy matching. */
function normalizeSlug(value: string): string {
  return value.trim().toLowerCase();
}

/** Half-open venster: `startsAt <= t < endsAt`, zodat aansluitende vensters niet dubbeltellen. */
function windowCovers(window: PricingEventWindow, at: number): boolean {
  const start = Date.parse(window.startsAt);
  const end = Date.parse(window.endsAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return at >= start && at < end;
}

/**
 * Matcht één zone tegen één kant van het ritdeel. Exact, nooit fuzzy: een
 * ontbrekend gegeven (bv. geen PDOK-gemeente omdat de lookup faalde) matcht
 * NIET — fail-closed, nooit een gok naar het dichtstbijzijnde evenement.
 */
function zoneMatchesEndpoint(zone: PricingEventZone, endpoint: EventLegEndpoint): boolean {
  switch (zone.zoneType) {
    case "location_slug":
      return (
        zone.locationSlug !== null &&
        endpoint.locationSlug !== null &&
        normalizeSlug(zone.locationSlug) === normalizeSlug(endpoint.locationSlug)
      );
    case "locality":
      return (
        zone.locality !== null &&
        endpoint.locality !== null &&
        normalizeLocality(zone.locality) === normalizeLocality(endpoint.locality)
      );
    case "gemeente":
      return (
        zone.gemeenteNaam !== null &&
        endpoint.gemeente !== null &&
        normalizeGemeenteNaam(zone.gemeenteNaam) === normalizeGemeenteNaam(endpoint.gemeente)
      );
    case "postcode4":
      return zone.postcode4 !== null && endpoint.postcode4 !== null && zone.postcode4 === endpoint.postcode4;
    default:
      return false;
  }
}

/** Geldt deze zone voor de opgegeven kant van de rit? */
function zoneAppliesToSide(zone: PricingEventZone, side: "pickup" | "dropoff"): boolean {
  return zone.direction === "both" || zone.direction === side;
}

/** Eén niveau omhoog, begrensd door het hoogste bestaande niveau. */
function nextLevelUp(level: EventImpactLevel): EventImpactLevel {
  const next = EVENT_IMPACT_LEVELS[Math.min(eventImpactRank(level) + 1, EVENT_IMPACT_LEVELS.length - 1)];
  return next ?? level;
}

function higher(a: EventImpactLevel, b: EventImpactLevel): EventImpactLevel {
  return eventImpactRank(b) > eventImpactRank(a) ? b : a;
}

/**
 * Bepaalt het evenemententarief voor ÉÉN ritdeel.
 *
 * Volgorde:
 *   1. kill switch uit           → geen toeslag, gedrag identiek aan vóór deze module
 *   2. alleen vrijgegeven evenementen met een prijsbare status
 *   3. alleen vensters die het ophaalmoment van dít ritdeel omvatten
 *   4. alleen zones die de ophaal- of afzetkant daadwerkelijk raken
 *   5. per match: zone-override, anders het vensterniveau van die kant
 *   6. HOOGSTE niveau wint — nooit optellen bij overlap
 *   7. optioneel één stap omhoog bij genoeg gelijktijdige zware evenementen
 *   8. aftoppen op `maxImpactLevel`
 *   9. bedrag opzoeken in de INGEGEVEN tariefregels (nooit hardcoded)
 *
 * Retourneert altijd een volledig resultaat; "geen toeslag" is niveau "none"
 * met 0 cent, nooit een fout.
 */
export function resolveEventFee(input: EventFeeInput): EventFeeResult {
  const { leg, events, windows, zones, rules, config, baselineSubtotalCents } = input;
  // UITSLUITEND 'off' haakt hier af. In 'shadow' wordt alles hieronder normaal
  // doorlopen; het verschil zit puur in wat de caller met het resultaat doet.
  // Er is dus geen tweede, afwijkende shadow-berekening.
  if (config.mode === "off") return NO_FEE;

  const at = leg.departureAt.getTime();
  if (Number.isNaN(at)) return NO_FEE;

  const priceableEventById = new Map<string, PricingEvent>();
  for (const event of events) {
    if (event.pricingEnabled && PRICEABLE_STATUSES.has(event.status)) {
      priceableEventById.set(event.id, event);
    }
  }
  if (priceableEventById.size === 0) return NO_FEE;

  const zonesByEventId = new Map<string, PricingEventZone[]>();
  for (const zone of zones) {
    if (!priceableEventById.has(zone.eventId)) continue;
    const list = zonesByEventId.get(zone.eventId);
    if (list) list.push(zone);
    else zonesByEventId.set(zone.eventId, [zone]);
  }

  const matches: EventFeeMatch[] = [];
  // Hoogste niveau per evenement — de basis voor zowel "hoogste wint" als voor
  // de telling van gelijktijdige evenementen (één evenement telt één keer, ook
  // als het via meerdere zones of vensters matcht).
  const levelByEventId = new Map<string, EventImpactLevel>();

  for (const window of windows) {
    const event = priceableEventById.get(window.eventId);
    if (!event) continue;
    if (!windowCovers(window, at)) continue;
    const eventZones = zonesByEventId.get(window.eventId);
    if (!eventZones) continue;

    for (const zone of eventZones) {
      for (const side of ["pickup", "dropoff"] as const) {
        if (!zoneAppliesToSide(zone, side)) continue;
        if (!zoneMatchesEndpoint(zone, side === "pickup" ? leg.pickup : leg.dropoff)) continue;

        const windowLevel = side === "pickup" ? window.pickupImpactLevel : window.dropoffImpactLevel;
        const level = zone.impactOverride ?? windowLevel;
        if (level === "none") continue;

        matches.push({
          eventId: event.id,
          eventSlug: event.slug,
          eventName: event.name,
          windowId: window.id,
          zoneId: zone.id,
          zoneType: zone.zoneType,
          side,
          level,
        });
        const known = levelByEventId.get(event.id);
        levelByEventId.set(event.id, known ? higher(known, level) : level);
      }
    }
  }

  if (levelByEventId.size === 0) return NO_FEE;

  let level: EventImpactLevel = "none";
  for (const eventLevel of levelByEventId.values()) level = higher(level, eventLevel);

  // Gelijktijdigheid: tel de ONDERSCHEIDEN evenementen die zelf al zwaar genoeg
  // wegen. Twee zones van hetzelfde festival zijn geen twee evenementen.
  const concurrentEventCount = levelByEventId.size;
  let upgradeApplied = false;
  if (config.concurrentUpgradeEnabled) {
    const minRank = eventImpactRank(config.concurrentUpgradeMinLevel);
    let qualifying = 0;
    for (const eventLevel of levelByEventId.values()) {
      if (eventImpactRank(eventLevel) >= minRank) qualifying += 1;
    }
    if (qualifying >= config.concurrentUpgradeMinEvents) {
      const upgraded = nextLevelUp(level);
      if (upgraded !== level) {
        level = upgraded;
        upgradeApplied = true;
      }
    }
  }

  // `maxImpactLevel` is een GLOBALE bovengrens, niet alleen op de upgrade: het
  // is de enige knop waarmee de module getemperd kan worden zonder haar uit te
  // zetten of alle evenementen te herconfigureren.
  const maxRank = eventImpactRank(config.maxImpactLevel);
  const cappedByMaxLevel = eventImpactRank(level) > maxRank;
  if (cappedByMaxLevel) level = config.maxImpactLevel;

  // Bedrag komt UITSLUITEND uit de ingegeven tariefregels. Ontbreekt het niveau
  // daar, dan is er geen toeslag — nooit een geraden bedrag.
  const rule = rules.get(level) ?? null;
  const configuredFeeCents = rule?.feeCents ?? 0;
  const maxUpliftPct = rule?.maxUpliftPct ?? null;

  // Hybride cap: het vaste bedrag blijft staan tot het onevenredig wordt ten
  // opzichte van de ritprijs. Geen ondergrens — als een korte rit maar een klein
  // bedrag toelaat, is dat de uitkomst.
  // Naar BENEDEN afronden, niet naar het dichtstbijzijnde. Bij afronden kan de
  // uitkomst de cap met een fractie overschrijden (€99,99 × 40% = 3999,6 → 4000
  // = 40,004%), waardoor een rit eeuwig in de beoordelingsband van poort 9 zou
  // blijven hangen. Een cap hoort een strikt plafond te zijn; de prijs van die
  // correctheid is hooguit één cent.
  const ceilingCents =
    maxUpliftPct !== null && baselineSubtotalCents !== null && baselineSubtotalCents > 0
      ? Math.floor((baselineSubtotalCents * maxUpliftPct) / 100)
      : null;
  const amountCents = ceilingCents === null ? configuredFeeCents : Math.min(configuredFeeCents, ceilingCents);

  return {
    level,
    amountCents,
    configuredFeeCents,
    maxUpliftPct,
    capApplied: amountCents < configuredFeeCents,
    concurrentEventCount,
    upgradeApplied,
    cappedByMaxLevel,
    matches,
  };
}

// ── Contextopbouw uit de bestaande quote-gegevens ────────────────────────────
// Alles hieronder is PUUR: er wordt niets opgezocht, geocodeerd of bevraagd.
// De genormaliseerde context zelf wordt gebouwd in location-context.ts.

/** Wat de quote-pijplijn over een rit weet op het moment dat het tarief bepaald wordt. */
export type EventLegSource = {
  /** Genormaliseerde context van het OPHAALPUNT van de heenrit. */
  readonly pickup: PricingLocationContext;
  /** Genormaliseerde context van de BESTEMMING van de heenrit. */
  readonly dropoff: PricingLocationContext;
  /** Vertrek van de heenrit als absoluut UTC-instant (ISO-8601). */
  readonly departureAt: string | null | undefined;
  /** Vertrek van de retourrit als absoluut UTC-instant; alleen bij een retour. */
  readonly returnDepartureAt: string | null | undefined;
  /** Is er daadwerkelijk een retourdeel geprijsd? */
  readonly returnApplied: boolean;
};

function toInstant(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Bouwt de ritdeel-contexten. Het retourdeel is de heenrit met OMGEDRAAIDE
 * kanten: wie op de heenrit werd afgezet, wordt op de terugrit opgehaald. Alle
 * geografische kennis van een kant reist dus mee naar de andere zijde van het
 * retourdeel — inclusief de gemeente, die alleen voor het oorspronkelijke
 * ophaaladres bekend is.
 *
 * `null` betekent: voor dat ritdeel is geen tijdstip bekend, dus geen
 * evenemententarief — zelfde fail-open-gedrag als het nachttarief bij een
 * ontbrekende ophaaltijd (bv. de homepage-hero zonder datum/tijd).
 */
export function buildEventLegs(source: EventLegSource): {
  outbound: EventLegContext | null;
  returnLeg: EventLegContext | null;
} {
  const pickup = source.pickup ?? EMPTY_LOCATION_CONTEXT;
  const dropoff = source.dropoff ?? EMPTY_LOCATION_CONTEXT;
  const outboundAt = toInstant(source.departureAt);
  const returnAt = toInstant(source.returnDepartureAt);

  return {
    outbound: outboundAt ? { pickup, dropoff, departureAt: outboundAt } : null,
    returnLeg:
      source.returnApplied && returnAt
        ? { pickup: dropoff, dropoff: pickup, departureAt: returnAt }
        : null,
  };
}

// ── Onveranderlijke verklaring voor de snapshot ──────────────────────────────

/**
 * Minimale, PII-vrije verklaring die bij de adjustment wordt opgeslagen
 * (price_snapshot_adjustments.metadata). Bevat uitsluitend interne
 * identifiers — nooit een adres, naam of ander klantgegeven.
 */
export type EventFeeAdjustmentMetadata = {
  readonly level: EventImpactLevel;
  readonly amountCents: number;
  /** Geconfigureerd bedrag vóór de cap — maakt het beleid achteraf herleidbaar. */
  readonly configuredFeeCents: number;
  readonly maxUpliftPct: number | null;
  readonly capApplied: boolean;
  readonly concurrentEventCount: number;
  readonly upgradeApplied: boolean;
  readonly cappedByMaxLevel: boolean;
  readonly matches: readonly {
    readonly eventId: string;
    readonly eventSlug: string;
    readonly eventName: string;
    readonly windowId: string;
    readonly zoneId: string;
    readonly zoneType: EventZoneType;
    readonly side: "pickup" | "dropoff";
    readonly level: EventImpactLevel;
  }[];
};

/** Pure projectie van een EventFeeResult naar de op te slaan verklaring. */
export function eventFeeMetadata(result: EventFeeResult): EventFeeAdjustmentMetadata {
  return {
    level: result.level,
    amountCents: result.amountCents,
    configuredFeeCents: result.configuredFeeCents,
    maxUpliftPct: result.maxUpliftPct,
    capApplied: result.capApplied,
    concurrentEventCount: result.concurrentEventCount,
    upgradeApplied: result.upgradeApplied,
    cappedByMaxLevel: result.cappedByMaxLevel,
    matches: result.matches.map((m) => ({
      eventId: m.eventId,
      eventSlug: m.eventSlug,
      eventName: m.eventName,
      windowId: m.windowId,
      zoneId: m.zoneId,
      zoneType: m.zoneType,
      side: m.side,
      level: m.level,
    })),
  };
}
