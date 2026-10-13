import { formatDuration } from "@/lib/tarieven/route-finder";
import { validateHandoffRide, type HandoffRide } from "@/lib/booking-handoff";
import type { PublicAdjustmentCode, PublicPriceBreakdown } from "@/lib/pricing/public-price-breakdown";

/**
 * "UW RIT" in de RouteFinder (Experience 2.0 PR 2.7) — pure logica, los testbaar.
 *
 * 1. `rideBuildUp`: de prijsopbouw uitsluitend uit velden die de server teruggaf
 *    (`useRouteQuote` → `/api/pricing/quote`). Geen client-side prijslogica, geen
 *    afgeleide componenten: een veld dat de engine niet levert (0) wordt niet getoond.
 * 2. `routeFinderHandoff`: de rit voor de 2.3-handoff (`/boeken?h=1`). Het
 *    handoff-formaat kent alleen een enkele rit; een retour (of tussenstops) kan er
 *    niet in en valt dus terug op de bestaande publieke route (`null`).
 */

/** Serverbevestigde velden van een `ready`-quote die de opbouw mag tonen. */
export type ServerQuoteFields = {
  price: number;
  returnApplied: boolean;
  distanceKm: number;
  estimatedDurationMin: number;
  /** F-30: `priceBreakdown` uit /api/pricing/quote (via useRouteQuote), indien geleverd. */
  breakdown?: PublicPriceBreakdown;
};

/**
 * Labels per serverveld. TIJDELIJK (F-30): neutraal, gelijk aan de labels die de
 * snapshot zelf voor deze codes vastlegt (lib/pricing/snapshot.ts) — definitieve
 * copy is een voorstel in baseline/findings.md (F-30) en wacht op akkoord (§0c).
 */
type ComponentLabelKey = "opbouwRitprijs" | "opbouwNachttarief" | "opbouwNachttariefHeen" | "opbouwNachttariefRetour";

function adjustmentLabel(code: PublicAdjustmentCode, returnApplied: boolean): ComponentLabelKey | null {
  switch (code) {
    case "night_outbound":
      return returnApplied ? "opbouwNachttariefHeen" : "opbouwNachttarief";
    case "night_return":
      return returnApplied ? "opbouwNachttariefRetour" : null;
    // Evenemententarief NIET tonen tot het in productie actief is (masterplan §1:
    // events mode=off) en er een goedgekeurd label is. Staat er toch een
    // evenementregel in de opbouw, dan sluiten de getoonde regels niet op het
    // totaal en valt de opbouw terug op alleen het totaal — niets geschat.
    case "event_outbound":
    case "event_return":
      return null;
  }
}

export type BuildUpRow =
  | { kind: "fact"; labelKey: "factAfstand" | "factReistijd"; value: string; source: "distanceKm" | "estimatedDurationMin" }
  | {
      kind: "component";
      labelKey: ComponentLabelKey;
      /** Euro's, exact `cents / 100` van het serverveld. */
      amount: number;
      cents: number;
      source: "priceBreakdown.subtotalCents" | `priceBreakdown.adjustments.${PublicAdjustmentCode}`;
    }
  | { kind: "total"; labelKey: "vastEnkel" | "vastRetour"; amount: number; source: "price" };

/**
 * Componentregels uit de serveropbouw — of `[]` als die niet exact op `price`
 * sluit. Alleen regels > 0; het subtotaal alleen naast minstens één toeslag
 * (anders zou het een dubbele vermelding van het totaal zijn).
 */
function componentRows(q: ServerQuoteFields): Extract<BuildUpRow, { kind: "component" }>[] {
  const b = q.breakdown;
  if (!b || !Number.isFinite(q.price) || b.totalCents !== Math.round(q.price * 100)) return [];
  const extras: Extract<BuildUpRow, { kind: "component" }>[] = [];
  for (const a of b.adjustments) {
    if (a.amountCents <= 0) continue;
    const labelKey = adjustmentLabel(a.code, q.returnApplied);
    if (!labelKey) continue;
    extras.push({ kind: "component", labelKey, amount: a.amountCents / 100, cents: a.amountCents, source: `priceBreakdown.adjustments.${a.code}` });
  }
  if (extras.length === 0) return [];
  const rows = [
    { kind: "component" as const, labelKey: "opbouwRitprijs" as const, amount: b.subtotalCents / 100, cents: b.subtotalCents, source: "priceBreakdown.subtotalCents" as const },
    ...extras,
  ];
  // Harde eis: de getoonde regels tellen exact op tot het totaal. Anders niets tonen.
  const sum = rows.reduce((s, r) => s + r.cents, 0);
  return sum === b.totalCents ? rows : [];
}

export function rideBuildUp(q: ServerQuoteFields): BuildUpRow[] {
  const rows: BuildUpRow[] = [];
  // Afstand en reistijd zijn serverwaarden van één ritdeel; naast een retourprijs
  // horen ze niet bij dezelfde ritbasis. Bij retour daarom geen afstand/reistijd.
  if (!q.returnApplied && Number.isFinite(q.distanceKm) && q.distanceKm > 0) {
    rows.push({ kind: "fact", labelKey: "factAfstand", value: `${q.distanceKm} km`, source: "distanceKm" });
  }
  const duration = formatDuration(q.estimatedDurationMin);
  if (!q.returnApplied && duration) {
    rows.push({ kind: "fact", labelKey: "factReistijd", value: duration, source: "estimatedDurationMin" });
  }
  if (Number.isFinite(q.price) && q.price > 0) {
    // F-30: componenten uitsluitend uit `priceBreakdown`. De retourprijs wordt
    // niet in heen/terug gesplitst: de server levert geen basisbedrag per ritdeel
    // (alleen de toeslagen zijn per ritdeel) — dus geen afgeleide splitsing.
    rows.push(...componentRows(q));
    rows.push({ kind: "total", labelKey: q.returnApplied ? "vastRetour" : "vastEnkel", amount: q.price, source: "price" });
  }
  return rows;
}

/** Rit voor de handoff, of `null` als die er niet in past (retour, tussenstops, ongeldig). */
export function routeFinderHandoff(input: {
  pickup: string | undefined;
  dropoff: string | undefined;
  date: string;
  time: string;
  passengers: number;
  luggage: string;
  returnTrip: boolean;
  hasStops: boolean;
  quoteId: string;
}): HandoffRide | null {
  if (input.returnTrip || input.hasStops) return null;
  return validateHandoffRide({
    pickup: input.pickup,
    dropoff: input.dropoff,
    date: input.date,
    time: input.time,
    persons: input.passengers,
    luggage: input.luggage,
    quoteId: input.quoteId,
  });
}

/**
 * Euroteken en bedrag nooit gescheiden over twee regels: vaste spatie (U+00A0).
 * Alleen voor de RouteFinder-onderdelen (RideResult, TariffComparison); de
 * gedeelde formatters in lib/format/currency.ts blijven ongewijzigd.
 */
export const EURO_PREFIX = "€\u00a0";
export function euroText(amount: string | number): string {
  return `${EURO_PREFIX}${amount}`;
}

/**
 * Grote prijs in het UW RIT-blok: hele euro's zonder decimalen (€ 102), anders
 * altijd twee decimalen in de notatie van de locale (€ 199,30 / € 199.30).
 * Voorheen stond hier het ruwe getal (`€ 199.3`).
 */
export function headlinePrice(amount: number, locale: string): string {
  const whole = Number.isInteger(amount);
  const fmt = new Intl.NumberFormat(locale === "nl" ? "nl-NL" : "en-GB", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
  return euroText(fmt.format(amount));
}

/**
 * Vergelijking met het wettelijke maximumtarief alleen op dezelfde ritbasis: de
 * taxameterberekening gaat over één rit (serverafstand/-reistijd van de heenrit).
 * Een retourprijs daarnaast zetten vergelijkt appels met peren; tot er een
 * betrouwbare retourbasis is (geen verdubbeling, geen schatting) → verborgen.
 */
export function showLegalComparison(q: ServerQuoteFields): boolean {
  return !q.returnApplied && q.distanceKm > 0 && q.estimatedDurationMin > 0 && q.price > 0;
}
