/**
 * Configuratie voor optionele statistiek-/marketingtrackers.
 *
 * Alle IDs zijn optioneel: zonder geldige waarde blijft de bijbehorende
 * tracker uit, wordt er geen script geladen en verschijnt de consent-banner
 * niet. Zo blijft de site "geen tracking cookies" totdat er daadwerkelijk
 * een ID is geconfigureerd — de privacyverklaring hoeft dan niet vooruit te
 * lopen op functionaliteit die nog niet bestaat.
 *
 * Validatie voorkomt dat een verkeerd ingevulde environment-waarde
 * ongefilterd in een inline script terechtkomt (zie Trackers.tsx).
 */

const GA_ID_PATTERN = /^G-[A-Z0-9]+$/;
const GOOGLE_ADS_ID_PATTERN = /^AW-[0-9]+$/;
const META_PIXEL_ID_PATTERN = /^[0-9]{10,20}$/;

function readValidated(value: string | undefined, pattern: RegExp): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return pattern.test(trimmed) ? trimmed : null;
}

export const gaMeasurementId = readValidated(
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
  GA_ID_PATTERN,
);
export const googleAdsId = readValidated(
  process.env.NEXT_PUBLIC_GOOGLE_ADS_ID,
  GOOGLE_ADS_ID_PATTERN,
);
export const metaPixelId = readValidated(
  process.env.NEXT_PUBLIC_META_PIXEL_ID,
  META_PIXEL_ID_PATTERN,
);

/** Google-tag (gtag.js) draagt zowel GA4 als Google Ads-conversies. */
export const hasGoogleTag = Boolean(gaMeasurementId || googleAdsId);
export const hasStatisticsTracker = Boolean(gaMeasurementId);
export const hasMarketingTracker = Boolean(googleAdsId || metaPixelId);
export const hasOptionalTrackers = hasStatisticsTracker || hasMarketingTracker;

export type ConsentCategory = "statistics" | "marketing";

/** Schema-versie van het cookie-record zelf (velden/structuur). */
export const CONSENT_SCHEMA_VERSION = 1;

/**
 * Inhoudelijke versie van de banner/het toestemmingsverzoek. Ophogen bij een
 * nieuwe leverancier, een nieuw verwerkingsdoel of een andere relevante
 * wijziging — een bestaande keuze met een oudere bannerversie wordt dan niet
 * langer als geldige toestemming behandeld en de banner verschijnt opnieuw.
 *
 * Wijzigingslog:
 *   1 — 2026-08-15: eerste versie (GA4, Google Ads, Meta Pixel als optionele
 *       categorieën statistieken/marketing).
 */
export const BANNER_VERSION = 1;

export const CONSENT_COOKIE_NAME = "t4xi_consent";
