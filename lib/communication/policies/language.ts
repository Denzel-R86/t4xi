/**
 * Taalpolicy.
 *
 * Klantcommunicatie volgt de taal die bij de boeking of aanvraag is vastgelegd
 * en server-side is gevalideerd. Interne communicatie is en blijft Nederlands,
 * onafhankelijk van de klantkeuze — het ops-team is Nederlandstalig en een
 * taakoverdracht in het Engels zou alleen maar verwarren.
 */

import type { Locale } from "@/i18n/routing";
import type { Audience } from "@/lib/communication/events";

export function resolveLocale(audience: Audience, customerLocale: Locale): Locale {
  return audience === "operations" ? "nl" : customerLocale;
}
