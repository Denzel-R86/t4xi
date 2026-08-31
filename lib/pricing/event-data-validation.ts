// ─────────────────────────────────────────────────────────────────────────────
// Pure, IO-vrije kwaliteitscontrole op EVENEMENTDATA (Phase 5). Bewaakt de
// regels die niet met een CHECK-constraint te vangen zijn omdat ze over
// SAMENHANG gaan: een vrijgegeven evenement zonder venster, een bevestigd
// evenement zonder bron, een zone zonder matcher.
//
// Uitgangspunt is de commerciële prioriteit van deze fase: een toeslag mag
// NOOIT bij de verkeerde klant terechtkomen. Alles wat die garantie niet
// aantoonbaar maakt, is een fout — niet een waarschuwing.
//
// Deze module beoordeelt DATA, niet prijzen: er wordt niets berekend en niets
// geladen. Ze is bedoeld voor de seed-review van Phase 5 en later hergebruik
// door de synchronisatie (Phase 6).
// ─────────────────────────────────────────────────────────────────────────────
import {
  eventImpactRank,
  isEventImpactLevel,
  type EventImpactLevel,
  type PricingEvent,
  type PricingEventWindow,
  type PricingEventZone,
} from "@/lib/pricing/event-pricing";

export type EventDataSeverity = "error" | "warning";

export type EventDataIssue = {
  readonly severity: EventDataSeverity;
  /** Stabiele regelcode, bruikbaar in rapportage en tests. */
  readonly rule: string;
  readonly eventSlug: string | null;
  readonly message: string;
};

export type EventDataSet = {
  readonly events: readonly PricingEvent[];
  readonly windows: readonly PricingEventWindow[];
  readonly zones: readonly PricingEventZone[];
};

/**
 * Operationeel startpunt van de eerste productieset. Evenementen waarvan élk
 * venster hiervóór ligt horen niet in de initiële seed: historie wordt niet
 * gereconstrueerd.
 */
export const SEED_CUTOFF_ISO = "2026-08-27T00:00:00.000Z";

/**
 * Vanaf hoeveel zones een zone-set als "breed" geldt. Geen wetenschappelijke
 * grens: een evenement dat tientallen slugs raakt is stadsbreed of landelijk,
 * en dat verdient bij een zwaar tarief een bewuste blik. Waarschuwing, geen
 * fout — Oud & Nieuw is terecht landelijk én zwaar.
 */
export const BROAD_ZONE_COUNT = 20;

/** Hoe lang een verificatie meegaat voordat ze opnieuw bekeken moet worden. */
export const VERIFICATION_MAX_AGE_DAYS = 180;

function ms(iso: string): number {
  return Date.parse(iso);
}

/** Overlappen twee half-open intervallen elkaar? */
function overlaps(a: PricingEventWindow, b: PricingEventWindow): boolean {
  return ms(a.startsAt) < ms(b.endsAt) && ms(b.startsAt) < ms(a.endsAt);
}

/** Heeft de zone daadwerkelijk iets om op te matchen? */
function zoneMatcher(zone: PricingEventZone): string | null {
  switch (zone.zoneType) {
    case "location_slug":
      return zone.locationSlug?.trim() ? zone.locationSlug : null;
    case "locality":
      return zone.locality?.trim() ? zone.locality : null;
    case "gemeente":
      return zone.gemeenteNaam?.trim() ? zone.gemeenteNaam : null;
    case "postcode4":
      return zone.postcode4 === null ? null : String(zone.postcode4);
    default:
      return null;
  }
}

/**
 * Controleert een volledige evenementdataset. Retourneert alle bevindingen in
 * een stabiele volgorde: eerst per evenement, daarna de dataset-brede regels.
 * Een lege lijst betekent dat de set voldoet aan het datakwaliteitsbeleid.
 */
export function validateEventData(
  data: EventDataSet,
  opts: { seedCutoff?: Date; now?: Date } = {}
): readonly EventDataIssue[] {
  const cutoff = (opts.seedCutoff ?? new Date(SEED_CUTOFF_ISO)).getTime();
  const now = (opts.now ?? new Date()).getTime();
  const issues: EventDataIssue[] = [];
  const add = (severity: EventDataSeverity, rule: string, eventSlug: string | null, message: string) =>
    issues.push({ severity, rule, eventSlug, message });

  const windowsByEvent = new Map<string, PricingEventWindow[]>();
  for (const w of data.windows) {
    const list = windowsByEvent.get(w.eventId);
    if (list) list.push(w);
    else windowsByEvent.set(w.eventId, [w]);
  }
  const zonesByEvent = new Map<string, PricingEventZone[]>();
  for (const z of data.zones) {
    const list = zonesByEvent.get(z.eventId);
    if (list) list.push(z);
    else zonesByEvent.set(z.eventId, [z]);
  }

  for (const event of data.events) {
    const slug = event.slug;
    const windows = windowsByEvent.get(event.id) ?? [];
    const zones = zonesByEvent.get(event.id) ?? [];

    // 1. Bevestigd zonder bron: dan is "bevestigd" een bewering, geen feit.
    if (event.status === "confirmed" && !event.sourceUrl?.trim()) {
      add("error", "confirmed_without_source", slug, "status 'confirmed' zonder source_url");
    }

    // 4a. Onmogelijke eventduur.
    if (!(ms(event.endsAt) > ms(event.startsAt))) {
      add("error", "event_span_invalid", slug, "ends_at moet ná starts_at liggen");
    }

    // 8/9. Alleen een bevestigd evenement mag prijzen. 'expected' is de
    // voorlopige status: die activeert nooit automatisch een tarief.
    if (event.pricingEnabled && event.status === "expected") {
      add("error", "provisional_pricing_enabled", slug, "voorlopig ('expected') evenement mag niet vrijgegeven zijn");
    }
    if (event.pricingEnabled && (event.status === "cancelled" || event.status === "completed")) {
      add("error", "inactive_pricing_enabled", slug, `status '${event.status}' mag niet vrijgegeven zijn`);
    }
    if (event.pricingEnabled && event.status === "verification_required") {
      add("error", "unverified_pricing_enabled", slug, "evenement dat verificatie behoeft mag niet vrijgegeven zijn");
    }

    // 2/3. Vrijgegeven zonder venster of zone zou betekenen: wel actief, geen
    // afbakening. Dat is precies het scenario dat de verkeerde klant raakt.
    if (event.pricingEnabled && windows.length === 0) {
      add("error", "enabled_without_window", slug, "vrijgegeven evenement zonder tijdvenster");
    }
    if (event.pricingEnabled && zones.length === 0) {
      add("error", "enabled_without_zone", slug, "vrijgegeven evenement zonder zone");
    }

    for (const w of windows) {
      // 4b. Onmogelijk venster.
      if (!(ms(w.endsAt) > ms(w.startsAt))) {
        add("error", "window_span_invalid", slug, `venster ${w.id}: ends_at moet ná starts_at liggen`);
      }
      // 5. Onbekend niveau (de database staat elke tekst toe die door de CHECK komt).
      for (const [side, level] of [
        ["pickup", w.pickupImpactLevel],
        ["dropoff", w.dropoffImpactLevel],
      ] as const) {
        if (!isEventImpactLevel(String(level))) {
          add("error", "unknown_impact_level", slug, `venster ${w.id}: onbekend ${side}-niveau "${String(level)}"`);
        }
      }
      // Een venster dat aan beide kanten 'none' is, doet niets.
      if (w.pickupImpactLevel === "none" && w.dropoffImpactLevel === "none") {
        add("warning", "window_without_effect", slug, `venster ${w.id} heeft aan beide kanten niveau 'none'`);
      }
    }

    // 11. Dubbel gerepresenteerde druktepiek.
    for (let i = 0; i < windows.length; i += 1) {
      for (let j = i + 1; j < windows.length; j += 1) {
        const a = windows[i]!;
        const b = windows[j]!;
        if (
          overlaps(a, b) &&
          a.pickupImpactLevel === b.pickupImpactLevel &&
          a.dropoffImpactLevel === b.dropoffImpactLevel
        ) {
          add("warning", "duplicate_overlapping_window", slug, `vensters ${a.id} en ${b.id} overlappen met identieke niveaus`);
        }
      }
    }

    for (const z of zones) {
      // 7. Zone zonder matcher matcht nooit — stille dode data.
      if (zoneMatcher(z) === null) {
        add("error", "zone_without_matcher", slug, `zone ${z.id}: zone_type '${z.zoneType}' zonder bijbehorende waarde`);
      }
      // 6. Ongeldige postcode4.
      if (z.zoneType === "postcode4" && z.postcode4 !== null && !(Number.isInteger(z.postcode4) && z.postcode4 >= 1000 && z.postcode4 <= 9999)) {
        add("error", "invalid_postcode4", slug, `zone ${z.id}: postcode4 ${z.postcode4} valt buiten 1000–9999`);
      }
      // 5b. Onbekende override.
      if (z.impactOverride !== null && !isEventImpactLevel(String(z.impactOverride))) {
        add("error", "unknown_impact_level", slug, `zone ${z.id}: onbekende override "${String(z.impactOverride)}"`);
      }
    }

    // Brede zone én zwaar tarief: dat is de combinatie waarmee een fout de
    // meeste klanten raakt. Geen fout — een landelijke oudejaarsnacht hoort zo
    // te zijn — maar wel iets dat expliciet bekeken moet worden.
    const heaviest = windows.reduce((max, w) => {
      const level = eventImpactRank(w.pickupImpactLevel) >= eventImpactRank(w.dropoffImpactLevel)
        ? w.pickupImpactLevel
        : w.dropoffImpactLevel;
      return eventImpactRank(level) > eventImpactRank(max) ? level : max;
    }, "none" as EventImpactLevel);
    if (zones.length >= BROAD_ZONE_COUNT && eventImpactRank(heaviest) >= eventImpactRank("very_high")) {
      add("warning", "broad_zone_high_impact", slug, `${zones.length} zones bij niveau '${heaviest}' — bevestig dat die breedte klopt`);
    }

    // Een bevestiging veroudert. Een evenement dat al maanden niet is nagekeken
    // kan inmiddels verplaatst of geannuleerd zijn.
    if (event.status === "confirmed") {
      const verifiedAt = event.lastVerifiedAt ? ms(event.lastVerifiedAt) : null;
      if (verifiedAt === null || Number.isNaN(verifiedAt)) {
        add("warning", "stale_verification", slug, "bevestigd evenement zonder last_verified_at");
      } else if (now - verifiedAt > VERIFICATION_MAX_AGE_DAYS * 86_400_000) {
        add("warning", "stale_verification", slug, `laatst geverifieerd meer dan ${VERIFICATION_MAX_AGE_DAYS} dagen geleden`);
      }
    }

    // 12. Volledig verstreken evenement hoort niet in de initiële seed.
    if (windows.length > 0 && windows.every((w) => ms(w.endsAt) <= cutoff)) {
      add("error", "all_windows_before_cutoff", slug, "alle vensters liggen vóór het operationele startpunt");
    }
  }

  // 10. Dubbele slug: twee records die hetzelfde evenement voorstellen.
  const seen = new Map<string, number>();
  for (const e of data.events) {
    const key = e.slug.trim().toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, count] of seen) {
    if (count > 1) add("error", "duplicate_slug", key, `slug komt ${count}× voor`);
  }

  return issues;
}

/** Alleen de blokkerende bevindingen — handig in tests en CI. */
export function eventDataErrors(issues: readonly EventDataIssue[]): readonly EventDataIssue[] {
  return issues.filter((i) => i.severity === "error");
}
