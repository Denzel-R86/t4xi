/**
 * Per-stad content voor de vijf SEO-landingspagina's.
 *
 * ── GEEN PRIJZEN IN DIT BESTAND (Sprint 11, Fase 0) ────────────────────────
 *
 * Tot 2026-07-20 stonden hier vaste bedragen: Utrecht, Den Haag en Almere
 * adverteerden €79 terwijl de prijsengine €85 tot €117 rekende. Bezoekers die via
 * Google binnenkwamen — het verkeer met de hoogste koopintentie — kregen dus een
 * prijs te zien die niet werd gehonoreerd.
 *
 * Prijzen komen daarom uitsluitend uit `loadRateCard()`, dezelfde bron als
 * /tarieven en /api/pricing/quote. Zet hier nooit een bedrag terug, ook niet in
 * lopende tekst of in een metaDescription.
 *
 * Twee steden hebben géén stadsbrede prijs: Utrecht en Almere kennen alleen
 * wijkroutes. Eén getal zou daar per definitie misleidend zijn. De pagina toont
 * daarom de wijktabel en verwijst naar de prijsberekening.
 *
 * ── TOEGESTANE FORMULERINGEN ───────────────────────────────────────────────
 *
 * Vluchten:  "Wij volgen uw vluchtstatus en passen het ophaalmoment aan wanneer
 *             uw vlucht vertraagd is."  — NOOIT "automatisch" of "realtime".
 * Wachten:   "Na de landing is 60 minuten wachttijd inbegrepen."
 * Chauffeur: "Uw chauffeur beschikt over een geldige Nederlandse
 *             taxichauffeurskaart."
 *
 * Niet gebruiken: altijd op tijd · op tijd gegarandeerd · vanaf · gratis
 * annuleren · beoordelingscijfers · aantal uitgevoerde ritten.
 *
 * LET OP bij vertrekpunten: noem alleen plaatsen waarvoor daadwerkelijk een vaste
 * route bestaat. De oude lijst noemde onder meer Zeist, Wassenaar en Barendrecht;
 * daar is geen tarief voor, dus dat wekte een verwachting die de engine niet kan
 * inlossen.
 */

export type Stad = {
  slug: string;
  naam: string;
  /** Sleutel naar de stad in loadRateCard() — bepaalt welke tarieven getoond worden. */
  citySlug: string;
  /** Introtekst zonder enig bedrag. */
  intro: string;
  vertrekpunten: string[];
  faq: { q: string; a: string }[];
  metaDescription: string;
};

export type AirportLandingLocale = "nl" | "en";

/** Locale-specifieke stadstekst; route- en tariefsleutels blijven taalneutraal. */
export type LocalizedStad = Stad & {
  /** Meta title zonder de globale T4XI-suffix. */
  metaTitle: string;
  /** Waarde die de bestaande boekingsflow als ophaalplaats herkent. */
  bookingPickupName: string;
  /** Optionele presentatielaag voor Nederlandse locatienamen uit de live rate-card. */
  rateLabelTranslations: Readonly<Record<string, string>>;
};

/** Antwoorden die op elke stadspagina identiek moeten luiden. */
const VLUCHT_FAQ = {
  q: "Volgt T4XI mijn vlucht bij vertraging?",
  a:
    "Ja. Wij volgen uw vluchtstatus op basis van het vluchtnummer dat u bij de boeking " +
    "opgeeft, en passen het ophaalmoment aan wanneer uw vlucht vertraagd is. Na de " +
    "landing is 60 minuten wachttijd inbegrepen voor uitstappen, grenscontrole en " +
    "bagage. Extra wachttijd die niet door de vluchtvertraging komt, stemmen wij vooraf af.",
};

const PRIJS_FAQ = {
  q: "Hoe weet ik wat mijn rit kost?",
  a:
    "U ziet de vaste prijs voordat u boekt: vul uw ophaaladres en bestemming in en de " +
    "prijs verschijnt direct, inclusief btw. Die prijs staat vast bij bevestiging — files, " +
    "omrijden of wachttijd veranderen daar niets aan. We gebruiken geen taxameter of " +
    "dynamische prijsverhogingen. Voor ritten tussen 23.00 en 06.00 uur geldt een " +
    "nachttarief van 15%; dit is vooraf in uw prijs verwerkt.",
};

export const STEDEN: Stad[] = [
  {
    slug: "taxi-almere-schiphol",
    naam: "Almere",
    citySlug: "almere",
    intro:
      "Almere is de grootste stad van Flevoland en ligt via de A6 en A9 op ongeveer drie " +
      "kwartier van Schiphol. T4XI rijdt er 24/7 met een vaste prijs per stadsdeel — u weet " +
      "vooraf precies wat de rit kost, zonder taxameter of onverwachte prijsstijgingen.",
    vertrekpunten: [
      "Almere Stad Centrum", "Almere Haven", "Almere Buiten", "Almere Poort",
      "Almere Muziekwijk", "Almere Hout", "Almere Oostvaarders",
    ],
    faq: [
      PRIJS_FAQ,
      {
        q: "Hoe laat vertrekt T4XI vanuit Almere naar Schiphol?",
        a:
          "T4XI rijdt 24 uur per dag. Of uw vlucht nu om 05.00 of om 23.00 uur vertrekt, " +
          "we rijden dag en nacht. Boek bij voorkeur minimaal twee uur van tevoren, zodat " +
          "we de rit goed kunnen inplannen.",
      },
      VLUCHT_FAQ,
      {
        q: "Welk voertuig rijdt vanuit Almere?",
        a:
          "Uw rit wordt zorgvuldig toegewezen binnen onze premium voertuigklasse. Die biedt " +
          "plaats aan maximaal 4 passagiers, exclusief de chauffeur. Bagageadvies: 2 grote " +
          "koffers plus 2 stuks handbagage bij 4 passagiers, of 3 grote koffers bij maximaal 3 " +
          "passagiers. Deel uw bagage vooraf, zodat wij de beschikbare ruimte kunnen bevestigen.",
      },
    ],
    metaDescription:
      "Taxi van Almere naar Schiphol met een vaste prijs vooraf per stadsdeel. T4XI rijdt " +
      "24/7 met een premium voertuigklasse. Geen taxameter of onverwachte prijsstijgingen.",
  },
  {
    slug: "taxi-amsterdam-schiphol",
    naam: "Amsterdam",
    citySlug: "amsterdam",
    intro:
      "Amsterdam ligt via de A10 en A4 op twintig tot vijfendertig minuten van Schiphol " +
      "Airport. T4XI rijdt er 24/7 met een vaste prijs per stadsdeel, zodat u vooraf weet " +
      "wat de rit kost — ongeacht het verkeer.",
    vertrekpunten: [
      "Amsterdam Centrum", "Zuidas", "Amsterdam Oost", "Amsterdam Noord",
      "Oud-Zuid / De Pijp", "Zuidoost / Bijlmer",
    ],
    faq: [
      PRIJS_FAQ,
      {
        q: "Hoe lang duurt de rit van Amsterdam naar Schiphol?",
        a:
          "Gemiddeld twintig tot vijfendertig minuten, afhankelijk van het vertrekpunt en de " +
          "drukte. Wij kiezen de snelste route via de A10 Ring of de A4. Loopt het verkeer " +
          "tegen, dan verandert dat niets aan uw prijs.",
      },
      VLUCHT_FAQ,
      {
        q: "Kan ik op een specifiek adres worden opgehaald?",
        a:
          "Ja. T4XI haalt u op aan de voordeur, ook in smalle grachtenstraten. Geef uw exacte " +
          "adres op bij de boeking; daarmee bepalen wij automatisch de juiste vaste prijs " +
          "voor uw stadsdeel.",
      },
      {
        q: "Welke voertuigen rijden vanuit Amsterdam?",
        a:
          "In Amsterdam rijden wij met een Tesla Model Y (volledig elektrisch) en een Lynk & " +
          "Co 01 (plug-inhybride). Beide bieden plaats aan maximaal 4 passagiers, exclusief " +
          "de chauffeur. De prijs is voor beide voertuigen gelijk.",
      },
    ],
    metaDescription:
      "Taxi van Amsterdam naar Schiphol met een vaste prijs vooraf per stadsdeel. T4XI rijdt " +
      "24/7 vanuit Centrum, Zuidas, Noord en Oost. Tesla Model Y en Lynk & Co 01.",
  },
  {
    slug: "taxi-rotterdam-schiphol",
    naam: "Rotterdam",
    citySlug: "rotterdam",
    intro:
      "Rotterdam ligt via de A4 en A13 op ongeveer een uur van Schiphol. T4XI rijdt er 24/7 " +
      "met een vaste prijs per wijk — u weet vooraf wat de rit kost, ook bij avondspits of " +
      "een vroege ochtendvlucht.",
    vertrekpunten: [
      "Rotterdam Centrum", "Kralingen", "Hillegersberg", "Blijdorp",
      "Delfshaven", "Prins Alexander",
    ],
    faq: [
      PRIJS_FAQ,
      {
        q: "Hoe lang duurt de rit van Rotterdam naar Schiphol?",
        a:
          "Reken op ongeveer een uur, afhankelijk van uw wijk en de drukte op de A4 en A13. " +
          "Voor een vroege vlucht adviseren wij ruim op tijd te vertrekken; bij de planning " +
          "denken wij met u mee.",
      },
      VLUCHT_FAQ,
      {
        q: "Rijdt T4XI ook naar Rotterdam The Hague Airport?",
        a:
          "Ja. Ook voor Rotterdam The Hague Airport geldt een vaste prijs vooraf. Vul uw " +
          "ophaaladres en de luchthaven in om uw prijs te zien.",
      },
    ],
    metaDescription:
      "Taxi van Rotterdam naar Schiphol met een vaste prijs vooraf per wijk. T4XI rijdt 24/7 " +
      "vanuit Centrum, Kralingen, Hillegersberg en Blijdorp. Geen taxameter.",
  },
  {
    slug: "taxi-den-haag-schiphol",
    naam: "Den Haag",
    citySlug: "den-haag",
    intro:
      "Den Haag ligt via de A4 op drie kwartier van Schiphol. T4XI rijdt er 24/7 met een " +
      "vaste prijs per wijk, van Scheveningen tot Ypenburg — vooraf bekend en inclusief btw.",
    vertrekpunten: [
      "Den Haag Centrum", "Scheveningen", "Benoordenhout",
      "Statenkwartier", "Ypenburg", "Loosduinen",
    ],
    faq: [
      PRIJS_FAQ,
      {
        q: "Vanuit welke Haagse wijken rijdt T4XI?",
        a:
          "Wij rijden vanuit heel Den Haag, met vaste prijzen per wijk voor onder meer " +
          "Centrum, Scheveningen, Benoordenhout, Statenkwartier, Ypenburg en Loosduinen. " +
          "Vul uw adres in en u ziet direct de prijs die voor u geldt.",
      },
      VLUCHT_FAQ,
      {
        q: "Is er een toeslag voor vroege ochtendvluchten?",
        a:
          "Voor ritten tussen 23:00 en 06:00 geldt een nachttarief van +15%. Dat is vooraf in " +
          "uw prijs verwerkt, dus u komt achteraf nooit voor een verrassing te staan.",
      },
    ],
    metaDescription:
      "Taxi van Den Haag naar Schiphol met een vaste prijs vooraf per wijk. T4XI rijdt 24/7 " +
      "vanuit Centrum, Scheveningen, Benoordenhout en Ypenburg. Geen taxameter.",
  },
  {
    slug: "taxi-utrecht-schiphol",
    naam: "Utrecht",
    citySlug: "utrecht",
    intro:
      "Utrecht ligt via de A2 en A9 op drie kwartier tot een uur van Schiphol. T4XI rijdt er " +
      "24/7 met een vaste prijs per stadsdeel — van Leidsche Rijn tot het Utrecht Science " +
      "Park, vooraf bekend en inclusief btw.",
    vertrekpunten: ["Utrecht Centrum", "Leidsche Rijn", "De Uithof / Utrecht Science Park"],
    faq: [
      PRIJS_FAQ,
      {
        q: "Vanuit welke delen van Utrecht rijdt T4XI?",
        a:
          "Wij rijden onder meer vanuit Utrecht Centrum, Leidsche Rijn en het Utrecht Science " +
          "Park. Uw prijs hangt af van uw stadsdeel; vul uw adres in en u ziet direct welk " +
          "tarief voor u geldt.",
      },
      VLUCHT_FAQ,
      {
        q: "Rijdt T4XI ook naar andere steden vanuit Utrecht?",
        a:
          "Ja. Naast luchthavenvervoer rijden wij ook intercityritten, bijvoorbeeld naar " +
          "Amsterdam. Ook daarvoor geldt een vaste prijs vooraf.",
      },
    ],
    metaDescription:
      "Taxi van Utrecht naar Schiphol met een vaste prijs vooraf per stadsdeel. T4XI rijdt " +
      "24/7 vanuit Centrum, Leidsche Rijn en Utrecht Science Park. Geen taxameter.",
  },
];

type TranslatedStadContent = Pick<
  LocalizedStad,
  "naam" | "intro" | "vertrekpunten" | "faq" | "metaDescription" | "metaTitle"
> & {
  rateLabelTranslations?: Readonly<Record<string, string>>;
};

const ENGLISH_CITY_CONTENT: Readonly<Record<string, TranslatedStadContent>> = {
  "taxi-almere-schiphol": {
    naam: "Almere",
    metaTitle: "Private taxi from Almere to Schiphol — fixed fare",
    metaDescription:
      "Book a private taxi from Almere to Schiphol with a fixed fare confirmed in advance. " +
      "Door-to-door airport travel, available 24/7 across Almere's districts.",
    intro:
      "Travel from Almere to Amsterdam Airport Schiphol in quiet, private comfort. We collect " +
      "you at your door, confirm the fare before you book and plan the journey around your " +
      "flight — with no meter and no traffic-related fare increases.",
    vertrekpunten: [
      "Almere City Centre", "Almere Haven", "Almere Buiten", "Almere Poort",
      "Almere Muziekwijk", "Almere Hout", "Almere Oostvaarders",
    ],
    rateLabelTranslations: {
      "Almere Stad Centrum": "Almere City Centre",
    },
    faq: [
      {
        q: "How do I know the fare from Almere to Schiphol?",
        a:
          "Enter your collection address and destination to see the fixed fare before booking. " +
          "The quoted fare includes VAT and remains fixed once confirmed, even when traffic is " +
          "heavier than expected. The 15% night rate for journeys between 23:00 and 06:00 is " +
          "included in the price shown to you.",
      },
      {
        q: "When can T4XI collect me in Almere?",
        a:
          "T4XI operates day and night, including for early departures and late arrivals. We " +
          "recommend booking at least two hours ahead so the journey can be planned with care.",
      },
      {
        q: "Does T4XI monitor my flight?",
        a:
          "Yes. Add your flight number when booking and we will monitor its status. For airport " +
          "collections, we adjust the collection time when the flight is delayed; 60 minutes of " +
          "waiting time after landing is included.",
      },
      {
        q: "What kind of vehicle will collect me?",
        a:
          "Your journey is assigned to T4XI's premium vehicle class, with seating for up to four " +
          "passengers excluding the driver. Please share your luggage requirements when booking " +
          "so we can confirm that everything fits comfortably.",
      },
    ],
  },
  "taxi-amsterdam-schiphol": {
    naam: "Amsterdam",
    metaTitle: "Private taxi from Amsterdam to Schiphol — fixed fare",
    metaDescription:
      "Book a private taxi from Amsterdam to Schiphol with a fixed fare confirmed in advance. " +
      "Door-to-door airport transfers from the city centre, Zuidas, North and East.",
    intro:
      "A composed start to your journey, from any Amsterdam address to Schiphol. Your driver " +
      "collects you at the door, your fare is confirmed in advance and the route is planned for " +
      "the traffic conditions on the day.",
    vertrekpunten: [
      "Amsterdam City Centre", "Zuidas", "Amsterdam East", "Amsterdam North",
      "Oud-Zuid / De Pijp", "Amsterdam Southeast / Bijlmer",
    ],
    rateLabelTranslations: {
      "Amsterdam Centrum": "Amsterdam City Centre",
      "Amsterdam Oost": "Amsterdam East",
      "Amsterdam Noord": "Amsterdam North",
      "Amsterdam Zuidoost": "Amsterdam Southeast",
    },
    faq: [
      {
        q: "How do I know the fare from Amsterdam to Schiphol?",
        a:
          "Enter your collection address and destination to see the fixed fare before booking. " +
          "The quoted fare includes VAT and remains fixed once confirmed, even when traffic is " +
          "heavier than expected. The 15% night rate for journeys between 23:00 and 06:00 is " +
          "included in the price shown to you.",
      },
      {
        q: "How long does the journey from Amsterdam to Schiphol take?",
        a:
          "Allow roughly twenty to thirty-five minutes, depending on your collection address and " +
          "traffic around the A10 and A4. We plan the route for the conditions on the day; extra " +
          "time in traffic does not change a confirmed fixed fare.",
      },
      {
        q: "Can I be collected from a specific Amsterdam address?",
        a:
          "Yes. We provide door-to-door collection throughout Amsterdam, including addresses in " +
          "the historic centre. Enter the full address when booking so we can calculate the " +
          "correct route and fare.",
      },
      {
        q: "Does T4XI monitor my flight?",
        a:
          "Yes. Add your flight number when booking and we will monitor its status. For airport " +
          "collections, we adjust the collection time when the flight is delayed; 60 minutes of " +
          "waiting time after landing is included.",
      },
      {
        q: "Which vehicle will be used for my journey?",
        a:
          "Your booking is assigned to T4XI's premium vehicle class. The fleet includes a Tesla " +
          "Model Y and a Lynk & Co 01; the exact vehicle depends on operational availability and " +
          "does not change your confirmed fare.",
      },
    ],
  },
  "taxi-rotterdam-schiphol": {
    naam: "Rotterdam",
    metaTitle: "Private taxi from Rotterdam to Schiphol — fixed fare",
    metaDescription:
      "Book a private taxi from Rotterdam to Schiphol with a fixed fare confirmed in advance. " +
      "Door-to-door airport transfers, available 24/7 across Rotterdam.",
    intro:
      "Settle in for a private, carefully planned journey from Rotterdam to Schiphol. We collect " +
      "you at your address, confirm the fare before departure and allow for the conditions on " +
      "the A4 and A13 — whether you travel at dawn or during the evening peak.",
    vertrekpunten: [
      "Rotterdam City Centre", "Kralingen", "Hillegersberg", "Blijdorp",
      "Delfshaven", "Prins Alexander",
    ],
    rateLabelTranslations: {
      "Rotterdam Centrum": "Rotterdam City Centre",
    },
    faq: [
      {
        q: "How do I know the fare from Rotterdam to Schiphol?",
        a:
          "Enter your collection address and destination to see the fixed fare before booking. " +
          "The quoted fare includes VAT and remains fixed once confirmed, even when traffic is " +
          "heavier than expected. The 15% night rate for journeys between 23:00 and 06:00 is " +
          "included in the price shown to you.",
      },
      {
        q: "How long does the journey from Rotterdam to Schiphol take?",
        a:
          "Allow approximately one hour, depending on your collection address and traffic on the " +
          "A4 and A13. For early flights, we help you choose a sensible collection time with an " +
          "appropriate margin.",
      },
      {
        q: "Does T4XI monitor my flight?",
        a:
          "Yes. Add your flight number when booking and we will monitor its status. For airport " +
          "collections, we adjust the collection time when the flight is delayed; 60 minutes of " +
          "waiting time after landing is included.",
      },
      {
        q: "Can I also book Rotterdam The Hague Airport?",
        a:
          "Yes. T4XI also serves Rotterdam The Hague Airport. Enter your collection address and " +
          "the airport in the fare calculator to see the current fixed price for your journey.",
      },
    ],
  },
  "taxi-den-haag-schiphol": {
    naam: "The Hague",
    metaTitle: "Private taxi from The Hague to Schiphol — fixed fare",
    metaDescription:
      "Book a private taxi from The Hague to Schiphol with a fixed fare confirmed in advance. " +
      "Door-to-door airport transfers from the city centre, Scheveningen and beyond.",
    intro:
      "Travel from The Hague to Schiphol with the details arranged before you leave. We collect " +
      "you at the door, confirm the fare in advance and plan the A4 journey around your flight " +
      "and the traffic conditions on the day.",
    vertrekpunten: [
      "The Hague City Centre", "Scheveningen", "Benoordenhout",
      "Statenkwartier", "Ypenburg", "Loosduinen",
    ],
    rateLabelTranslations: {
      "Den Haag": "The Hague",
      "Den Haag Centrum": "The Hague City Centre",
    },
    faq: [
      {
        q: "How do I know the fare from The Hague to Schiphol?",
        a:
          "Enter your collection address and destination to see the fixed fare before booking. " +
          "The quoted fare includes VAT and remains fixed once confirmed, even when traffic is " +
          "heavier than expected. The 15% night rate for journeys between 23:00 and 06:00 is " +
          "included in the price shown to you.",
      },
      {
        q: "Which parts of The Hague does T4XI serve?",
        a:
          "We collect throughout The Hague, including the city centre, Scheveningen, " +
          "Benoordenhout, Statenkwartier, Ypenburg and Loosduinen. Enter your exact address to " +
          "see the fare available for your route.",
      },
      {
        q: "Does T4XI monitor my flight?",
        a:
          "Yes. Add your flight number when booking and we will monitor its status. For airport " +
          "collections, we adjust the collection time when the flight is delayed; 60 minutes of " +
          "waiting time after landing is included.",
      },
      {
        q: "Is there a surcharge for an early-morning journey?",
        a:
          "Journeys between 23:00 and 06:00 use a 15% night rate. It is already included in the " +
          "fare shown before you book, so there is no unexpected charge afterwards.",
      },
    ],
  },
  "taxi-utrecht-schiphol": {
    naam: "Utrecht",
    metaTitle: "Private taxi from Utrecht to Schiphol — fixed fare",
    metaDescription:
      "Book a private taxi from Utrecht to Schiphol with a fixed fare confirmed in advance. " +
      "Door-to-door airport transfers from the city centre, Leidsche Rijn and Science Park.",
    intro:
      "A calm, direct airport journey from Utrecht to Schiphol, planned around your departure. " +
      "We collect you at your address and confirm the fare before you book, from the historic " +
      "centre to Leidsche Rijn and Utrecht Science Park.",
    vertrekpunten: ["Utrecht City Centre", "Leidsche Rijn", "De Uithof / Utrecht Science Park"],
    rateLabelTranslations: {
      "Utrecht Centrum": "Utrecht City Centre",
    },
    faq: [
      {
        q: "How do I know the fare from Utrecht to Schiphol?",
        a:
          "Enter your collection address and destination to see the fixed fare before booking. " +
          "The quoted fare includes VAT and remains fixed once confirmed, even when traffic is " +
          "heavier than expected. The 15% night rate for journeys between 23:00 and 06:00 is " +
          "included in the price shown to you.",
      },
      {
        q: "Which parts of Utrecht does T4XI serve?",
        a:
          "Current fixed routes include Utrecht City Centre, Leidsche Rijn and Utrecht Science " +
          "Park. Enter your exact collection address to see the current fare available for your " +
          "journey.",
      },
      {
        q: "Does T4XI monitor my flight?",
        a:
          "Yes. Add your flight number when booking and we will monitor its status. For airport " +
          "collections, we adjust the collection time when the flight is delayed; 60 minutes of " +
          "waiting time after landing is included.",
      },
      {
        q: "Can I book other intercity journeys from Utrecht?",
        a:
          "Yes. In addition to airport transfers, T4XI provides selected intercity journeys. " +
          "Use the fare calculator or contact us with your itinerary for the current options.",
      },
    ],
  },
};

/** Eén bron voor de route-identiteit, met locale-specifieke presentatietekst. */
export function getLocalizedStad(slug: string, locale: AirportLandingLocale): LocalizedStad | undefined {
  const base = STEDEN.find((stad) => stad.slug === slug);
  if (!base) return undefined;

  if (locale === "nl") {
    return {
      ...base,
      metaTitle: `Taxi ${base.naam} naar Schiphol — vaste prijs vooraf`,
      bookingPickupName: base.naam,
      rateLabelTranslations: {},
    };
  }

  const translated = ENGLISH_CITY_CONTENT[slug];
  if (!translated) return undefined;
  return {
    ...base,
    ...translated,
    bookingPickupName: base.naam,
    rateLabelTranslations: translated.rateLabelTranslations ?? {},
  };
}

export function getAirportLandingLocale(locale: string): AirportLandingLocale {
  return locale === "en" ? "en" : "nl";
}
