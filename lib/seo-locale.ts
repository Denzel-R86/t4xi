import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";

export const SITE_URL = "https://www.t4xi.nl";
export const OPEN_GRAPH_IMAGE_URL = `${SITE_URL}/opengraph-image.png`;
export const TWITTER_IMAGE_URL = `${SITE_URL}/twitter-image.png`;

/** Pad → absolute URL per locale (NL zonder prefix, EN onder /en). */
export function localeUrl(locale: Locale, path: string): string {
  const clean = path === "/" ? "" : path;
  return locale === routing.defaultLocale
    ? `${SITE_URL}${clean || "/"}`
    : `${SITE_URL}/${locale}${clean}`;
}

/**
 * DE centrale metadatafundering. Elke pagina levert alleen titel + omschrijving
 * per taal; canonical, hreflang-alternates, Open Graph en Twitter komen altijd
 * hiervandaan — nergens handmatig.
 *
 *   canonical       → de URL van de eigen locale (self-referencing);
 *   languages       → nl-NL, en en x-default (x-default = Nederlands, de
 *                     standaardtaal zonder prefix);
 *   og:locale       → nl_NL of en_US, met de andere taal als alternate;
 *   og:url          → de canonical van de eigen locale;
 *   twitter         → summary_large_image, titel en omschrijving per taal.
 *
 * De og:image / twitter:image worden als absolute www-URL's gezet. Dat voorkomt
 * localhost-fallbacks bij speciale routes die buiten de locale-layout bouwen.
 */
export function localeMetadata(opts: {
  locale: Locale;
  path: string;
  title: string;
  description: string;
}): Metadata {
  const { locale, path, title, description } = opts;
  const url = localeUrl(locale, path);
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: {
      canonical: url,
      languages: {
        "nl-NL": localeUrl("nl", path),
        en: localeUrl("en", path),
        "x-default": localeUrl("nl", path),
      },
    },
    openGraph: {
      title,
      description,
      url,
      locale: locale === "nl" ? "nl_NL" : "en_US",
      alternateLocale: locale === "nl" ? "en_US" : "nl_NL",
      type: "website",
      siteName: "T4XI",
      images: [{ url: OPEN_GRAPH_IMAGE_URL, width: 1200, height: 630, alt: "T4XI — Executive Mobility" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [TWITTER_IMAGE_URL],
    },
  };
}

/**
 * Paginabrede helper: leest titel + omschrijving uit de `seo`-namespace voor de
 * gevraagde locale en levert de volledige metadatafundering. Zo blijft elke
 * pagina één regel en staan alle SEO-teksten centraal in de messages-catalogi.
 */
export async function pageMetadata(
  localeInput: string,
  path: string,
  titleKey: string,
  descKey: string
): Promise<Metadata> {
  const locale = hasLocale(routing.locales, localeInput) ? localeInput : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "seo" });
  return localeMetadata({ locale, path, title: t(titleKey), description: t(descKey) });
}

/** Voorkomt dat homepage-metadata vanuit de locale-layout doorlekt naar 404's. */
export function notFoundMetadata(title = "404 — T4XI"): Metadata {
  return {
    title,
    description: null,
    robots: { index: false, follow: false },
    alternates: null,
    openGraph: null,
    twitter: null,
  };
}
