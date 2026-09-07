/**
 * Lokale stadshubs — brede stadsintentie, los van de Schiphol-routepagina's.
 *
 * ── WAAROM DEZE PAGINA'S BESTAAN ───────────────────────────────────────────
 *
 * De Search Console-nulmeting van 2026-09-02 liet zien dat er over drie maanden
 * NUL impressies waren op `taxi almere` en `taxi spijkenisse`. Niet omdat die
 * pagina's slecht scoorden, maar omdat ze niet bestonden: alleen
 * /taxi-<stad>-schiphol was er, en dat beantwoordt route-intentie, geen
 * stadsintentie. Zie docs/seo/gsc-nulmeting-2026-09-02.md.
 *
 * ── GEEN KANNIBALISATIE ────────────────────────────────────────────────────
 *
 *   /taxi-almere            → brede lokale intentie (taxi almere, reserveren,
 *                             zakelijk, prijs)
 *   /taxi-almere-schiphol   → uitsluitend de route Almere ↔ Schiphol
 *
 * De hub verwijst nadrukkelijk door naar de routepagina en herhaalt diens
 * inhoud niet. Neem hier dus GEEN wijk-tarieftabel of Schiphol-reistijd op.
 *
 * ── DEZELFDE CONTENTREGELS ALS seo-steden.ts ───────────────────────────────
 *
 * GEEN PRIJZEN in dit bestand. Prijzen komen uitsluitend uit `loadRateCard()`
 * en de Pricing Engine; de hub linkt naar /tarieven en /boeken.
 *
 * Niet gebruiken: altijd op tijd · op tijd gegarandeerd · vanaf · gratis
 * annuleren · beoordelingscijfers · aantal uitgevoerde ritten.
 *
 * Noem alleen wijken en diensten die daadwerkelijk bestaan.
 */

import type { AirportLandingLocale } from "@/lib/seo-steden";

export type StadHubSectie = {
  kop: string;
  tekst: string;
};

export type StadHub = {
  /** URL-segment, zonder leading slash. */
  slug: string;
  naam: string;
  /** De bijbehorende Schiphol-routepagina — altijd prominent gelinkt. */
  routeSlug: string;
  metaTitle: string;
  metaDescription: string;
  /** Korte regel boven de H1. */
  eyebrow: string;
  /** Introtekst zonder enig bedrag. */
  intro: string;
  /** Wijken/gebieden — moeten overeenkomen met het werkgebied. */
  gebieden: string[];
  gebiedenKop: string;
  gebiedenIntro: string;
  /** Inhoudelijke secties, uniek per stad. */
  secties: StadHubSectie[];
  faq: { q: string; a: string }[];
};

/** Antwoord dat op elke hub identiek moet luiden — prijs komt uit de engine. */
const PRIJS_FAQ_NL = {
  q: "Wat kost een taxi en hoe weet ik dat vooraf?",
  a:
    "U ziet de vaste prijs voordat u boekt: vul uw ophaaladres en bestemming in en de prijs " +
    "verschijnt direct, inclusief btw. Die prijs staat vast bij bevestiging — files, omrijden " +
    "of wachttijd veranderen daar niets aan. We gebruiken geen taxameter en geen dynamische " +
    "prijsverhogingen. Voor ritten tussen 23.00 en 06.00 uur geldt een nachttarief van 15%; " +
    "dat is vooraf in uw prijs verwerkt.",
};

const PRIJS_FAQ_EN = {
  q: "What does a taxi cost, and how do I know in advance?",
  a:
    "You see the fixed fare before you book: enter your pickup address and destination and the " +
    "price appears immediately, including VAT. That price is locked on confirmation — traffic, " +
    "detours or waiting time do not change it. We use no taximeter and no surge pricing. Rides " +
    "between 23:00 and 06:00 carry a 15% night tariff, already included in your quoted price.",
};

const CHAUFFEUR_FAQ_NL = {
  q: "Wie rijdt er en in wat voor voertuig?",
  a:
    "Uw chauffeur beschikt over een geldige Nederlandse taxichauffeurskaart. De rit wordt " +
    "toegewezen binnen onze premium voertuigklasse, met plaats voor maximaal 4 passagiers " +
    "exclusief chauffeur. Deel uw bagage vooraf, dan bevestigen wij de beschikbare ruimte.",
};

const CHAUFFEUR_FAQ_EN = {
  q: "Who drives, and in what vehicle?",
  a:
    "Your driver holds a valid Dutch taxi driver's card. The ride is assigned within our premium " +
    "vehicle class, seating up to 4 passengers excluding the driver. Share your luggage details " +
    "in advance and we will confirm the available space.",
};

const NL_HUBS: StadHub[] = [
  {
    slug: "taxi-almere",
    naam: "Almere",
    routeSlug: "taxi-almere-schiphol",
    metaTitle: "Taxi Almere — vaste prijs vooraf, 24/7 reserveren",
    metaDescription:
      "Taxi in Almere met een vaste prijs die u vooraf ziet. T4XI rijdt 24/7: " +
      "luchthavenvervoer, zakelijk vervoer en dagtochten. Reserveer online.",
    eyebrow: "Lokaal vervoer in Flevoland",
    intro:
      "T4XI heeft een vaste standplaats in Almere en rijdt er 24 uur per dag. Of het nu gaat om " +
      "een vroege vlucht, een zakelijke afspraak in de Randstad of een rit binnen de stad: u ziet " +
      "de prijs voordat u boekt en die staat vast bij bevestiging. Geen taxameter, geen " +
      "onverwachte prijsstijgingen.",
    gebiedenKop: "Waar wij in Almere rijden",
    gebiedenIntro:
      "Almere is opgebouwd uit ruim opgezette stadsdelen die kilometers uit elkaar kunnen liggen. " +
      "Wij halen u op in elk van deze wijken; de prijs wordt op uw exacte ophaaladres berekend.",
    gebieden: [
      "Almere Stad Centrum",
      "Almere Haven",
      "Almere Buiten",
      "Almere Poort",
      "Almere Muziekwijk",
      "Almere Hout",
      "Almere Oostvaarders",
    ],
    secties: [
      {
        kop: "Een vaste prijs, ook binnen de stad",
        tekst:
          "Omdat Almere zo ruim is opgezet, verschilt een rit van Almere Haven naar Almere Buiten " +
          "flink van een rit binnen het centrum. Juist daarom rekenen wij met een vaste prijs op " +
          "basis van uw ophaaladres en bestemming, in plaats van met een meter die tijdens files " +
          "doorloopt. U berekent die prijs zelf voordat u iets vastlegt.",
      },
      {
        kop: "Zakelijk vervoer vanuit Almere",
        tekst:
          "Almere ligt via de A6 dicht bij Amsterdam, Utrecht en het Gooi. Voor bedrijven rijden " +
          "wij directievervoer, klantritten en groepsvervoer met facturatie achteraf. De rit wordt " +
          "toegewezen binnen onze premium voertuigklasse en uw chauffeur beschikt over een geldige " +
          "Nederlandse taxichauffeurskaart.",
      },
      {
        kop: "Dagtochten en langere ritten",
        tekst:
          "Een taxi is niet alleen voor korte ritten. Wij rijden vanuit Almere ook dagtochten en " +
          "langere afstanden door heel Nederland en daarbuiten, met dezelfde vaste prijsafspraak " +
          "vooraf. Voor een dagdeel of meerdere bestemmingen stemmen wij de planning met u af.",
      },
    ],
    faq: [
      PRIJS_FAQ_NL,
      {
        q: "Kan ik in Almere een taxi reserveren voor een vroege ochtend?",
        a:
          "Ja. T4XI rijdt 24 uur per dag en Almere is een vaste standplaats, dus ook ritten om " +
          "04.00 of 05.00 uur plannen wij betrouwbaar in. Boek bij voorkeur minimaal twee uur van " +
          "tevoren, zodat we de rit goed kunnen inplannen.",
      },
      {
        q: "Rijdt T4XI ook binnen Almere zelf?",
        a:
          "Ja. Naast luchthaven- en langeafstandsritten rijden wij ook binnen de stad, tussen de " +
          "stadsdelen en naar bestemmingen in Flevoland. De prijs wordt op uw ophaaladres en " +
          "bestemming berekend en staat vast bij bevestiging.",
      },
      CHAUFFEUR_FAQ_NL,
    ],
  },
  {
    slug: "taxi-spijkenisse",
    naam: "Spijkenisse",
    routeSlug: "taxi-spijkenisse-schiphol",
    metaTitle: "Taxi Spijkenisse — vaste prijs, 24/7 reserveren",
    metaDescription:
      "Taxi in Spijkenisse met een vaste prijs, vooraf berekend op uw ophaaladres. " +
      "T4XI rijdt 24/7 op Voorne-Putten. Reserveer online zonder taxameter.",
    eyebrow: "Lokaal vervoer op Voorne-Putten",
    intro:
      "Spijkenisse is de tweede vaste standplaats van T4XI. Wij rijden er 24 uur per dag, met een " +
      "vaste prijs die vooraf op uw ophaaladres wordt berekend. U weet dus wat de rit kost voordat " +
      "u boekt, zonder taxameter en zonder onverwachte prijsstijgingen.",
    gebiedenKop: "Waar wij in Spijkenisse rijden",
    gebiedenIntro:
      "Wij halen u op in de wijken van Spijkenisse en rijden ook naar de omliggende kernen op " +
      "Voorne-Putten. De prijs wordt berekend op uw exacte ophaaladres.",
    gebieden: [
      "Spijkenisse Centrum",
      "Sterrenkwartier",
      "De Akkers",
      "Maaswijk",
      "Groenewoud",
      "Hoogwerf",
      "Vriesland",
    ],
    secties: [
      {
        kop: "Een eigen standplaats scheelt op Voorne-Putten",
        tekst:
          "Voorne-Putten ligt buiten de directe ring van Rotterdam, en dat merkt u bij vervoerders " +
          "die van ver moeten komen. Omdat Spijkenisse een van onze vaste uitvalsbases is, kunnen " +
          "wij hier ook vroege ochtendritten en boekingen op korte termijn betrouwbaar inplannen.",
      },
      {
        kop: "Richting Rotterdam en de Randstad",
        tekst:
          "Via de Hartelkering en de A15 zit u vanuit Spijkenisse snel op Rotterdam, en van daaruit " +
          "op de rest van de Randstad. Wij rijden ritten naar het centrum, naar stations, naar " +
          "ziekenhuizen en naar zakelijke afspraken, steeds met een prijs die vooraf vaststaat.",
      },
      {
        kop: "Zakelijk vervoer en havengebied",
        tekst:
          "Spijkenisse grenst aan het Rotterdamse haven- en industriegebied. Voor bedrijven rijden " +
          "wij personeels- en directievervoer met facturatie achteraf, ook buiten kantooruren. " +
          "Ploegendiensten en vroege vertrektijden stemmen wij vooraf met u af.",
      },
    ],
    faq: [
      PRIJS_FAQ_NL,
      {
        q: "Is Spijkenisse een vaste standplaats van T4XI?",
        a:
          "Ja. Spijkenisse is een van onze twee vaste uitvalsbases, naast Almere. Daardoor kunnen " +
          "wij op Voorne-Putten ook vroege ochtendritten en last-minute boekingen betrouwbaar " +
          "inplannen, zonder dat er eerst een auto van ver moet komen.",
      },
      {
        q: "Rijdt T4XI ook naar de omliggende kernen op Voorne-Putten?",
        a:
          "Ja. Naast Spijkenisse zelf rijden wij op Voorne-Putten en naar bestemmingen in de regio " +
          "Rotterdam. Vul uw ophaaladres in en u ziet direct of wij de rit met een vaste prijs " +
          "kunnen uitvoeren.",
      },
      CHAUFFEUR_FAQ_NL,
    ],
  },
];

const EN_HUBS: StadHub[] = [
  {
    slug: "taxi-almere",
    naam: "Almere",
    routeSlug: "taxi-almere-schiphol",
    metaTitle: "Taxi Almere — fixed fare in advance, book 24/7",
    metaDescription:
      "Taxi in Almere with a fixed fare you see before booking. T4XI operates 24/7: " +
      "airport transfers, business travel and day trips. Book online.",
    eyebrow: "Local transport in Flevoland",
    intro:
      "T4XI is based in Almere and operates 24 hours a day. Whether it is an early flight, a " +
      "business appointment in the Randstad or a ride within the city: you see the fare before you " +
      "book and it is locked on confirmation. No taximeter, no unexpected increases.",
    gebiedenKop: "Where we drive in Almere",
    gebiedenIntro:
      "Almere is built from spacious districts that can lie kilometres apart. We pick you up in " +
      "each of them; the fare is calculated on your exact pickup address.",
    gebieden: [
      "Almere Stad Centrum",
      "Almere Haven",
      "Almere Buiten",
      "Almere Poort",
      "Almere Muziekwijk",
      "Almere Hout",
      "Almere Oostvaarders",
    ],
    secties: [
      {
        kop: "A fixed fare, also within the city",
        tekst:
          "Because Almere is laid out so spaciously, a ride from Almere Haven to Almere Buiten " +
          "differs considerably from one within the centre. That is exactly why we quote a fixed " +
          "fare based on your pickup address and destination, rather than a meter that keeps " +
          "running in traffic. You calculate that fare yourself before committing to anything.",
      },
      {
        kop: "Business travel from Almere",
        tekst:
          "The A6 puts Almere close to Amsterdam, Utrecht and Het Gooi. For companies we provide " +
          "executive transport, client rides and group travel with invoicing afterwards. The ride " +
          "is assigned within our premium vehicle class and your driver holds a valid Dutch taxi " +
          "driver's card.",
      },
      {
        kop: "Day trips and longer distances",
        tekst:
          "A taxi is not only for short rides. From Almere we also drive day trips and longer " +
          "distances throughout the Netherlands and beyond, with the same fixed fare agreed in " +
          "advance. For a half day or multiple destinations we plan the schedule with you.",
      },
    ],
    faq: [
      PRIJS_FAQ_EN,
      {
        q: "Can I book a taxi in Almere for an early morning?",
        a:
          "Yes. T4XI operates 24 hours a day and Almere is a permanent base, so rides at 04:00 or " +
          "05:00 are planned reliably as well. Please book at least two hours ahead where possible, " +
          "so we can schedule the ride properly.",
      },
      {
        q: "Does T4XI also drive within Almere itself?",
        a:
          "Yes. Besides airport and long-distance rides we also drive within the city, between the " +
          "districts and to destinations across Flevoland. The fare is calculated on your pickup " +
          "address and destination and is locked on confirmation.",
      },
      CHAUFFEUR_FAQ_EN,
    ],
  },
  {
    slug: "taxi-spijkenisse",
    naam: "Spijkenisse",
    routeSlug: "taxi-spijkenisse-schiphol",
    metaTitle: "Taxi Spijkenisse — fixed fare in advance, book 24/7",
    metaDescription:
      "Taxi in Spijkenisse with a fixed fare calculated on your pickup address. " +
      "T4XI operates 24/7 across Voorne-Putten. Book online, no taximeter.",
    eyebrow: "Local transport on Voorne-Putten",
    intro:
      "Spijkenisse is T4XI's second permanent base. We operate 24 hours a day, with a fixed fare " +
      "calculated on your pickup address in advance. You know what the ride costs before you book, " +
      "without a taximeter and without unexpected increases.",
    gebiedenKop: "Where we drive in Spijkenisse",
    gebiedenIntro:
      "We pick you up across the districts of Spijkenisse and also drive to the surrounding towns " +
      "on Voorne-Putten. The fare is calculated on your exact pickup address.",
    gebieden: [
      "Spijkenisse Centrum",
      "Sterrenkwartier",
      "De Akkers",
      "Maaswijk",
      "Groenewoud",
      "Hoogwerf",
      "Vriesland",
    ],
    secties: [
      {
        kop: "A local base makes a difference on Voorne-Putten",
        tekst:
          "Voorne-Putten sits outside Rotterdam's immediate ring, and that shows with operators who " +
          "have to travel in. Because Spijkenisse is one of our permanent bases, we can schedule " +
          "early morning rides and short-notice bookings here reliably.",
      },
      {
        kop: "Towards Rotterdam and the Randstad",
        tekst:
          "Via the Hartelkering and the A15 you reach Rotterdam quickly from Spijkenisse, and the " +
          "rest of the Randstad from there. We drive to the city centre, to stations, to hospitals " +
          "and to business appointments, always with a fare fixed in advance.",
      },
      {
        kop: "Business travel and the port area",
        tekst:
          "Spijkenisse borders the Rotterdam port and industrial area. For companies we provide " +
          "staff and executive transport with invoicing afterwards, including outside office hours. " +
          "Shift patterns and early departure times are agreed with you in advance.",
      },
    ],
    faq: [
      PRIJS_FAQ_EN,
      {
        q: "Is Spijkenisse a permanent T4XI base?",
        a:
          "Yes. Spijkenisse is one of our two permanent bases, alongside Almere. That lets us " +
          "schedule early morning rides and last-minute bookings on Voorne-Putten reliably, without " +
          "a car having to travel in first.",
      },
      {
        q: "Does T4XI also drive to surrounding towns on Voorne-Putten?",
        a:
          "Yes. Besides Spijkenisse itself we drive across Voorne-Putten and to destinations in the " +
          "Rotterdam region. Enter your pickup address and you will see immediately whether we can " +
          "carry out the ride at a fixed fare.",
      },
      CHAUFFEUR_FAQ_EN,
    ],
  },
];

/** Alle hub-slugs — bron voor routing en sitemap. */
export const STAD_HUB_SLUGS = NL_HUBS.map((hub) => hub.slug);

/** Levert de hub voor deze slug en taal, of null wanneer de slug geen hub is. */
export function getStadHub(slug: string, locale: AirportLandingLocale): StadHub | null {
  const hubs = locale === "en" ? EN_HUBS : NL_HUBS;
  return hubs.find((hub) => hub.slug === slug) ?? null;
}
