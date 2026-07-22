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
});

export type Locale = (typeof routing.locales)[number];
