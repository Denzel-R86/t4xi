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
  duration: "3,2 uur rijden",
  km: "~250 km",
  tagline: "Het Venetië van het Noorden",
  desc: "Brugge is een van de best bewaarde middeleeuwse steden van Europa. De kanalen, het belfort en de ambachtelijke chocolade maken het een onvergetelijke bestemming. T4XI brengt u rechtstreeks naar het hart van deze sprookjesstad.",
  luggage: "Bagage in overleg",
  highlights: [],
  price: "€795",
  image: "/dagtochten/brugge.jpg",
  itinerary: [
    "Vertrek vanuit Amsterdam, Almere of Rotterdam",
    "Aankomst Markt Brugge — Belfort bestijgen (optioneel)",
    "Kanaalwandeling door het historisch centrum",
    "Lunch op de Burg of de Markt",
    "Choco-Story Museum of Groeningemuseum",
    "Vrije tijd: chocolatiers & brouwerij De Halve Maan",
    "Vertrek richting Nederland",
    "Aankomst thuis",
  ],
};

const FEATURED_NL = {
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

const ROUTES: Route[] = [
  BRUGGE,
  {
    slug: "gent", name: "Gent", emoji: "🏛️", flag: "🇧🇪", country: "be", countryName: "België",
    image: "/dagtochten/gent.jpg",
    duration: "2,8 uur rijden", km: "~220 km",
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
    image: "/dagtochten/brussel.jpg",
    duration: "2,7 uur rijden", km: "~205 km",
    tagline: "De hoofdstad van Europa: de Grote Markt, art nouveau, het Atomium en Belgische frieten.",
    desc: "De hoofdstad van Europa barst van cultuur: de Grote Markt op de UNESCO-Werelderfgoedlijst, het Atomium, prachtige art-nouveauarchitectuur en de beroemde Belgische keuken.",
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
    image: "/dagtochten/keulen.jpg",
    duration: "3,1 uur rijden", km: "~265 km",
    tagline: "De Dom die de hemel raakt, en een stad vol kunst, bier en Rijnromantiek.",
    desc: "De Kölner Dom domineert het stadssilhouet en is een absolute must-see. Combineer dit met moderne kunst, de Rijnpromenade en authentiek Kölsch-bier in een traditioneel Brauhaus.",
    luggage: "Bagage in overleg",
    highlights: ["Kölner Dom — UNESCO-Werelderfgoed", "Museum Ludwig (moderne kunst)", "Rijnpromenade & Altstadt", "Kölsch-bierproeverij in een Brauhaus"],
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
    duration: "2,2 uur rijden", km: "~165 km",
    tagline: "Diamantstad, modestad en havenstad in één — Rubens en haute couture naast elkaar.",
    desc: "Antwerpen is een internationale diamant- en modestad. Van Rubens tot hedendaagse couture — de compacte binnenstad is verrassend veelzijdig.",
    luggage: "Bagage in overleg",
    highlights: ["Rubenshuis & Koninklijk Museum", "Diamantwijk", "Grote Markt & Onze-Lieve-Vrouwekathedraal", "Modemuseum MoMu"],
    price: "€595",
    image: "/dagtochten/antwerpen.jpg",
    itinerary: [
      "Vertrek vanuit Amsterdam, Almere of Rotterdam",
      "Aankomst — Grote Markt & Stadhuis",
      "Onze-Lieve-Vrouwekathedraal (Rubens altaarstukken)",
      "Lunch in het historisch centrum",
      "Diamantwijk of MoMu Modemuseum",
      "Zurenborg — art-nouveauarchitectuur",
      "Vertrek richting Nederland",
      "Aankomst thuis",
    ],
  },
  {
    slug: "rijnvallei", name: "Rijnvallei", emoji: "🏰", flag: "🇩🇪", country: "de", countryName: "Duitsland",
    duration: "4,6 uur rijden", km: "~415 km",
    tagline: "Kastelen op rotsen, wijngaarden en de mythische Loreleiklip langs Europa's mooiste rivier.",
    desc: "Het Boven-Middenrijndal staat op de UNESCO-Werelderfgoedlijst — en terecht. Kasteelruïnes op de bergtoppen, wijngaarden zover het oog reikt en de mythische Lorelei bepalen het landschap.",
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
    image: "/dagtochten/luxemburg.jpg",
    duration: "4,9 uur rijden", km: "~415 km",
    tagline: "UNESCO-vestingstad op een rots, met ondergrondse kazematten en een verfijnde culinaire scene.",
    desc: "Luxemburg-Stad is een karaktervolle vestingstad op een rots, met ondergrondse kazematten, een charmante benedenstad en een verfijnd culinair aanbod.",
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
    desc: "Van maart tot mei verandert de Bollenstreek in een kleurrijk landschap. Keukenhof toont in het voorjaar meer dan zeven miljoen bloembollen in bloei.",
    luggage: "Bagage in overleg",
    highlights: ["Keukenhof (maart–mei)", "Bollenvelden langs de N208", "Kasteel Keukenhof", "Amsterdamse Waterleidingduinen"],
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
    image: "/dagtochten/dusseldorf.jpg",
    duration: "2,7 uur rijden", km: "~225 km",
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
    image: "/dagtochten/delft.jpg",
    duration: "1 uur rijden", km: "~70 km",
    tagline: "Delfts blauw, Vermeer en het Mauritshuis — koninklijke cultuur op één dag.",
    desc: "Een dag vol Vermeer, Delfts blauw en koninklijke allure. Van de schilderachtige grachten van Delft naar het Mauritshuis in Den Haag, met desgewenst een strandwandeling in Scheveningen.",
    luggage: "Bagage in overleg",
    highlights: ["Royal Delft — De Porceleyne Fles", "Mauritshuis — Meisje met de parel", "Binnenhof & Hofvijver", "Strand van Scheveningen"],
    price: "€499",
    itinerary: [
      "Vertrek vanuit Amsterdam, Almere of Rotterdam",
      "Aankomst Delft — Markt & Nieuwe Kerk",
      "Royal Delft — De Porceleyne Fles",
      "Lunch in Delft",
      "Rijden naar Den Haag — Mauritshuis",
      "Binnenhof & Hofvijver",
      "Strand van Scheveningen (optioneel)",
      "Terugrit",
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
    desc: "De Dom van Keulen, de Rijnvallei en het Zwarte Woud. Op slechts 2 tot 3 uur rijden beginnen de sprookjesachtige Duitse landschappen.",
  },
  {
    code: "lu" as Country,
    flag: "🇱🇺",
    name: "Luxemburg",
    desc: "Een compact land met maximale impact: vestingstad Luxemburg, de Ardennen en wijngaarden langs de Moezel. Onontdekt en onvergetelijk.",
  },
];

/** Aantal beschikbare routes per land, geteld uit ROUTES. */
export function routeCount(country: Country): number {
  return ROUTES.filter((r) => r.country === country).length;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ENGELSE LAAG (stap 4 — i18n)
 *
 * De Nederlandse data hierboven blijft de bron: prijzen, slugs, afstanden,
 * emoji, vlaggen en volgorde staan één keer vast en veranderen niet. Deze laag
 * levert UITSLUITEND de vertaalde tekstvelden (naam, landnaam, rijtijd-label,
 * tagline, omschrijving, bagage, highlights, dagprogramma). Alles wat een prijs
 * of route raakt komt onverkort uit de NL-structuur.
 * ═══════════════════════════════════════════════════════════════════════════ */

export type Locale = "nl" | "en";

type RouteCopy = {
  name: string;
  countryName: string;
  duration: string;
  tagline: string;
  desc: string;
  luggage: string;
  highlights: string[];
  itinerary: string[];
};

const EN_ROUTES: Record<string, RouteCopy> = {
  brugge: {
    name: "Bruges",
    countryName: "Belgium",
    duration: "3.2 h drive",
    tagline: "The Venice of the North",
    desc: "Bruges is one of the best-preserved medieval cities in Europe. Its canals, belfry and hand-crafted chocolates make it an unforgettable destination. T4XI takes you straight to the heart of this fairy-tale city.",
    luggage: "Luggage by arrangement",
    highlights: [],
    itinerary: [
      "Departure from Amsterdam, Almere or Rotterdam",
      "Arrival at the Markt in Bruges — climb the Belfry (optional)",
      "Canal-side stroll through the historic centre",
      "Lunch on the Burg or the Markt",
      "Choco-Story Museum or the Groeninge Museum",
      "Free time: chocolatiers & the De Halve Maan brewery",
      "Departure back to the Netherlands",
      "Arrival home",
    ],
  },
  gent: {
    name: "Ghent",
    countryName: "Belgium",
    duration: "2.8 h drive",
    tagline: "A medieval city with vibrant student life and the iconic Gravensteen.",
    desc: "Ghent combines medieval grandeur with a lively student culture. The Gravensteen, the Graslei and the culinary Patershol quarter make it a perfect day trip.",
    luggage: "Luggage by arrangement",
    highlights: [
      "Gravensteen (Castle of the Counts)",
      "Korenmarkt & historic city centre",
      "Patershol — the culinary quarter",
      "MSK Ghent art museum",
    ],
    itinerary: [
      "Departure from Amsterdam, Almere or Rotterdam",
      "Arrival — start at the Gravensteen (castle)",
      "Walk along the Graslei & Korenlei",
      "Lunch in the Patershol",
      "Design Museum Gent or SMAK",
      "Free time & shopping for Tierenteyn mustard",
      "Departure back to the Netherlands",
      "Arrival home",
    ],
  },
  brussel: {
    name: "Brussels",
    countryName: "Belgium",
    duration: "2.7 h drive",
    tagline: "The capital of Europe: the Grand-Place, Art Nouveau, the Atomium and Belgian fries.",
    desc: "The capital of Europe is bursting with culture: the UNESCO Grand-Place, the Atomium, beautiful Art Nouveau architecture and, of course, the celebrated Belgian cuisine.",
    luggage: "Luggage on request",
    highlights: [
      "Grand-Place — UNESCO World Heritage",
      "Atomium & Mini-Europe",
      "Royal Palace & Mont des Arts",
      "Chocolate and beer tasting",
    ],
    itinerary: [
      "Departure from Amsterdam, Almere or Rotterdam",
      "Arrival — Grand-Place & Manneken Pis",
      "Walk through the Galeries Royales Saint-Hubert",
      "Lunch near the Place Sainte-Catherine",
      "Atomium & Mini-Europe",
      "Chocolate shops & waffle tasting",
      "Departure back to the Netherlands",
      "Arrival home",
    ],
  },
  keulen: {
    name: "Cologne",
    countryName: "Germany",
    duration: "3.1 h drive",
    tagline: "The cathedral that touches the sky, in a city full of art, beer and Rhine romance.",
    desc: "Cologne Cathedral dominates the skyline and is an absolute must-see. Pair it with modern art, a crossing of the Rhine and authentic Kölsch beer in a traditional Brauhaus.",
    luggage: "Luggage by arrangement",
    highlights: [
      "Cologne Cathedral — UNESCO World Heritage",
      "Museum Ludwig (modern art)",
      "Rhine promenade & Altstadt",
      "Kölsch beer tasting in a Brauhaus",
    ],
    itinerary: [
      "Departure from Amsterdam, Almere or Rotterdam",
      "Arrival in Cologne — visit to the cathedral",
      "Walk through the Altstadt & along the Rhine promenade",
      "Lunch in a traditional Brauhaus (Kölsch!)",
      "Museum Ludwig or the Römisch-Germanisches Museum",
      "Free time to shop on the Schildergasse",
      "Departure back to the Netherlands",
      "Arrival home",
    ],
  },
  antwerpen: {
    name: "Antwerp",
    countryName: "Belgium",
    duration: "2.2 h drive",
    tagline: "A city of diamonds, fashion and a world-class port — Rubens and haute couture side by side.",
    desc: "Antwerp is an international centre for diamonds and fashion. From Rubens to contemporary couture, its compact city centre is remarkably diverse.",
    luggage: "Luggage by arrangement",
    highlights: [
      "Rubens House & Royal Museum",
      "Diamond District — the most exclusive quarter in the world",
      "Grote Markt & the Cathedral of Our Lady",
      "MoMu Fashion Museum",
    ],
    itinerary: [
      "Departure from Amsterdam, Almere or Rotterdam",
      "Arrival — Grote Markt & City Hall",
      "Cathedral of Our Lady (Rubens altarpieces)",
      "Lunch in the historic centre",
      "Diamond District or the MoMu Fashion Museum",
      "Zurenborg quarter — Art Nouveau architecture",
      "Departure back to the Netherlands",
      "Arrival home",
    ],
  },
  rijnvallei: {
    name: "Rhine Valley",
    countryName: "Germany",
    duration: "4.6 h drive",
    tagline: "Castles on cliffs, vineyards and the mythical Lorelei rock along Europe's most beautiful river.",
    desc: "The Upper Middle Rhine is officially a UNESCO World Heritage Site — and rightly so. Castle ruins on every hilltop, vineyards as far as the eye can see and the mystical Lorelei rock.",
    luggage: "Luggage by arrangement",
    highlights: [
      "The Lorelei rock & the Boppard Rhine ferry",
      "Rheinfels Castle (St. Goar)",
      "Bacharach — a medieval wine town",
      "Rüdesheim — wine tasting on the Drosselgasse",
    ],
    itinerary: [
      "Early departure from Amsterdam, Almere or Rotterdam",
      "Arrival in Bacharach — a medieval town",
      "Rheinfels Castle (St. Goar) — a walk",
      "Lunch with a view of the Rhine",
      "Visit to the Lorelei rock",
      "Rüdesheim — the Drosselgasse & wine tasting",
      "Departure back to the Netherlands",
      "Arrival home",
    ],
  },
  luxemburg: {
    name: "Luxembourg City",
    countryName: "Luxembourg",
    duration: "4.9 h drive",
    tagline: "A UNESCO fortress city on a rock, with underground casemates and a refined culinary scene.",
    desc: "Luxembourg City is a distinctive fortress city on a rock, with underground casemates, a charming lower town and a refined culinary scene.",
    luggage: "Luggage by arrangement",
    highlights: [
      "Bock Casemates — underground fortifications",
      "Grund (the lower town) on the Alzette",
      "Grand Ducal Palace",
      "MUDAM — Musée d'Art Moderne",
    ],
    itinerary: [
      "Early departure from Amsterdam, Almere or Rotterdam",
      "Arrival — Chemin de la Corniche (panoramic walk)",
      "Bock Casemates — underground fortifications",
      "Lunch in Grund (the lower town)",
      "Grand Ducal Palace & Place Guillaume II",
      "MUDAM Museum of Modern Art",
      "Departure back to the Netherlands",
      "Arrival home",
    ],
  },
  keukenhof: {
    name: "Keukenhof & the Bulb Region",
    countryName: "Netherlands",
    duration: "45 min drive",
    tagline: "Seven million flowers in one garden. The most colourful spectacle in the Netherlands.",
    desc: "From March to May, the Bulb Region becomes a vast, colourful landscape. In spring, Keukenhof displays more than seven million flowering bulbs.",
    luggage: "Luggage by arrangement",
    highlights: [
      "Keukenhof Gardens (Mar–May)",
      "Bulb fields along the N208",
      "Keukenhof Castle",
      "The Amsterdam Water Supply Dunes",
    ],
    itinerary: [
      "Departure from Amsterdam",
      "Arrival at the Keukenhof — opening",
      "A walk through the gardens (3–4 h)",
      "Lunch in the Keukenhof Restaurant",
      "Drive through the bulb fields along the N208",
      "Keukenhof Castle (exterior)",
      "Return to Amsterdam",
      "Arrival home",
    ],
  },
  dusseldorf: {
    name: "Düsseldorf",
    countryName: "Germany",
    duration: "2.7 h drive",
    tagline: "Fashion, design and the Königsallee — Germany's most elegant shopping street.",
    desc: "Düsseldorf is Germany's most elegant city — fashion, design and the famous \"Kö\" (Königsallee). Combine high-end shopping with art and an Altbier in the Altstadt.",
    luggage: "Luggage by arrangement",
    highlights: [
      "Königsallee (the \"Kö\") — luxury shopping",
      "Altstadt & Rhine promenade",
      "Kunstsammlung NRW (K20 & K21)",
      "MedienHafen — avant-garde architecture",
    ],
    itinerary: [
      "Departure from Amsterdam, Almere or Rotterdam",
      "Arrival — a walk along the Königsallee",
      "Altstadt & Rhine promenade",
      "Lunch in the MedienHafen",
      "Kunstsammlung NRW K20 or K21",
      "Free time for shopping or a visit to the Japanisches Viertel",
      "Departure back to the Netherlands",
      "Arrival home",
    ],
  },
  delft: {
    name: "Delft & The Hague",
    countryName: "Netherlands",
    duration: "1 h drive",
    tagline: "Delftware, Vermeer, the Mauritshuis — royal culture in a single day.",
    desc: "A day full of Vermeer, Delftware and royal allure. From the picturesque canals of Delft to the prestigious Mauritshuis in The Hague — and then a beach walk in Scheveningen.",
    luggage: "Luggage by arrangement",
    highlights: [
      "Royal Delft — De Porceleyne Fles",
      "Mauritshuis — Girl with a Pearl Earring",
      "Binnenhof & Hofvijver",
      "Scheveningen beach",
    ],
    itinerary: [
      "Departure from Amsterdam, Almere or Rotterdam",
      "Arrival in Delft — Markt & Nieuwe Kerk",
      "Royal Delft — De Porceleyne Fles",
      "Lunch in Delft",
      "Drive to The Hague — the Mauritshuis",
      "Binnenhof & Hofvijver",
      "Scheveningen beach (optional)",
      "Departure back to Amsterdam",
      "Arrival home",
    ],
  },
};

/** Vertaalde landomschrijvingen (naam + desc). Aantallen blijven afgeleid. */
const EN_LANDEN: Record<Country, { name: string; desc: string }> = {
  be: {
    name: "Belgium",
    desc: "From the canals of Bruges to the Art Nouveau of Brussels and the beers of Ghent. Belgium hides some of Europe's richest culture.",
  },
  nl: {
    name: "Netherlands",
    desc: "Tulip fields, windmills, the Rijksmuseum and Keukenhof. The Netherlands keeps surprising and is ideal for a day trip from the city.",
  },
  de: {
    name: "Germany",
    desc: "Cologne's cathedral, the Rhine Valley, the Black Forest. Germany's fairy-tale landscapes begin just 2 to 3 hours' drive away.",
  },
  lu: {
    name: "Luxembourg",
    desc: "The mini-country with maximum impact: the fortress city of Luxembourg, the Ardennes and vineyards along the Moselle. Undiscovered and unforgettable.",
  },
};

/** Engelse laag voor de uitgelichte dagtocht (Brugge). */
const EN_FEATURED = {
  name: "Bruges",
  countryName: "Belgium",
  title: "The Venice of the North",
  desc: "A medieval city centre, celebrated canals and world-famous chocolate. Bruges is just over three hours' drive from Amsterdam — a full day trip with T4XI.",
  points: [
    "Around 3.2 hours' drive from Amsterdam",
    "Up to 4 passengers excluding the driver",
    "Door to door, no stops in between",
    "Return package available",
  ],
};

/** Legt de Engelse tekstlaag over een NL-route; NL blijft ongewijzigd. */
function localizeRoute(r: Route, locale: Locale): Route {
  if (locale === "nl") return r;
  const c = EN_ROUTES[r.slug];
  if (!c) return r;
  return {
    ...r,
    name: c.name,
    countryName: c.countryName,
    duration: c.duration,
    tagline: c.tagline,
    desc: c.desc,
    luggage: c.luggage,
    highlights: c.highlights,
    itinerary: c.itinerary,
  };
}

/** DE routes voor een locale — prijzen/slugs/afstanden onveranderd. */
export function getRoutes(locale: Locale): Route[] {
  return ROUTES.map((r) => localizeRoute(r, locale));
}

/** De uitgelichte dagtocht (Brugge) voor een locale. */
export function getFeatured(locale: Locale) {
  if (locale === "nl") return FEATURED_NL;
  return {
    ...FEATURED_NL,
    name: EN_FEATURED.name,
    countryName: EN_FEATURED.countryName,
    title: EN_FEATURED.title,
    desc: EN_FEATURED.desc,
    points: FEATURED_NL.points.map((p, i) => ({ ...p, text: EN_FEATURED.points[i] })),
    modal: localizeRoute(BRUGGE, locale),
  };
}

/** Landen met afgeleid routeaantal, vertaald per locale. */
export function getCountries(locale: Locale) {
  return LANDEN.map((l) => {
    const n = routeCount(l.code);
    const copy = locale === "nl" ? { name: l.name, desc: l.desc } : EN_LANDEN[l.code];
    const count =
      locale === "nl"
        ? `${n} route${n === 1 ? "" : "s"} beschikbaar`
        : `${n} route${n === 1 ? "" : "s"} available`;
    return { ...l, name: copy.name, desc: copy.desc, count };
  });
}
