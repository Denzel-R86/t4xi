/**
 * Lichtgewicht, afhankelijkheidsvrije analytics-shim.
 *
 * Stuurt events dóór naar een reeds aanwezige provider wanneer die op `window`
 * bestaat — GA4 via `gtag` (sinds 2026-11-21 live achter cookietoestemming),
 * Plausible (`window.plausible`) of een GTM `dataLayer` — en is anders een
 * stille no-op. Zo introduceren we geen nieuwe dependency.
 *
 * PRIVACY: geef hier NOOIT persoonsgegevens mee. Geen adressen, postcodes,
 * plaatsnamen van ophaal- of afzetpunt, vluchtnummers, exacte ritdatum of
 * -tijd, namen, e-mail, telefoon, bedrijfsnaam, boekingsnummer of vrije
 * tekst. Alleen niet-herleidbare eigenschappen (aantallen, booleans,
 * categorieën, afgeronde bedragen). Zie het meetplan (Fase 6).
 */

import { gaMeasurementId } from "./consent/config";

export type AnalyticsProps = Record<string, string | number | boolean>;

/**
 * T4XI-funnelevents (meetplan Fase 6, 2026-11-22). GA4 meet pas sinds
 * 21-11-2026, dus de oude Nederlandstalige namen zijn in één keer vervangen.
 * Key events in GA4: booking_submitted, payment_completed, lead_submitted,
 * whatsapp_click, phone_click.
 */
export type AnalyticsEvent =
  | "quote_requested"
  | "quote_shown"
  | "quote_on_request"
  | "booking_started"
  | "booking_submitted"
  | "payment_completed"
  | "lead_submitted"
  | "whatsapp_click"
  | "phone_click"
  | "review_click"
  | "stop_added"
  | "fair_fare_opened";

export type PageContext = "home" | "tarieven" | "boeken" | "contact" | "zakelijk" | "landingspagina" | "overig";

const LANDING_PREFIX = "/taxi-";

/** Pagina-categorie zonder persoonsgegevens, afgeleid van het pad (zonder taalprefix). */
export function pageContextFor(pathname: string): { page_context: PageContext; lang: "nl" | "en" } {
  const raw = pathname || "/";
  const isEn = raw === "/en" || raw.startsWith("/en/");
  const path = isEn ? raw.slice(3) || "/" : raw;
  let page_context: PageContext = "overig";
  if (path === "/") page_context = "home";
  else if (path.startsWith("/tarieven")) page_context = "tarieven";
  else if (path.startsWith("/boeken")) page_context = "boeken";
  else if (path.startsWith("/contact")) page_context = "contact";
  else if (path.startsWith("/zakelijk")) page_context = "zakelijk";
  else if (path.startsWith(LANDING_PREFIX)) page_context = "landingspagina";
  return { page_context, lang: isEn ? "en" : "nl" };
}

/** Uitgaande klik die als contactmoment telt, of null. Alleen het linktype, nooit het nummer. */
export function classifyContactHref(href: string | null | undefined): "whatsapp_click" | "phone_click" | "review_click" | null {
  if (!href) return null;
  const h = href.trim().toLowerCase();
  if (h.startsWith("tel:")) return "phone_click";
  if (h.startsWith("whatsapp:") || /^https?:\/\/(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\//.test(h)) return "whatsapp_click";
  if (/^https?:\/\/(search\.google\.com\/local\/(writereview|reviews)|g\.page\/r\/)/.test(h)) return "review_click";
  return null;
}

/** Prijssoort uit de quote-respons (`source`), zonder bedrag of route. */
export function priceKindFor(source: unknown, onRequest: boolean): "vaste_route" | "afstand" | "op_aanvraag" | "onbekend" {
  if (onRequest) return "op_aanvraag";
  if (source === "fixed_route_prices") return "vaste_route";
  if (source === "distance_tariff") return "afstand";
  return "onbekend";
}

type PlausibleFn = (event: string, options?: { props?: AnalyticsProps }) => void;

type AnalyticsWindow = Window & {
  plausible?: PlausibleFn;
  dataLayer?: Array<Record<string, unknown>>;
  gtag?: (...args: unknown[]) => void;
  __t4xiStatisticsConsent?: boolean;
};

function contextProps(w: AnalyticsWindow): AnalyticsProps {
  const pathname = w.location?.pathname;
  return typeof pathname === "string" ? pageContextFor(pathname) : {};
}

/**
 * Verstuur een event naar de aanwezige provider, of doe niets. Faalt nooit:
 * meten mag de gebruikersflow onder geen beding blokkeren of laten crashen.
 */
export function track(event: AnalyticsEvent | string, props?: AnalyticsProps): void {
  if (typeof window === "undefined") return;
  const w = window as AnalyticsWindow;
  // Basic consent mode: geen enkel statistiekevent aanbieden zolang de
  // bezoeker niet aantoonbaar in deze tab toestemming heeft gegeven. De vlag
  // wordt synchroon bijgewerkt door ConsentProvider, ook bij intrekking.
  if (w.__t4xiStatisticsConsent !== true) return;
  try {
    const all = { ...contextProps(w), ...(props ?? {}) };
    if (typeof w.plausible === "function") {
      w.plausible(event, Object.keys(all).length ? { props: all } : undefined);
      return;
    }
    // GA4 rechtstreeks (zonder GTM) verwerkt alleen `gtag('event', …)`; een
    // los `{ event }`-object in de dataLayer bereikt GA4 niet (empirisch
    // vastgesteld 2026-11-21). `send_to` beperkt het event tot GA4 — de
    // statistiekencategorie — zodat het nooit naar Google Ads meegaat.
    if (typeof w.gtag === "function") {
      w.gtag("event", event, {
        ...all,
        ...(gaMeasurementId ? { send_to: gaMeasurementId } : {}),
      });
      return;
    }
    if (Array.isArray(w.dataLayer)) {
      w.dataLayer.push({ event, ...all });
    }
  } catch {
    // meten mag nooit een uitzondering opwerpen naar de UI
  }
}
