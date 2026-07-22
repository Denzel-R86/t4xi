/** Dagtochten-routedata — overgenomen uit het t4xi_v14 bronbestand (dagtochten.html). */

export type Country = "be" | "nl" | "de" | "lu";

export type Route = {
  slug: string;
  name: string;
  emoji: string;
  flag: string;
  country: Country;
  countryName: string;
  duration: string;
  km: string;
  tagline: string;
  desc: string;
  luggage: string;
  highlights: string[];
  price: string;
  /**
   * Programmaonderdelen ZONDER kloktijden.
   *
   * Tot 2026-07-21 stonden hier vaste tijden ("07:30 vertrek — 10:30 aankomst").
   * Een meting via OSRM liet zien dat die rijtijden niet haalbaar zijn: de
   * gepubliceerde afstanden waren tot 43% te laag en de rijtijden tot 53%.
   * Bij Rijnvallei kostte de lus langs alle vier de stops 12,5 uur rijden
   * binnen een dag van 13,5 uur.
   *
   * Tijden komen pas terug wanneer ze per route zijn doorgemeten en de
   * productdefinitie uit ADR-012 vaststaat.
   */
  itinerary: string[];
  /** True als de route niet als standaardarrangement leverbaar is. */
  onAanvraag?: boolean;
  /**
   * Optioneel bestemmingsbeeld onder /public/dagtochten/<slug>.jpg. Wanneer leeg
   * valt de kaart terug op het emoji-vlak. Nieuwe eigen foto toevoegen = bestand
   * plaatsen en dit veld zetten; er verandert verder niets aan de kaart.
   * Bronnen (gecureerd, T4XI): brugge · antwerpen (Grote Markt) · rijnvallei
   * (Rüdesheim) · keukenhof (Bollenstreek).
   */
  image?: string;
};

/**
 * Brugge — de uitgelichte dagtocht op /dagtochten.
 *
 * Stond tot 2026-07-21 los gedefinieerd binnen FEATURED.modal en ontbrak
 * daardoor in ROUTES: het filterbare raster liet Brugge niet zien, en elke
 * telling over ROUTES rapporteerde België één route te laag. Nu één definitie,
 * waar FEATURED naar verwijst.
 */
const BRUGGE: Route = {
  slug: "brugge",
  name: "Brugge",
  emoji: "🏰",
  flag: "🇧🇪",
  country: "be" as Country,
  countryName: "België",
  duration: "3,2u rijden",
  km: "~250 km",
  tagline: "Het Venetië van het Noorden",
  desc: "Brugge is een van de best bewaarde middeleeuwse steden van Europa. De kanalen, klokketoren en handgebakken chocolaatjes maken het een onvergetelijke bestemming. T4XI brengt u rechtstreeks naar het hart van deze sprookjesstad.",
  luggage: "Bagage in overleg",
  highlights: [],
  price: "€795",
  image: "/dagtochten/brugge.jpg",
  itinerary: [
    "Vertrek vanuit Amsterdam, Almere of Rotterdam",
    "Aankomst Markt Brugge — Belfort bestijgen (optioneel)",
    "Kanaalwandeling door het historisch centrum",
    "Lunch in de Burg of op de Markt",
    "Choco-Story Museum of Groeningemuseum",
    "Vrije tijd: chocolatiers & brouwerij De Halve Maan",
    "Vertrek richting Nederland",
    "Aankomst thuis",
  ],
};

export const FEATURED = {
  name: "Brugge",
  flag: "🇧🇪",
  countryName: "België",
  emoji: "🏰",
  title: "Het Venetië van het Noorden",
  desc: "Middeleeuws stadscentrum, bekende kanalen en wereldberoemde chocolade. Brugge is op ruim drie uur rijden vanuit Amsterdam — een volwaardige dagtrip met T4XI.",
  points: [
    { icon: "clock", text: "Circa 3,2 uur rijden vanuit Amsterdam" },
    { icon: "users", text: "Max. 4 passagiers exclusief chauffeur" },
    { icon: "map-pin", text: "Deur-tot-deur, geen tussenstops" },
    { icon: "coin", text: "Retourpakket beschikbaar" },
  ],
  modal: BRUGGE,
};

export const ROUTES: Route[] = [
  BRUGGE,
  {
    slug: "gent", name: "Gent", emoji: "🏛️", flag: "🇧🇪", country: "be", countryName: "België",
    duration: "2,8u rijden", km: "~220 km",
    tagline: "Middeleeuwse stad met bruisend studentenleven en iconische Gravensteen.",
    desc: "Gent combineert middeleeuwse grandeur met een bruisende studentencultuur. Het Gravensteen, de Graslei en de culinaire Patershol-wijk maken het tot een perfecte dagtrip.",
    luggage: "Bagage in overleg",
    highlights: ["Gravensteen (Kasteel van de Graven)", "Korenmarkt & historische binnenstad", "Patershol — culinaire wijk", "Kunstmuseum MSK Gent"],
    price: "€725",
    itinerary: [
      "Vertrek vanuit Amsterdam, Almere of Rotterdam",
      "Aankomst — start bij Gravensteen (kasteel)",
      "Wandeling langs Graslei & Korenlei",
      "Lunch in het Patershol",
      "Design Museum Gent of SMAK",
      "Vrije tijd & Tierenteyn-mosterd winkelen",
      "Vertrek richting Nederland",
      "Aankomst thuis",
    ],
  },
  {
    slug: "brussel", name: "Brussel", emoji: "🍺", flag: "🇧🇪", country: "be", countryName: "België",
    duration: "2,7u rijden", km: "~205 km",
    tagline: "De hoofdstad van Europa: Grand Place, Art Nouveau, Atomium en Belgische frietjes.",
    desc: "De hoofdstad van Europa barst van cultuur: de UNESCO Grand Place, het Atomium, prachtige Art Nouveau architectuur en uiteraard de beroemde Belgische keuken.",
    luggage: "Bagage op aanvraag",
    highlights: ["Grand Place — UNESCO Werelderfgoed", "Atomium & Mini-Europe", "Koninklijk Paleis & Kunstberg", "Chocolade- en bierproeverij"],
    price: "€795",
    itinerary: [
      "Vertrek vanuit Amsterdam, Almere of Rotterdam",
      "Aankomst — Grand Place & Manneken Pis",
      "Wandeling door de Galeries Royales Saint-Hubert",
      "Lunch in de buurt van Place Sainte-Catherine",
      "Atomium & Mini-Europe",
      "Chocoladewinkels & wafels proeven",
      "Vertrek richting Nederland",
      "Aankomst thuis",
    ],
  },
  {
    slug: "keulen", name: "Keulen", emoji: "⛪", flag: "🇩🇪", country: "de", countryName: "Duitsland",
    duration: "3,1u rijden", km: "~265 km",
    tagline: "De Dom die de hemel raakt, en een stad vol kunst, bier en Rijnromantiek.",
    desc: "De Kölner Dom domineert het stadssilhouet en is een absolute must-see. Combineer dit met modern kunst, Rijnkruising en authentiek Kölsch bier in een traditioneel Brauhaus.",
    luggage: "Bagage in overleg",
    highlights: ["Kölner Dom — UNESCO Werelderfgoed", "Museum Ludwig (moderne kunst)", "Rijnpromenade & Altstadt", "Kölsch bierproeverij in een Brauhaus"],
    price: "€795",
    itinerary: [
      "Vertrek vanuit Amsterdam, Almere of Rotterdam",
      "Aankomst Keulen — Kölner Dom bezoek",
      "Wandeling Altstadt & Rijnpromenade",
      "Lunch in een traditioneel Brauhaus (Kölsch!)",
      "Museum Ludwig of Römisch-Germanisches Museum",
      "Vrije winkeltijd Schildergasse",
      "Vertrek richting Nederland",
      "Aankomst thuis",
    ],
  },
  {
    slug: "antwerpen", name: "Antwerpen", emoji: "💎", flag: "🇧🇪", country: "be", countryName: "België",
    duration: "2,2u rijden", km: "~165 km",
    tagline: "Diamantstad, modestad en havenstad in één — Rubens en haute couture naast elkaar.",
    desc: "De diamantstad van de wereld en het modehoofdkwartier van de Benelux. Van Rubens tot hedendaagse mode — Antwerpen is compact en verrassend divers.",
    luggage: "Bagage in overleg",
    highlights: ["Rubenshuis & Koninklijk Museum", "Diamantwijk — meest exclusieve wijk ter wereld", "Grote Markt & Onze-Lieve-Vrouwekathedraal", "Modemuseum MoMu"],
    price: "€595",
    image: "/dagtochten/antwerpen.jpg",
    itinerary: [
      "Vertrek vanuit Amsterdam, Almere of Rotterdam",
      "Aankomst — Grote Markt & Stadhuis",
      "Onze-Lieve-Vrouwekathedraal (Rubens altaarstukken)",
      "Lunch in het historisch centrum",
      "Diamantwijk of MoMu Modemuseum",
      "Zurenborg wijk — Art Nouveau architectuur",
      "Vertrek richting Nederland",
      "Aankomst thuis",
    ],
  },
  {
    slug: "rijnvallei", name: "Rijnvallei", emoji: "🏰", flag: "🇩🇪", country: "de", countryName: "Duitsland",
    duration: "4,6u rijden", km: "~415 km",
    tagline: "Kastelen op rotsen, wijngaarden en de mythische Loreleiklip langs Europa's mooiste rivier.",
    desc: "De Bovenrijn is officieel UNESCO Werelderfgoed — en terecht. Kasteelruïnes op iedere bergtop, wijngaarden zo ver het oog reikt en de mystieke Loreleiklip.",
    luggage: "Bagage in overleg",
    highlights: ["Loreleiklip & Rijnveer Boppard", "Kasteel Rheinfels (St. Goar)", "Bacharach — middeleeuwse wijnstad", "Rüdesheim — wijnproeverij Drosselgasse"],
    // De lus langs alle vier de stops is 886 km en 12,5 uur rijden, plus
    // laadstops. Als standaardarrangement binnen één dag niet leverbaar.
    price: "Op aanvraag",
    onAanvraag: true,
    image: "/dagtochten/rijnvallei.jpg",
    itinerary: [
      "Vroeg vertrek vanuit Amsterdam, Almere of Rotterdam",
      "Aankomst Bacharach — middeleeuws stadje",
      "Kasteel Rheinfels (St. Goar) — wandeling",
      "Lunch met uitzicht op de Rijn",
      "Loreleiklip bezoek",
      "Rüdesheim — Drosselgasse & wijnproeverij",
      "Vertrek richting Nederland",
      "Aankomst thuis",
    ],
  },
  {
    slug: "luxemburg", name: "Luxemburg-Stad", emoji: "🏰", flag: "🇱🇺", country: "lu", countryName: "Luxemburg",
    duration: "4,9u rijden", km: "~415 km",
    tagline: "UNESCO-vestingstad op een rots, met ondergrondse kazematten en een verfijnde culinaire scene.",
    desc: "Dit verborgen pareltje is onverdiend onbekend. Een vestingstad op een rots, met ondergrondse kazematten, een charmante benedenstad en een van de hoogste levensstandaarden ter wereld.",
    luggage: "Bagage in overleg",
    highlights: ["Bock Kazematten — ondergronds vestingwerk", "Grund (Benedenstad) aan de Alzette", "Groothertogelijk Paleis", "MUDAM — Musée d'Art Moderne"],
    // 826 km retour en 9,6 uur rijden: met een werkbaar bezoek loopt dit tegen
    // de grenzen van één chauffeursdag. Planning altijd op maat.
    price: "Op aanvraag",
    onAanvraag: true,
    itinerary: [
      "Vroeg vertrek vanuit Amsterdam, Almere of Rotterdam",
      "Aankomst — Chemin de la Corniche (panoramapad)",
      "Bock Kazematten — ondergronds vestingwerk",
      "Lunch in Grund (de Benedenstad)",
      "Groothertogelijk Paleis & Place Guillaume II",
      "MUDAM Museum voor Moderne Kunst",
      "Vertrek richting Nederland",
      "Aankomst thuis",
    ],
  },
  {
    slug: "keukenhof", name: "Keukenhof & Bollenstreek", emoji: "🌷", flag: "🇳🇱", country: "nl", countryName: "Nederland",
    duration: "45 min. rijden", km: "~40 km",
    tagline: "Zeven miljoen bloemen in één tuin. Het meest kleurrijke schouwspel van Nederland.",
    desc: "Van maart tot mei kleurt de Bollenstreek als een gigantisch schilderij. De Keukenhof is 's werelds grootste bloemenstuin met meer dan 7 miljoen bolbloemen.",
    luggage: "Bagage in overleg",
    highlights: ["Keukenhof Tuinen (mrt–mei)", "Bollenvelden langs de N208", "Kasteel Keukenhof", "Duingebied Amsterdamse Waterleidingduinen"],
    price: "€349",
    image: "/dagtochten/keukenhof.jpg",
    itinerary: [
      "Vertrek vanuit Amsterdam",
      "Aankomst Keukenhof — opening",
      "Rondwandeling door de tuinen (3–4u)",
      "Lunch in het Keukenhof Restaurant",
      "Bollenvelden rijden langs de N208",
      "Kasteel Keukenhof (buitenkant)",
      "Terug naar Amsterdam",
      "Aankomst thuis",
    ],
  },
  {
    slug: "dusseldorf", name: "Düsseldorf", emoji: "🛍️", flag: "🇩🇪", country: "de", countryName: "Duitsland",
    duration: "2,7u rijden", km: "~225 km",
    tagline: "Mode, design en de Königsallee — Duitslands meest elegante winkelstraat.",
    desc: "Düsseldorf is Duitslands meest elegante stad — mode, design en de beroemde \"Kö\" (Königsallee). Combineer high-end shopping met kunst en een Altbier in de Altstadt.",
    luggage: "Bagage in overleg",
    highlights: ["Königsallee (de \"Kö\") — luxe shopping", "Altstadt & Rijnpromenade", "Kunstsammlung NRW (K20 & K21)", "MedienHafen — avant-garde architectuur"],
    price: "€795",
    itinerary: [
      "Vertrek vanuit Amsterdam, Almere of Rotterdam",
      "Aankomst — Königsallee wandeling",
      "Altstadt & Rijnpromenade",
      "Lunch in het MedienHafen",
      "Kunstsammlung NRW K20 of K21",
      "Vrije winkeltijd of Japanisches Viertel",
      "Vertrek richting Nederland",
      "Aankomst thuis",
    ],
  },
  {
    slug: "delft", name: "Delft & Den Haag", emoji: "🏺", flag: "🇳🇱", country: "nl", countryName: "Nederland",
    duration: "1u rijden", km: "~70 km",
    tagline: "Delfts Blauw, Vermeer, het Mauritshuis — koninklijke cultuur op één dag.",
    desc: "Een dag vol Vermeer, Delfts Blauw en koninklijke allure. Van de schilderachtige grachten van Delft naar het prestigieuze Mauritshuis in Den Haag — en dan nog een strandwandeling in Scheveningen.",
    luggage: "Bagage in overleg",
    highlights: ["Koninklijk Porseleinfabriek De Porceleyne Fles", "Mauritshuis — Meisje met de Parel", "Binnenhof & Hofvijver", "Scheveningen Strand"],
    price: "€499",
    itinerary: [
      "Vertrek vanuit Amsterdam, Almere of Rotterdam",
      "Aankomst Delft — Markt & Nieuwe Kerk",
      "Koninklijke Porceleinfabriek De Porceleyne Fles",
      "Lunch in Delft",
      "Rijden naar Den Haag — Mauritshuis",
      "Binnenhof & Hofvijver",
      "Scheveningen strand (optioneel)",
      "Vertrek richting Amsterdam",
      "Aankomst thuis",
    ],
  },
];

/**
 * Landen met hun aanbod. Het AANTAL routes wordt afgeleid uit ROUTES en staat
 * hier bewust niet als vaste waarde.
 *
 * Tot 2026-07-21 stonden hier handmatige tellingen die samen 18 routes
 * beloofden terwijl er 10 bestonden — een claim die met elke toevoeging verder
 * uit de pas liep. Een afgeleid getal kan niet verouderen.
 */
const LANDEN: { code: Country; flag: string; name: string; desc: string }[] = [
  {
    code: "be" as Country,
    flag: "🇧🇪",
    name: "België",
    desc: "Van de kanalen van Brugge tot de Art Nouveau van Brussel en het bier van Gent. België verbergt Europa's rijkste cultuur.",
  },
  {
    code: "nl" as Country,
    flag: "🇳🇱",
    name: "Nederland",
    desc: "Tulpenvelden, molens, het Rijksmuseum, de Keukenhof. Ons eigen land blijft verrassen en is perfect als dagtrip vanuit de grote stad.",
  },
  {
    code: "de" as Country,
    flag: "🇩🇪",
    name: "Duitsland",
    desc: "Keulen's Dom, de Rijnvallei, het Zwarte Woud. Op slechts 2 tot 3 uur rijden beginnen de Duits sprookjesachtige landschappen.",
  },
  {
    code: "lu" as Country,
    flag: "🇱🇺",
    name: "Luxemburg",
    desc: "Het mini-land met maximi impact: vestingstad Luxemburg, de Ardennen en wijngaarden langs de Moezel. Onontdekt en onvergetelijk.",
  },
];

/** Aantal beschikbare routes per land, geteld uit ROUTES. */
export function routeCount(country: Country): number {
  return ROUTES.filter((r) => r.country === country).length;
}

export const COUNTRIES = LANDEN.map((l) => {
  const n = routeCount(l.code);
  return { ...l, count: `${n} route${n === 1 ? "" : "s"} beschikbaar` };
});
