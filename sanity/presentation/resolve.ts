import {
  defineLocations,
  type PresentationPluginOptions,
} from "sanity/presentation";
import type { SupportedLanguage } from "../schemaTypes/constants";

function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return value === "nl" || value === "en";
}

function localizedPath(language: SupportedLanguage, path: string) {
  return language === "nl" ? path : `/en${path}`;
}

export const resolve: PresentationPluginOptions["resolve"] = {
  locations: {
    servicesPage: defineLocations({
      select: { language: "language" },
      resolve: (document) => {
        const language = document?.language;
        if (!isSupportedLanguage(language)) return { locations: [] };
        return {
          locations: [
            {
              title: "Dienstenpagina",
              href: localizedPath(language, "/diensten"),
            },
          ],
        };
      },
    }),
    fleetPage: defineLocations({
      select: { language: "language" },
      resolve: (document) => {
        const language = document?.language;
        if (!isSupportedLanguage(language)) return { locations: [] };
        return {
          locations: [
            {
              title: "Vloot op de homepage",
              href: localizedPath(language, "/#vloot"),
            },
          ],
        };
      },
    }),
  },
};
