import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";

const SITE = "https://t4xi.nl";

/** Pad → absolute URL per locale (NL zonder prefix, EN onder /en). */
export function localeUrl(locale: Locale, path: string): string {
  const clean = path === "/" ? "" : path;
  return locale === routing.defaultLocale ? `${SITE}${clean || "/"}` : `${SITE}/${locale}${clean}`;
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
 * De og:image / twitter:image komen uit de bestandsconventie
 * (app/opengraph-image.png, app/twitter-image.png) en gelden voor alle routes.
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
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
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
