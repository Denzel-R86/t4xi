import { defineRouting } from "next-intl/routing";

/**
 * DE centrale localeconfiguratie — de enige plek waar talen en routing worden
 * vastgelegd (productieblokker 3, stap 3).
 *
 *   · Nederlands is en blijft de standaardtaal.
 *   · localePrefix "as-needed": NL blijft op de bestaande URL's (/tarieven),
 *     Engels krijgt /en/... — geen migratie naar /nl, bestaande links en
 *     indexatie blijven intact.
 *   · localeDetection uit: géén automatische redirect op browsertaal; een
 *     expliciet bezochte URL wordt nooit overschreven.
 */
export const routing = defineRouting({
  locales: ["nl", "en"],
  defaultLocale: "nl",
  localePrefix: "as-needed",
  localeDetection: false,
  // De taal staat volledig in de URL (/en of de Nederlandse standaardroute).
  // Een NEXT_LOCALE-cookie voegt daarom geen gedrag toe, maar fragmenteert wel
  // publieke caches en plaatst onnodig browserstate.
  localeCookie: false,
  // Metadata en sitemap beheren hreflang bewust per paginatype.
  alternateLinks: false,
});

/** De vijf lokale Schiphol-landingspagina's, beschikbaar in beide talen. */
export const AIRPORT_ROUTE_PATHS = [
  "/taxi-almere-schiphol",
  "/taxi-amsterdam-schiphol",
  "/taxi-rotterdam-schiphol",
  "/taxi-den-haag-schiphol",
  "/taxi-utrecht-schiphol",
] as const;

export type Locale = (typeof routing.locales)[number];
