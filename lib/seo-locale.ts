import type { Metadata } from "next";
import { routing, type Locale } from "@/i18n/routing";

const SITE = "https://t4xi.nl";

/** Pad → absolute URL per locale (NL zonder prefix, EN onder /en). */
export function localeUrl(locale: Locale, path: string): string {
  const clean = path === "/" ? "" : path;
  return locale === routing.defaultLocale ? `${SITE}${clean || "/"}` : `${SITE}/${locale}${clean}`;
}

/**
 * DE centrale metadatafundering (stap 3). Elke pagina levert straks alleen
 * titel + omschrijving per taal; canonical, hreflang-alternates en Open
 * Graph-locale komen altijd hiervandaan — nergens handmatig.
 *
 *   canonical  → de URL van de eigen locale;
 *   languages  → nl-NL, en en x-default (x-default = Nederlands, de
 *                standaardtaal zonder prefix);
 *   og:locale  → nl_NL of en_US.
 */
export function localeMetadata(opts: {
  locale: Locale;
  path: string;
  title: string;
  description: string;
}): Metadata {
  const { locale, path, title, description } = opts;
  return {
    title,
    description,
    alternates: {
      canonical: localeUrl(locale, path),
      languages: {
        "nl-NL": localeUrl("nl", path),
        en: localeUrl("en", path),
        "x-default": localeUrl("nl", path),
      },
    },
    openGraph: {
      locale: locale === "nl" ? "nl_NL" : "en_US",
      type: "website",
      siteName: "T4XI",
    },
  };
}
