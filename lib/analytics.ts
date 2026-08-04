/**
 * Lichtgewicht, afhankelijkheidsvrije analytics-shim.
 *
 * T4XI heeft (nog) geen client-side analyticsprovider in de codebase. Deze helper
 * stuurt events dóór naar een reeds aanwezige provider wanneer die op `window`
 * bestaat — Plausible (`window.plausible`) of een GTM/GA `dataLayer` — en is
 * anders een stille no-op. Zo introduceren we geen nieuwe dependency en werkt
 * meten automatisch zodra de site een provider laadt.
 *
 * PRIVACY: geef hier NOOIT persoonsgegevens mee. Geen volledige adressen,
 * vluchtnummers, namen, e-mail of telefoon. Alleen niet-herleidbare eigenschappen
 * (aantallen, booleans, route-type). De aanroepers in de routezoeker houden zich
 * hieraan; `props` is bewust beperkt tot primitieve, niet-identificerende waarden.
 */

export type AnalyticsProps = Record<string, string | number | boolean>;

/** Bekende T4XI-events (documentair; `track` accepteert elke string). */
export type AnalyticsEvent =
  | "routezoeker_gestart"
  | "tussenstop_toegevoegd"
  | "prijs_gevonden"
  | "prijs_op_aanvraag"
  | "fair_fare_geopend"
  | "schiphol_route_klik"
  | "boeking_geklikt"
  | "boeking_voltooid";

type PlausibleFn = (event: string, options?: { props?: AnalyticsProps }) => void;

type AnalyticsWindow = Window & {
  plausible?: PlausibleFn;
  dataLayer?: Array<Record<string, unknown>>;
};

/**
 * Verstuur een event naar de aanwezige provider, of doe niets. Faalt nooit:
 * meten mag de gebruikersflow onder geen beding blokkeren of laten crashen.
 */
export function track(event: AnalyticsEvent | string, props?: AnalyticsProps): void {
  if (typeof window === "undefined") return;
  const w = window as AnalyticsWindow;
  try {
    if (typeof w.plausible === "function") {
      w.plausible(event, props ? { props } : undefined);
      return;
    }
    if (Array.isArray(w.dataLayer)) {
      w.dataLayer.push({ event, ...(props ?? {}) });
    }
  } catch {
    // meten mag nooit een uitzondering opwerpen naar de UI
  }
}
