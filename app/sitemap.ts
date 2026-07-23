import type { MetadataRoute } from "next";
import { localeUrl } from "@/lib/seo-locale";

/**
 * Sitemap met hreflang-alternates.
 *
 * De inhoudspagina's bestaan tweetalig (NL zonder prefix, EN onder /en). Elke
 * entry krijgt daarom `alternates.languages` met nl-NL, en en x-default, zodat
 * Google beide taalversies koppelt en niet als duplicaat behandelt.
 *
 * De juridische pagina's (privacy, voorwaarden) en de Nederlandstalige
 * SEO-landingspagina's (taxi-<stad>-schiphol) hebben vooralsnog alleen
 * Nederlandse inhoud en verschijnen zonder alternates — hun /en-variant
 * consolideert via een canonical naar de NL-URL. Vertaling volgt in stap 6.
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
] as const;

/** Nederlandstalig-only — geen alternates (nog geen echte EN-versie). */
const NL_ONLY = [
  "/privacy",
  "/voorwaarden",
  "/taxi-almere-schiphol",
  "/taxi-amsterdam-schiphol",
  "/taxi-rotterdam-schiphol",
  "/taxi-den-haag-schiphol",
  "/taxi-utrecht-schiphol",
] as const;

function priorityFor(path: string): number {
  if (path === "") return 1;
  if (path === "/boeken") return 0.9;
  return 0.7;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const translatable = TRANSLATABLE.map<MetadataRoute.Sitemap[number]>((path) => ({
    url: localeUrl("nl", path),
    lastModified: now,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: priorityFor(path),
    alternates: {
      languages: {
        "nl-NL": localeUrl("nl", path),
        en: localeUrl("en", path),
        "x-default": localeUrl("nl", path),
      },
    },
  }));

  const nlOnly = NL_ONLY.map<MetadataRoute.Sitemap[number]>((path) => ({
    url: localeUrl("nl", path),
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...translatable, ...nlOnly];
}
