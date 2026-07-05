/** Per-stad data voor de vijf SEO-landingspagina's — uit de t4xi_v14 bron (taxi-*-schiphol.html). */

export type Stad = {
  slug: string;
  naam: string;
  prijs: string;
  retour: string;
  nacht: string;
  afstand: string;
  reistijd: string;
  intro: string;
  vertrekpunten: string[];
  faq: { q: string; a: string }[];
  metaDescription: string;
};

export const STEDEN: Stad[] = [
  {
    slug: "taxi-almere-schiphol",
    naam: "Almere",
    prijs: "€79",
    retour: "€142",
    nacht: "€91",
    afstand: "48 km",
    reistijd: "35–45 min",
    intro:
      "Almere is de grootste stad van Flevoland en ligt op circa 48 km van Schiphol. De rit duurt gemiddeld 35 tot 45 minuten via de A6 en A9. T4XI rijdt 24/7 met een vaste prijs van €79 — geen taxameter, geen surge pricing.",
    vertrekpunten: ["Almere Stad", "Almere Haven", "Almere Buiten", "Almere Poort", "Almere Muziekwijk"],
    faq: [
      { q: "Wat kost een taxi van Almere naar Schiphol?", a: "De vaste prijs voor een enkele rit van Almere naar Schiphol is €79. Retour betaal je €142. Geen taxameter, geen verrassingen achteraf." },
      { q: "Hoe laat vertrekt T4XI vanuit Almere naar Schiphol?", a: "T4XI rijdt 24/7. Of je vlucht nu om 05:00 of 23:00 vertrekt — wij zijn er. Boek minimaal 2 uur van tevoren voor optimale beschikbaarheid." },
      { q: "Volgt T4XI mijn vlucht bij vertraging?", a: "Ja. Wij monitoren je vluchtnummer en passen de ophaaltijd automatisch aan bij vertraging. Je hoeft ons niet te bellen." },
      { q: "Welk voertuig rijdt vanuit Almere?", a: "Vanuit Almere rijden wij standaard met een Tesla Model Y — volledig elektrisch, ruim en comfortabel voor maximaal 4 passagiers exclusief chauffeur." },
    ],
    metaDescription:
      "Taxi van Almere naar Schiphol voor een vaste prijs. T4XI rijdt 24/7 vanuit alle Almere-stadsdelen. Tesla Model Y, op tijd gegarandeerd.",
  },
  {
    slug: "taxi-amsterdam-schiphol",
    naam: "Amsterdam",
    prijs: "€69",
    retour: "€124",
    nacht: "€79",
    afstand: "22 km",
    reistijd: "20–35 min",
    intro:
      "Amsterdam ligt op ongeveer 22 km van Schiphol Airport. Via de A10 South en A4 is Schiphol in 20 tot 35 minuten bereikbaar. T4XI rijdt 24/7 met een vaste prijs van €69 — geen taxameter, geen surge pricing.",
    vertrekpunten: ["Amsterdam Centrum", "Zuidas", "Amsterdam Oost", "Amsterdam Noord", "Amsterdam West", "Amstelveen", "Buitenveldert"],
    faq: [
      { q: "Wat kost een taxi van Amsterdam naar Schiphol?", a: "T4XI rekent een vaste prijs van €69 voor een enkele rit van Amsterdam naar Schiphol, ongeacht het vertrekadres binnen Amsterdam." },
      { q: "Hoe lang duurt de rit van Amsterdam naar Schiphol?", a: "Gemiddeld 20 tot 35 minuten, afhankelijk van het vertrekpunt en de verkeersdrukte. Via de A10 Ring of A4 — wij kiezen de snelste route." },
      { q: "Kan ik ook ophalen worden op een specifiek adres?", a: "Ja, T4XI haalt je op aan de voordeur — ook in smalle Amsterdamse grachtenstraten. Geef je exacte adres op bij de boeking." },
      { q: "Welke voertuigen rijden vanuit Amsterdam?", a: "In Amsterdam beschikken wij over een Tesla Model Y en een Lynk & Co 01 plug-in hybrid. Maximaal 4 passagiers per auto, exclusief chauffeur. Adviesbagage: 2 grote koffers + 2 handbagage bij 4 passagiers." },
    ],
    metaDescription:
      "Taxi van Amsterdam naar Schiphol voor €69 vast. T4XI rijdt 24/7 vanuit Centrum, Zuidas, Noord en West. Tesla Model Y en Lynk & Co 01.",
  },
  {
    slug: "taxi-rotterdam-schiphol",
    naam: "Rotterdam",
    prijs: "€119",
    retour: "€214",
    nacht: "€137",
    afstand: "80 km",
    reistijd: "55–70 min",
    intro:
      "Rotterdam ligt op circa 80 km van Schiphol Airport. De rit via de A13 of A20 duurt gemiddeld 55 tot 70 minuten. T4XI rijdt 24/7 met een vaste prijs van €119 — geen taxameter, geen surge pricing.",
    vertrekpunten: ["Rotterdam Centrum", "Rotterdam Zuid", "Rotterdam Noord", "Kralingen", "Hillegersberg", "Capelle aan den IJssel", "Barendrecht"],
    faq: [
      { q: "Wat kost een taxi van Rotterdam naar Schiphol?", a: "De vaste prijs van Rotterdam naar Schiphol is €119 voor een enkele rit. Retour betaal je €214. Inclusief alle toeslagen, exclusief nachttarief (23:00–06:00, +15%)." },
      { q: "Is er ook een taxi vanuit Rotterdam naar Rotterdam Airport?", a: "Ja, voor Rotterdam The Hague Airport (Zestienhoven) rekenen wij €39 voor een enkele rit vanuit Rotterdam centrum." },
      { q: "Hoe lang rijden we van Rotterdam naar Schiphol?", a: "Gemiddeld 55 tot 70 minuten via de A13 of A20 richting Amsterdam. Bij avondritten buiten de spits is de rit vaak sneller." },
      { q: "Rijdt T4XI ook vroeg in de ochtend vanuit Rotterdam?", a: "Ja, T4XI rijdt 24/7 inclusief vroege ochtendvluchten. Wij monitoren je vlucht en staan op tijd voor de deur." },
    ],
    metaDescription:
      "Taxi van Rotterdam naar Schiphol voor €119 vast. T4XI rijdt 24/7 vanuit heel Rotterdam. Tesla Model Y, vluchttijden gemonitord.",
  },
  {
    slug: "taxi-den-haag-schiphol",
    naam: "Den Haag",
    prijs: "€79",
    retour: "€142",
    nacht: "€91",
    afstand: "45 km",
    reistijd: "35–50 min",
    intro:
      "Den Haag ligt op circa 45 km van Schiphol Airport. Via de A4 is Schiphol gemiddeld in 35 tot 50 minuten bereikbaar. T4XI rijdt 24/7 met een vaste prijs van €79 — geen taxameter, geen surge pricing.",
    vertrekpunten: ["Den Haag Centrum", "Scheveningen", "Rijswijk", "Leidschendam", "Voorburg", "Wassenaar", "Zoetermeer"],
    faq: [
      { q: "Wat kost een taxi van Den Haag naar Schiphol?", a: "De vaste prijs van Den Haag naar Schiphol is €79 voor een enkele rit. Retour betaal je €142. Prijs geldt voor maximaal 4 passagiers exclusief chauffeur; bagage wordt vooraf afgestemd." },
      { q: "Rijdt T4XI ook vanuit Scheveningen of Rijswijk naar Schiphol?", a: "Ja, wij halen je op bij elk adres in en rondom Den Haag — inclusief Scheveningen, Rijswijk, Leidschendam en Voorburg." },
      { q: "Kan ik ook van Schiphol terug naar Den Haag?", a: "Uiteraard. Een retourrit van Schiphol naar Den Haag kost €142 totaal als je heenrit ook via T4XI gaat. Geef bij de boeking aan dat je een retour wilt." },
      { q: "Hoe laat staat T4XI klaar als mijn vlucht vertraagd is?", a: "Wij monitoren uw vluchtnummer en passen de ophaaltijd automatisch aan. U hoeft ons niet te bellen bij vertraging." },
    ],
    metaDescription:
      "Taxi van Den Haag naar Schiphol voor €79 vast. T4XI rijdt 24/7 vanuit Den Haag, Scheveningen en Rijswijk. Vluchttijden gemonitord.",
  },
  {
    slug: "taxi-utrecht-schiphol",
    naam: "Utrecht",
    prijs: "€79",
    retour: "€142",
    nacht: "€91",
    afstand: "55 km",
    reistijd: "40–55 min",
    intro:
      "Utrecht ligt op circa 55 km van Schiphol Airport. Via de A2 en A9 duurt de rit gemiddeld 40 tot 55 minuten. T4XI rijdt 24/7 met een vaste prijs van €79 — geen taxameter, geen surge pricing.",
    vertrekpunten: ["Utrecht Centrum", "Leidsche Rijn", "Vleuten", "De Uithof", "Zeist", "Nieuwegein", "IJsselstein"],
    faq: [
      { q: "Wat kost een taxi van Utrecht naar Schiphol?", a: "T4XI rekent €79 voor een enkele rit van Utrecht naar Schiphol. Retour kost €142. Vaste prijs, ongeacht verkeersdrukte." },
      { q: "Hoe laat moet ik boeken voor een vroege vlucht vanuit Utrecht?", a: "Wij adviseren minimaal 2 uur vóór gewenste vertrektijd te boeken. Voor vluchten voor 07:00 is reserveren de avond ervoor aanbevolen." },
      { q: "Is het vertrekpunt Utrecht Centraal of mijn huisadres?", a: "T4XI haalt je op bij jouw deur — thuis, kantoor of hotel. Geef je exacte adres op bij de boeking." },
      { q: "Rijdt T4XI ook vanuit de Uithof of andere universiteitswijk?", a: "Ja, wij rijden vanuit elk adres in Utrecht en omgeving. Studenten en internationale medewerkers van de UU zijn van harte welkom." },
    ],
    metaDescription:
      "Taxi van Utrecht naar Schiphol voor €79 vast. T4XI rijdt vanuit Utrecht Centrum, Leidsche Rijn, Vleuten en omgeving. Vaste prijs, 24/7.",
  },
];
