/**
 * Bedrijfs- en juridische gegevens, op één plek.
 *
 * ── PLACEHOLDERS ───────────────────────────────────────────────────────────
 *
 * Waarden die nog moeten worden aangeleverd staan als `null`. Componenten tonen
 * die velden dan NIET — er verschijnt liever niets dan een verzonnen nummer.
 *
 * Zolang `BTW_NUMMER` null is, is de site NIET publiceerbaar: een Nederlandse
 * onderneming die op afstand aan consumenten verkoopt, moet haar btw-identificatie
 * vermelden. `assertPubliceerbaar()` maakt dat expliciet controleerbaar.
 */

export const BEDRIJF = {
  handelsnaam: "T4XI",
  rechtspersoon: "Noir Driving Services",
  kvk: "80673813",
  /** Aangeleverd door de eigenaar, 21 juli 2026. Formaat NL + 9 cijfers + B + 2. */
  btw: "NL003472098B32" as string | null,
  vestigingsplaats: "Almere",
  land: "Nederland",
  telefoon: "+31 6 34 74 45 22",
  telefoonHref: "tel:+31634744522",
  email: "booking@t4xi.nl",
} as const;

/** Verwerkers die persoonsgegevens ontvangen. Voedt de privacyverklaring. */
export const VERWERKERS = [
  { naam: "Supabase", doel: "opslag van boekingen en offerteaanvragen", regio: "EU (eu-west-1, Ierland)" },
  { naam: "Resend", doel: "verzending van bevestigingsmails", regio: "EU/VS" },
  { naam: "PDOK Locatieserver", doel: "adresaanvulling tijdens het invullen", regio: "Nederland" },
  { naam: "Google Places API", doel: "adresaanvulling als terugvaloptie", regio: "EU/VS" },
  { naam: "Vercel", doel: "hosting en levering van de website", regio: "EU/VS" },
] as const;

/** Categorieën persoonsgegevens die de website daadwerkelijk vastlegt. */
export const GEGEVENS = [
  "naam",
  "e-mailadres",
  "telefoonnummer",
  "ophaaladres en bestemming",
  "datum en tijd van de rit",
  "aantal passagiers en bagage",
  "vluchtnummer bij luchthavenritten",
  "eventuele opmerkingen die u zelf invult",
] as const;

/**
 * Bewaartermijnen, vastgesteld door de eigenaar op 21 juli 2026.
 *
 * Eén bron voor privacyverklaring en voorwaarden, zodat ze niet uit elkaar kunnen
 * lopen. Alleen de fiscale bewaarplicht volgt uit de wet; de overige termijnen
 * zijn een onderbouwde keuze onder het AVG-beginsel van opslagbeperking.
 *
 * Er staat bewust GEEN categorie voor marketingcommunicatie in: de website kent
 * geen nieuwsbrief, opt-in of mailinglijst. Een bewaartermijn opnemen voor een
 * verwerking die niet plaatsvindt, beschrijft de werkelijkheid onjuist.
 */
export const BEWAARTERMIJNEN = [
  {
    gegevens: "Facturen, betalingen en financiële administratie",
    termijn: "7 jaar",
    reden: "fiscale bewaarplicht",
  },
  {
    gegevens: "Boekings- en ritgegevens",
    termijn: "12 maanden na de rit",
    reden: "klantenservice, restituties en geschillen",
  },
  {
    gegevens: "Vluchtnummer en vluchtstatus",
    termijn: "30 dagen na de rit",
    reden: "alleen nodig voor uitvoering en korte nazorg",
  },
  {
    gegevens: "Prijsaanvragen zonder boeking",
    termijn: "3 maanden",
    reden: "opvolging van de aanvraag; bevat geen contactgegevens",
  },
  {
    gegevens: "Klachten en klantenservice",
    termijn: "1 jaar na afhandeling",
    reden: "bewijsvoering en eventuele vervolgvragen",
  },
] as const;

/** Laatste inhoudelijke wijziging van de juridische teksten. */
export const LAATST_BIJGEWERKT = "21 juli 2026";

/* ═══════════════════════════════════════════════════════════════════════════
 * ENGELSE LAAG (stap 6)
 *
 * De Nederlandse data hierboven blijft de bron en verandert niet. Deze laag
 * levert de vertaalde velden voor de Engelse juridische pagina's. De Engelse
 * versie is een gemaksvertaling; bij tegenstrijdigheid prevaleert het Nederlands
 * (zie de disclaimer bovenaan iedere Engelse pagina). `naam`, bedragen, termijnen
 * en bedrijfsgegevens blijven inhoudelijk gelijk.
 * ═══════════════════════════════════════════════════════════════════════════ */

import type { Locale } from "@/i18n/routing";

/** Engelse notatie van de laatste wijzigingsdatum. */
export const LAATST_BIJGEWERKT_EN = "21 July 2026";

const VERWERKERS_EN = [
  { naam: "Supabase", doel: "storage of bookings and quote requests", regio: "EU (eu-west-1, Ireland)" },
  { naam: "Resend", doel: "sending confirmation emails", regio: "EU/US" },
  { naam: "PDOK Location Server", doel: "address autocompletion while you type", regio: "Netherlands" },
  { naam: "Google Places API", doel: "address autocompletion as a fallback", regio: "EU/US" },
  { naam: "Vercel", doel: "hosting and delivery of the website", regio: "EU/US" },
] as const;

const GEGEVENS_EN = [
  "name",
  "email address",
  "phone number",
  "pick-up address and destination",
  "date and time of the ride",
  "number of passengers and luggage",
  "flight number for airport rides",
  "any comments you enter yourself",
] as const;

const BEWAARTERMIJNEN_EN = [
  {
    gegevens: "Invoices, payments and financial records",
    termijn: "7 years",
    reden: "statutory tax retention obligation",
  },
  {
    gegevens: "Booking and ride data",
    termijn: "12 months after the ride",
    reden: "customer service, refunds and disputes",
  },
  {
    gegevens: "Flight number and flight status",
    termijn: "30 days after the ride",
    reden: "only needed for performance and brief aftercare",
  },
  {
    gegevens: "Quote requests without a booking",
    termijn: "3 months",
    reden: "follow-up of the request; contains no contact details",
  },
  {
    gegevens: "Complaints and customer service",
    termijn: "1 year after resolution",
    reden: "evidence and possible follow-up questions",
  },
] as const;

type Verwerker = { naam: string; doel: string; regio: string };
type Bewaartermijn = { gegevens: string; termijn: string; reden: string };

/** Verwerkers per locale (namen gelijk; doel en regio vertaald). */
export function getVerwerkers(locale: Locale): readonly Verwerker[] {
  return locale === "en" ? VERWERKERS_EN : VERWERKERS;
}

/** Verzamelde gegevens per locale. */
export function getGegevens(locale: Locale): readonly string[] {
  return locale === "en" ? GEGEVENS_EN : GEGEVENS;
}

/** Bewaartermijnen per locale (termijnen inhoudelijk gelijk). */
export function getBewaartermijnen(locale: Locale): readonly Bewaartermijn[] {
  return locale === "en" ? BEWAARTERMIJNEN_EN : BEWAARTERMIJNEN;
}

/** Laatste wijzigingsdatum in de notatie van de locale. */
export function getLaatstBijgewerkt(locale: Locale): string {
  return locale === "en" ? LAATST_BIJGEWERKT_EN : LAATST_BIJGEWERKT;
}

/**
 * Faalt zolang er verplichte gegevens ontbreken.
 *
 * BEDOELD ALS DEPLOY-GATE, niet als render-check. Roep dit aan in een
 * pre-deploy-script of CI-stap — niet tijdens het renderen van een pagina, want
 * dan breekt de build al vóórdat de gegevens er zijn en kan er niets meer getest
 * worden. De pagina's tonen intussen een zichtbare markering op de plek van het
 * ontbrekende nummer, zodat het niet stilzwijgend live gaat.
 */
export function assertPubliceerbaar(): void {
  const ontbreekt: string[] = [];
  if (!BEDRIJF.btw) ontbreekt.push("BTW-nummer (lib/legal.ts → BEDRIJF.btw)");
  if (ontbreekt.length > 0) {
    throw new Error(
      `Juridische gegevens ontbreken en de site is niet publiceerbaar:\n` +
        ontbreekt.map((o) => `  · ${o}`).join("\n") +
        `\n\nVul deze aan in lib/legal.ts voordat u naar productie deployt.`
    );
  }
}

/** True als alles compleet is — voor componenten die zachtjes willen degraderen. */
export function isPubliceerbaar(): boolean {
  return Boolean(BEDRIJF.btw);
}
