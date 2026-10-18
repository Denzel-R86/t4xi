import type { Locale } from "@/i18n/routing";
import { hasStatisticsTracker, googleAdsId, metaPixelId } from "@/lib/consent/config";

/**
 * Per-leverancier cookie-openbaarmaking voor de privacyverklaring: doel,
 * gebruikte technieken/cookies, bewaartermijn, gegevenscategorieën, ontvanger,
 * internationale doorgifte en intrekkingsmogelijkheid.
 *
 * Optionele leveranciers (GA4, Google Ads, Meta Pixel) verschijnen UITSLUITEND
 * wanneer aan BEIDE voorwaarden is voldaan: het bijbehorende ID is
 * daadwerkelijk geconfigureerd (lib/consent/config.ts) én de bezoeker heeft
 * er in de cookiebanner toestemming voor gegeven (de banner/Trackers-component
 * laadt het script pas dan). Zolang er geen ID is ingesteld — zoals nu het
 * geval is — verschijnen deze leveranciers hier NIET, om te voorkomen dat de
 * verklaring een indruk van actief gebruik wekt die feitelijk niet klopt.
 * Stripe staat er wél altijd in: dat is de enige leverancier die zonder
 * toestemming actief is.
 *
 * Feitencontrole (2026-08-15) tegen officiële bronnen:
 *   · Stripe — docs.stripe.com/js/appendix/cookies (Stripe.js-cookies zijn
 *     "Necessary Cookies"; exacte bewaartermijnen per cookie publiceert
 *     Stripe niet op die pagina) en stripe.com/legal/dta (doorgifte-precedentie).
 *   · Google — business.safety.google/adsdatatransfers (doorgifte-precedentie
 *     Ads/Analytics-diensten); cookie-bewaartermijn _ga is een klantzijdige
 *     instelling, niet Google's serverzijdige gegevensbewaartermijn (die
 *     laatste staat los, standaard 14 maanden, in te stellen in GA4).
 *   · Meta — dataprivacyframework.gov-registratie (DPF-certificering actief);
 *     exacte precedentie DPF/modelcontractbepalingen kon niet met een directe
 *     citaat van een Meta-pagina worden bevestigd — hieronder als zodanig
 *     gemarkeerd i.p.v. als harde garantie geformuleerd.
 */
export type CookieDisclosure = {
  naam: string;
  categorieLabel: string;
  doel: string;
  technieken: string;
  bewaartermijn: string;
  gegevens: string;
  ontvanger: string;
  doorgifte: string;
  intrekking: string;
};

const STRIPE: CookieDisclosure = {
  naam: "Stripe",
  categorieLabel: "Strikt noodzakelijk",
  doel: "Veilige verwerking van uw betaling en fraudepreventie (Stripe Radar / Advanced Fraud Detection).",
  technieken: "__stripe_mid, __stripe_sid, m (m.stripe.com), fraudepreventiesignalen via m.stripe.network",
  bewaartermijn:
    "Circa 1 jaar (__stripe_mid) / 30 minuten (__stripe_sid), gebaseerd op onafhankelijke cookie-registraties. Stripe's eigen cookiebeleid publiceert geen exacte termijn per cookie en verwijst naar het cookie-instellingendashboard (stripe.com/cookie-settings) voor de actuele stand.",
  gegevens: "Technische identificatoren en apparaat-/sessiesignalen voor fraudedetectie. Geen kaartgegevens.",
  ontvanger: "Stripe Payments Europe, Ltd. / Stripe, Inc.",
  doorgifte:
    "EU–VS Data Privacy Framework (Stripe, LLC is gecertificeerd) als primair mechanisme. Modelcontractbepalingen (of de UK-doorgifteaddendum) gelden uitsluitend als terugvaloptie, wanneer de DPF-certificering voor een specifieke doorgifte niet van toepassing is — Stripe hanteert deze volgorde expliciet in zijn Data Transfers Addendum.",
  intrekking:
    "Twee aparte vragen: (1) is toestemming nodig om deze cookies te plaatsen? Nee — dat valt onder de ePrivacy-uitzondering voor strikt noodzakelijke opslag (art. 5(3) ePrivacy-richtlijn / art. 11.7a Telecommunicatiewet), omdat ze objectief nodig zijn om de door u zelf gestarte betaling te verwerken; Stripe noemt ze zelf \"Necessary Cookies\". (2) op welke grondslag verwerken wij de daaruit voortkomende gegevens? Op de AVG-grondslag uitvoering van de overeenkomst (art. 6(1)(b)) voor de betaling zelf, en gerechtvaardigd belang (art. 6(1)(f), AVG-overweging 47) specifiek voor de fraudepreventie. Een gerechtvaardigd belang maakt een NIET-noodzakelijke tracker niet automatisch vrij van voorafgaande toestemming — dat is bij Stripe niet aan de orde omdat de cookie-plaatsing al onder de eerste uitzondering valt, niet omdat het belang op zichzelf volstaat. Laadt uitsluitend op het moment dat u daadwerkelijk een betaling start.",
};

const STRIPE_EN: CookieDisclosure = {
  naam: "Stripe",
  categorieLabel: "Strictly necessary",
  doel: "Secure processing of your payment and fraud prevention (Stripe Radar / Advanced Fraud Detection).",
  technieken: "__stripe_mid, __stripe_sid, m (m.stripe.com), fraud-prevention signals via m.stripe.network",
  bewaartermijn:
    "Approximately 1 year (__stripe_mid) / 30 minutes (__stripe_sid), based on independent cookie registries. Stripe's own cookies policy does not publish an exact duration per cookie and refers to the cookie settings dashboard (stripe.com/cookie-settings) for the current state.",
  gegevens: "Technical identifiers and device/session signals for fraud detection. No card details.",
  ontvanger: "Stripe Payments Europe, Ltd. / Stripe, Inc.",
  doorgifte:
    "EU-US Data Privacy Framework (Stripe, LLC is certified) as the primary mechanism. Standard contractual clauses (or the UK transfer addendum) apply only as a fallback, when DPF certification does not apply to a specific transfer — Stripe applies this order explicitly in its Data Transfers Addendum.",
  intrekking:
    "Two separate questions: (1) is consent needed to place these cookies? No — this falls under the ePrivacy exemption for strictly necessary storage (Art. 5(3) ePrivacy Directive), because they are objectively needed to process the payment you started yourself; Stripe itself calls them \"Necessary Cookies\". (2) on what basis do we process the resulting data? On the GDPR basis of performance of a contract (Art. 6(1)(b)) for the payment itself, and legitimate interest (Art. 6(1)(f), recital 47) specifically for fraud prevention. A legitimate interest does not automatically exempt a non-necessary tracker from prior consent — that distinction doesn't apply here because the cookie placement itself already falls under the first exemption, not because the interest alone suffices. Loads only at the moment you actually start a payment.",
};

const GA4: CookieDisclosure = {
  naam: "Google Analytics (GA4)",
  categorieLabel: "Statistieken",
  doel: "Websitestatistieken: paginabezoek en gebruikspatronen, om de site te kunnen verbeteren. Uitsluitend actief wanneer T4XI een meet-ID heeft geconfigureerd én u hiervoor toestemming heeft gegeven.",
  technieken: "_ga, _ga_<containerkenmerk>",
  bewaartermijn:
    "_ga en _ga_<kenmerk>: 2 jaar als cookie-instelling, al begrenzen browsers dit doorgaans tot circa 400 dagen. Dit is de levensduur van de cookie op uw apparaat — een ander begrip dan Google's eigen serverzijdige bewaartermijn voor de analysegegevens zelf (standaard 14 maanden, apart in te stellen).",
  gegevens: "Pseudoniem apparaat-ID, bezochte pagina's, globale locatie (land/regio), apparaat-/browsertype.",
  ontvanger: "Google Ireland Limited / Google LLC",
  doorgifte:
    "EU–VS Data Privacy Framework (Google LLC is gecertificeerd) als primair mechanisme voor advertentie-/analysediensten. Modelcontractbepalingen gelden alleen aanvullend, voor doorgiften waarop Google geen DPF-kader toepast.",
  intrekking:
    "Uitsluitend actief wanneer geconfigureerd én toegestaan. Via Cookie-instellingen op elk moment intrekbaar; metingen stoppen dan direct en de cookies worden verwijderd. Intrekking verwijdert niet met terugwerkende kracht gegevens die al naar Google zijn verzonden — dat vereist een apart verzoek bij Google.",
};

const GA4_EN: CookieDisclosure = {
  naam: "Google Analytics (GA4)",
  categorieLabel: "Statistics",
  doel: "Website statistics: page views and usage patterns, so we can improve the site. Only active when T4XI has configured a measurement ID and you have consented.",
  technieken: "_ga, _ga_<container ID>",
  bewaartermijn:
    "_ga and _ga_<ID>: 2 years as a cookie setting, though browsers typically cap this at roughly 400 days. This is the lifespan of the cookie on your device — a different concept from Google's own server-side retention period for the analytics data itself (14 months by default, separately configurable).",
  gegevens: "Pseudonymous device ID, pages visited, coarse location (country/region), device/browser type.",
  ontvanger: "Google Ireland Limited / Google LLC",
  doorgifte:
    "EU-US Data Privacy Framework (Google LLC is certified) as the primary mechanism for advertising/analytics services. Standard contractual clauses apply only additionally, for transfers where Google does not apply a DPF framework.",
  intrekking:
    "Only active when configured and allowed. Withdrawable at any time via Cookie settings; measurement stops immediately and the cookies are deleted. Withdrawal does not retroactively delete data already sent to Google — that requires a separate request to Google.",
};

const GOOGLE_ADS: CookieDisclosure = {
  naam: "Google Ads",
  categorieLabel: "Marketing",
  doel: "Meten van de effectiviteit van advertentiecampagnes (conversies). Uitsluitend actief wanneer T4XI een Ads-ID heeft geconfigureerd én u hiervoor toestemming heeft gegeven.",
  technieken: "_gcl_au, en bij aanklikken van een advertentie _gac_<kenmerk>",
  bewaartermijn: "_gcl_au: 90 dagen",
  gegevens: "Pseudoniem klik-/conversie-ID, campagnegegevens.",
  ontvanger: "Google Ireland Limited / Google LLC",
  doorgifte:
    "EU–VS Data Privacy Framework (Google LLC is gecertificeerd) als primair mechanisme voor advertentie-/analysediensten. Modelcontractbepalingen gelden alleen aanvullend, voor doorgiften waarop Google geen DPF-kader toepast.",
  intrekking:
    "Uitsluitend actief wanneer geconfigureerd én toegestaan. Via Cookie-instellingen op elk moment intrekbaar; metingen stoppen dan direct en de cookies worden verwijderd. Intrekking verwijdert niet met terugwerkende kracht gegevens die al naar Google zijn verzonden — dat vereist een apart verzoek bij Google.",
};

const GOOGLE_ADS_EN: CookieDisclosure = {
  naam: "Google Ads",
  categorieLabel: "Marketing",
  doel: "Measuring the effectiveness of ad campaigns (conversions). Only active when T4XI has configured an Ads ID and you have consented.",
  technieken: "_gcl_au, and _gac_<ID> if you clicked an ad",
  bewaartermijn: "_gcl_au: 90 days",
  gegevens: "Pseudonymous click/conversion ID, campaign data.",
  ontvanger: "Google Ireland Limited / Google LLC",
  doorgifte:
    "EU-US Data Privacy Framework (Google LLC is certified) as the primary mechanism for advertising/analytics services. Standard contractual clauses apply only additionally, for transfers where Google does not apply a DPF framework.",
  intrekking:
    "Only active when configured and allowed. Withdrawable at any time via Cookie settings; measurement stops immediately and the cookies are deleted. Withdrawal does not retroactively delete data already sent to Google — that requires a separate request to Google.",
};

const META_PIXEL: CookieDisclosure = {
  naam: "Meta Pixel",
  categorieLabel: "Marketing",
  doel: "Meten en optimaliseren van advertenties op Facebook/Instagram en doelgroepen opbouwen. Uitsluitend actief wanneer T4XI een Pixel-ID heeft geconfigureerd én u hiervoor toestemming heeft gegeven.",
  technieken: "_fbp, en bij binnenkomst via een Facebook-/Instagram-advertentie _fbc",
  bewaartermijn: "_fbp: 90 dagen · _fbc: 90 dagen",
  gegevens: "Pseudoniem browser-ID, bezochte pagina's, advertentie-interacties.",
  ontvanger: "Meta Platforms Ireland Limited / Meta Platforms, Inc.",
  doorgifte:
    "EU–VS Data Privacy Framework (Meta Platforms, Inc. is gecertificeerd) als primair mechanisme. Voor doorgiften die niet onder deze certificering vallen hanteert Meta aanvullend modelcontractbepalingen (Meta European Data Transfer Addendum) — de exacte precedentie tussen beide kon niet met een directe, citeerbare Meta-bronverklaring worden bevestigd en verdient bij twijfel juridische toetsing.",
  intrekking:
    "Uitsluitend actief wanneer geconfigureerd én toegestaan. Via Cookie-instellingen op elk moment intrekbaar; metingen stoppen dan direct en de cookies worden verwijderd. Intrekking verwijdert niet met terugwerkende kracht gegevens die al naar Meta zijn verzonden — dat vereist een apart verzoek bij Meta.",
};

const META_PIXEL_EN: CookieDisclosure = {
  naam: "Meta Pixel",
  categorieLabel: "Marketing",
  doel: "Measuring and optimising ads on Facebook/Instagram and building audiences. Only active when T4XI has configured a Pixel ID and you have consented.",
  technieken: "_fbp, and _fbc if you arrived via a Facebook/Instagram ad",
  bewaartermijn: "_fbp: 90 days · _fbc: 90 days",
  gegevens: "Pseudonymous browser ID, pages visited, ad interactions.",
  ontvanger: "Meta Platforms Ireland Limited / Meta Platforms, Inc.",
  doorgifte:
    "EU-US Data Privacy Framework (Meta Platforms, Inc. is certified) as the primary mechanism. For transfers not covered by this certification, Meta additionally applies standard contractual clauses (Meta European Data Transfer Addendum) — the exact precedence between the two could not be confirmed with a directly citable Meta source statement and warrants legal review if in doubt.",
  intrekking:
    "Only active when configured and allowed. Withdrawable at any time via Cookie settings; measurement stops immediately and the cookies are deleted. Withdrawal does not retroactively delete data already sent to Meta — that requires a separate request to Meta.",
};

export function getCookieDisclosures(locale: Locale): readonly CookieDisclosure[] {
  const rows: CookieDisclosure[] = [locale === "en" ? STRIPE_EN : STRIPE];
  if (hasStatisticsTracker) rows.push(locale === "en" ? GA4_EN : GA4);
  if (googleAdsId) rows.push(locale === "en" ? GOOGLE_ADS_EN : GOOGLE_ADS);
  if (metaPixelId) rows.push(locale === "en" ? META_PIXEL_EN : META_PIXEL);
  return rows;
}
