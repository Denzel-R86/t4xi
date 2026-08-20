import type { MetadataRoute } from "next";
import { AIRPORT_ROUTE_PATHS, routing } from "@/i18n/routing";
import { localeUrl } from "@/lib/seo-locale";

/**
 * Sitemap met hreflang-alternates.
 *
 * De inhoudspagina's bestaan tweetalig (NL zonder prefix, EN onder /en). Elke
 * entry krijgt daarom `alternates.languages` met nl-NL, en en x-default, zodat
 * Google beide taalversies koppelt en niet als duplicaat behandelt.
 *
 * Ook de lokale Schiphol-landingspagina's hebben volwaardige Nederlandse en
 * Engelse inhoud. Beide URL's staan daarom in de sitemap en verwijzen met
 * hreflang naar elkaar.
 */

/** Tweetalige inhoudspagina's — krijgen hreflang-alternates. */
const TRANSLATABLE = [
  "",
  "/diensten",
  "/tarieven",
  "/over-ons",
  "/boeken",
  "/zakelijk-vervoer",
  "/dagtochten",
  "/producten",
  "/contact",
  "/partner",
  "/privacy",
  "/voorwaarden",
  ...AIRPORT_ROUTE_PATHS,
] as const;

function priorityFor(path: string): number {
  if (path === "") return 1;
  if (path === "/boeken") return 0.9;
  return 0.7;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const translatable = TRANSLATABLE.flatMap<MetadataRoute.Sitemap[number]>((path) =>
    routing.locales.map((locale) => ({
      url: localeUrl(locale, path),
      changeFrequency: path === "" ? "weekly" : "monthly",
      priority: priorityFor(path),
      alternates: {
        languages: {
          "nl-NL": localeUrl("nl", path),
          en: localeUrl("en", path),
          "x-default": localeUrl("nl", path),
        },
      },
    })),
  );

  return translatable;
}
