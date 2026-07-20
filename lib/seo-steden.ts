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
    "omrijden of wachttijd veranderen er niets aan. Geen taxameter en geen surge pricing, " +
    "ook niet in de spits. Voor ritten tussen 23:00 en 06:00 geldt een nachttarief van " +
    "+15%, dat vooraf in uw prijs is verwerkt.",
};

export const STEDEN: Stad[] = [
  {
    slug: "taxi-almere-schiphol",
    naam: "Almere",
    citySlug: "almere",
    intro:
      "Almere is de grootste stad van Flevoland en ligt via de A6 en A9 op ongeveer drie " +
      "kwartier van Schiphol. T4XI rijdt er 24/7 met een vaste prijs per stadsdeel — u weet " +
      "vooraf precies wat de rit kost, zonder taxameter en zonder surge pricing.",
    vertrekpunten: [
      "Almere Stad Centrum", "Almere Haven", "Almere Buiten", "Almere Poort",
      "Almere Muziekwijk", "Almere Hout", "Almere Oostvaarders",
    ],
    faq: [
      PRIJS_FAQ,
      {
        q: "Hoe laat vertrekt T4XI vanuit Almere naar Schiphol?",
        a:
          "T4XI rijdt 24 uur per dag. Of uw vlucht nu om 05:00 of om 23:00 vertrekt — wij " +
          "zijn er. Boek bij voorkeur minimaal twee uur van tevoren, zodat wij de rit goed " +
          "kunnen inplannen.",
      },
      VLUCHT_FAQ,
      {
        q: "Welk voertuig rijdt vanuit Almere?",
        a:
          "Vanuit Almere rijden wij met een Tesla Model Y — volledig elektrisch, ruim en " +
          "comfortabel voor maximaal 4 passagiers exclusief chauffeur. Adviesbagage: 2 grote " +
          "koffers plus 2 handbagage bij 4 passagiers, of 3 grote koffers bij maximaal 3 " +
          "passagiers. Uw chauffeur beschikt over een geldige Nederlandse taxichauffeurskaart.",
      },
    ],
    metaDescription:
      "Taxi van Almere naar Schiphol met een vaste prijs vooraf per stadsdeel. T4XI rijdt " +
      "24/7 met een volledig elektrische Tesla Model Y. Geen taxameter, geen surge pricing.",
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
          "Co 01 (plug-in hybride). Beide bieden plaats aan maximaal 4 passagiers exclusief " +
          "chauffeur, en de prijs is voor beide gelijk.",
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
