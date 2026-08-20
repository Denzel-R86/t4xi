import type { AirportLandingLocale } from "@/lib/seo-steden";

/**
 * Gedeelde interfacecopy voor de vijf Schiphol-routes. Stadsspecifieke copy
 * staat in seo-steden.ts; zo vertalen we herbruikbare UI maar één keer.
 */
export const AIRPORT_LANDING_COPY = {
  nl: {
    heroEyebrow: "Premium taxivervoer",
    heroDestination: "naar Schiphol",
    heroBullets: [
      "Ophalen bij uw voordeur",
      "Wij volgen uw vluchtstatus bij vertraging",
      "Premium voertuigklasse — zorgvuldig toegewezen",
      "Maximaal 4 passagiers excl. chauffeur · bagage vooraf afgestemd",
    ],
    bookNow: "Direct boeken",
    callUs: "Bel ons",
    departurePoints: "Vertrekpunten",
    usps: [
      {
        icon: "lock",
        title: "Vaste prijs",
        text: "Vooraf bekend en inclusief btw. Geen taxameter of onverwachte prijsstijgingen bij druk verkeer.",
      },
      {
        icon: "plane",
        title: "Wij volgen uw vlucht",
        text: "Geef uw vluchtnummer op; bij een luchthavenophaalrit passen we het moment aan bij vertraging. Na de landing is 60 minuten wachttijd inbegrepen.",
      },
      {
        icon: "car",
        title: "Premium voertuigklasse",
        text: "Een stille, representatieve rit met ruimte voor maximaal vier passagiers. Bagage stemmen we vooraf met u af.",
      },
      {
        icon: "clock",
        title: "24/7 beschikbaar",
        text: "Vroege vluchten, late aankomsten en last-minute ritten. Wij rijden dag en nacht.",
      },
    ],
    why: (city: string) => `Waarom T4XI voor ${city} → Schiphol`,
    contentHeading: "Comfortabel naar Schiphol",
    contentHeadingAccent: "van voordeur tot vertrekhal",
    contentParagraphs: (city: string) => [
      `Voor een rit vanuit ${city} naar Schiphol wilt u vooraf weten waar u aan toe bent. Daarom bevestigen we een vaste prijs en maken we duidelijke afspraken over de ophaaltijd en uw bagage.`,
      `Onze chauffeurs rijden regelmatig tussen ${city} en Schiphol. We plannen voldoende reistijd in en kiezen op de dag zelf de route die het beste past bij de verkeerssituatie.`,
      "Geef bij uw boeking het vluchtnummer op. Zo kunnen we uw rit zorgvuldig rondom uw reis plannen en bij een ophaalrit vanaf de luchthaven rekening houden met vertraging.",
    ],
    localHeading: (city: string) => `Vertrekpunten in en om ${city}`,
    localIntro: "T4XI haalt u op bij uw voordeur. Voor de onderstaande vertrekpunten zijn vaste routes beschikbaar:",
    unlisted:
      "Staat uw plaatsnaam er niet bij? Bel of WhatsApp ons. We kijken graag of we de rit kunnen uitvoeren en maken een offerte op maat.",
    exactFareLead: "Benieuwd naar het exacte bedrag voor uw rit?",
    exactFareLink: "Bereken uw vaste ritprijs",
    exactFareTail:
      "— kies uw ophaaladres, eventuele tussenstops en bestemming en zie direct de vaste prijs.",
    faqEyebrow: "Veelgestelde vragen",
    faqTitle: (city: string) => `${city} → Schiphol FAQ`,
    ctaEyebrow: "Klaar om te boeken?",
    ctaTitle: (city: string) => `${city} → Schiphol met vaste prijs`,
    ctaText:
      "Vul uw adres in en u ziet direct wat de rit kost. Die prijs staat vast bij bevestiging — ook als het verkeer tegenzit.",
    calculateFare: "Bereken uw prijs",
    whatsappMessage: (city: string) => `Hallo T4XI, ik wil een taxi van ${city} naar Schiphol boeken.`,
    rateTable: {
      eyebrow: "Vaste tarieven",
      oneWay: "Enkele rit, inclusief btw. Uw prijs hangt af van uw stadsdeel.",
      returnNote: "Retour en nachttarief (23:00–06:00, +15%) worden in uw prijs verwerkt.",
      fallback: "Vul uw ophaaladres en bestemming in om uw vaste prijs te zien.",
      button: "Bereken uw prijs",
      flightNote:
        "Wij volgen uw vluchtstatus. Bij een ophaalrit vanaf Schiphol passen we het moment aan wanneer uw vlucht vertraagd is; 60 minuten wachttijd na landing is inbegrepen.",
    },
    breadcrumbHome: "Home",
    serviceType: (city: string) => `Taxivervoer van ${city} naar Schiphol`,
  },
  en: {
    heroEyebrow: "Private airport travel",
    heroDestination: "to Schiphol",
    heroBullets: [
      "Door-to-door collection",
      "Flight status monitored when a flight number is provided",
      "Premium vehicle class — carefully assigned",
      "Up to 4 passengers excluding the driver · luggage agreed in advance",
    ],
    bookNow: "Book your journey",
    callUs: "Call T4XI",
    departurePoints: "Collection areas",
    usps: [
      {
        icon: "lock",
        title: "Fixed fare",
        text: "Confirmed in advance and inclusive of VAT. No meter and no traffic-related fare increase.",
      },
      {
        icon: "plane",
        title: "Flight monitoring",
        text: "Add your flight number. For airport collections, we adjust the time after a delay; 60 minutes after landing is included.",
      },
      {
        icon: "car",
        title: "Premium vehicle class",
        text: "A quiet, presentable journey with room for up to four passengers. Luggage is agreed with you in advance.",
      },
      {
        icon: "clock",
        title: "Available 24/7",
        text: "From first departures to late-night arrivals, T4XI operates around the clock.",
      },
    ],
    why: (city: string) => `Why choose T4XI from ${city} to Schiphol`,
    contentHeading: "Your airport journey,",
    contentHeadingAccent: "considered from door to terminal",
    contentParagraphs: (city: string) => [
      `A journey from ${city} to Schiphol should feel settled before you leave. We confirm the fare, collection time and luggage arrangements in advance, so the essential details are already taken care of.`,
      `Our drivers regularly travel between ${city} and Schiphol. We allow an appropriate margin and choose the route that best suits the traffic conditions on the day.`,
      "Add your flight number when booking. It helps us plan your journey with care and, for collections at Schiphol, respond when an arrival is delayed.",
    ],
    localHeading: (city: string) => `Collection areas in and around ${city}`,
    localIntro: "T4XI collects you at the door. Fixed routes are currently available from these areas:",
    unlisted:
      "Is your area not listed? Call or WhatsApp us. We will check availability and provide a tailored quotation where possible.",
    exactFareLead: "Would you like the exact fare for your journey?",
    exactFareLink: "Calculate your fixed fare",
    exactFareTail: "— add your collection address, any stops and destination to see the current price.",
    faqEyebrow: "Frequently asked questions",
    faqTitle: (city: string) => `${city} to Schiphol — your questions answered`,
    ctaEyebrow: "Ready when you are",
    ctaTitle: (city: string) => `${city} to Schiphol, with the fare settled in advance`,
    ctaText:
      "Enter your address to see the current fixed fare. Once confirmed, that price remains unchanged if traffic is heavier than expected.",
    calculateFare: "Calculate your fare",
    whatsappMessage: (city: string) => `Hello T4XI, I would like to book a taxi from ${city} to Schiphol.`,
    rateTable: {
      eyebrow: "Current fixed fares",
      oneWay: "One-way journey, including VAT. The fare depends on your collection area.",
      returnNote: "Return journeys and the 15% night rate (23:00–06:00) are included when applicable.",
      fallback: "Enter your collection address and destination to see the current fixed fare.",
      button: "Calculate your fare",
      flightNote:
        "We monitor your flight status. For a collection at Schiphol, we adjust the time when your flight is delayed; 60 minutes after landing is included.",
    },
    breadcrumbHome: "Home",
    serviceType: (city: string) => `Private taxi transfer from ${city} to Amsterdam Airport Schiphol`,
  },
} as const;

export function getAirportLandingCopy(locale: AirportLandingLocale) {
  return AIRPORT_LANDING_COPY[locale];
}
