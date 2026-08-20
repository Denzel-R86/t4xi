// ─────────────────────────────────────────────────────────────────────────────
// Centrale euro-weergave (2026-08-19, hotfix). Vervangt losse `€${price}`-
// tekstconcatenatie (gaf "€95.8" — één decimaal, geen komma) en de kale
// `String(value)` die Odometer eerder gebruikte (een letterlijke "." werd
// daar als rollende cijferkolom behandeld — "9508" i.p.v. "95,08").
//
// Zelfde Intl.NumberFormat("nl-NL", {style:"currency", currency:"EUR"})-
// patroon als het al bestaande, werkende lib/notifications/booking-email.ts —
// quote-preview, e-mailbevestiging en facturen tonen zo hetzelfde bedrag in
// exact dezelfde notatie. Rekent uitsluitend met het cent-precieze bedrag dat
// de Pricing Engine al teruggeeft — geen aparte afronding of herberekening.
// ─────────────────────────────────────────────────────────────────────────────

const EUR_FORMATTER = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const EUR_AMOUNT_FORMATTER = new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const EUR_LOCALE_FORMATTERS = {
  nl: EUR_FORMATTER,
  en: new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
} as const;

/** "€ 95,80" — met valutasymbool, voor losstaand gebruik. */
export function formatEuro(amountEuros: number): string {
  return EUR_FORMATTER.format(amountEuros);
}

/** Cent-precieze euro-weergave voor publieke NL/EN-content. */
export function formatEuroForLocale(amountEuros: number, locale: "nl" | "en"): string {
  return EUR_LOCALE_FORMATTERS[locale].format(amountEuros);
}

/** "95,80" — uitsluitend het getal (twee decimalen, komma), voor gebruik náást een al aanwezig "€"-teken. */
export function formatEuroAmount(amountEuros: number): string {
  return EUR_AMOUNT_FORMATTER.format(amountEuros);
}
