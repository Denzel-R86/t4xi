import type { MetadataRoute } from "next";
import { NL_ONLY_ROUTE_PATHS, routing } from "@/i18n/routing";
import { localeUrl } from "@/lib/seo-locale";

/**
 * Sitemap met hreflang-alternates.
 *
 * De inhoudspagina's bestaan tweetalig (NL zonder prefix, EN onder /en). Elke
 * entry krijgt daarom `alternates.languages` met nl-NL, en en x-default, zodat
 * Google beide taalversies koppelt en niet als duplicaat behandelt.
 *
 * De juridische pagina's (privacy, voorwaarden) zijn sinds stap 6 tweetalig en
 * krijgen daarom hreflang-alternates. De Nederlandstalige SEO-landingspagina's
 * (taxi-<stad>-schiphol) hebben alleen Nederlandse inhoud en verschijnen zonder
 * alternates — hun /en-variant consolideert via een canonical naar de NL-URL.
 */

/** Tweetalige inhoudspagina's — krijgen hreflang-alternates. */
const TRANSLATABLE = [
  "",
  "/diensten",
  "/tarieven",
  "/over-ons",
  "/boeken",
  "/dagtochten",
  "/producten",
  "/contact",
  "/partner",
  "/privacy",
  "/voorwaarden",
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

  const nlOnly = NL_ONLY_ROUTE_PATHS.map<MetadataRoute.Sitemap[number]>((path) => ({
    url: localeUrl("nl", path),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...translatable, ...nlOnly];
}
