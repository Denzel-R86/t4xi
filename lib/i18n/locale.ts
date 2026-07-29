import { routing, type Locale } from "@/i18n/routing";

/**
 * Valideert onbetrouwbare invoer (querystring, request-body) tot een
 * ondersteunde locale. Ongeldig of ontbrekend → de standaardtaal ("nl").
 *
 * Server-side waarheid: caller-zijden mogen de locale nooit blind vertrouwen —
 * de URL is niet betrouwbaar zodra een request server-side wordt verwerkt. Deze
 * helper is de enige bron voor die validatie, gedeeld door de booking-mails en
 * de betaal-endpoints, zodat er geen tweede definitie ontstaat die uit de pas loopt.
 */
export function normalizeLocale(input: unknown): Locale {
  return routing.locales.includes(input as Locale) ? (input as Locale) : routing.defaultLocale;
}
