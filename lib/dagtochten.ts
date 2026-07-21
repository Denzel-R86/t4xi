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
  itinerary: { t: string; a: string }[];
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
  duration: "ca. 2,5u",
  km: "~240 km",
  tagline: "Het Venetië van het Noorden",
  desc: "Brugge is een van de best bewaarde middeleeuwse steden van Europa. De kanalen, klokketoren en handgebakken chocolaatjes maken het een onvergetelijke bestemming. T4XI brengt u rechtstreeks naar het hart van deze sprookjesstad.",
  luggage: "Bagage in overleg",
  highlights: [],
  price: "€795",
  itinerary: [
    { t: "08:00", a: "Vertrek vanuit Amsterdam, Almere of Rotterdam" },
    { t: "10:30", a: "Aankomst Markt Brugge — Belfort bestijgen (optioneel)" },
    { t: "11:30", a: "Kanaalwandeling door het historisch centrum" },
    { t: "13:00", a: "Lunch in de Burg of op de Markt" },
    { t: "14:30", a: "Choco-Story Museum of Groeningemuseum" },
    { t: "16:00", a: "Vrije tijd: chocolatiers & brouwerij De Halve Maan" },
    { t: "17:30", a: "Vertrek richting Nederland" },
    { t: "20:00", a: "Aankomst thuis" },
  ],
};

export const FEATURED = {
  name: "Brugge",
  flag: "🇧🇪",
  countryName: "België",
  emoji: "🏰",
  title: "Het Venetië van het Noorden",
  desc: "Middeleeuws stadscentrum, bekende kanalen en wereldberoemde chocolade. Brugge is op 2,5 uur rijden vanuit Amsterdam — een perfecte dagtrip met T4XI.",
  points: [
    { icon: "clock", text: "Circa 2,5 uur rijden vanuit Amsterdam" },
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
    duration: "2u rijden", km: "~200 km",
    tagline: "Middeleeuwse stad met bruisend studentenleven en iconische Gravensteen.",
    desc: "Gent combineert middeleeuwse grandeur met een bruisende studentencultuur. Het Gravensteen, de Graslei en de culinaire Patershol-wijk maken het tot een perfecte dagtrip.",
    luggage: "Bagage in overleg",
    highlights: ["Gravensteen (Kasteel van de Graven)", "Korenmarkt & historische binnenstad", "Patershol — culinaire wijk", "Kunstmuseum MSK Gent"],
    price: "€725",
    itinerary: [
      { t: "08:30", a: "Vertrek vanuit Amsterdam, Almere of Rotterdam" },
      { t: "10:30", a: "Aankomst — start bij Gravensteen (kasteel)" },
      { t: "12:00", a: "Wandeling langs Graslei & Korenlei" },
      { t: "13:00", a: "Lunch in het Patershol" },
      { t: "14:30", a: "Design Museum Gent of SMAK" },
      { t: "16:00", a: "Vrije tijd & Tierenteyn-mosterd winkelen" },
      { t: "17:00", a: "Vertrek richting Nederland" },
      { t: "19:00", a: "Aankomst thuis" },
    ],
  },
  {
    slug: "brussel", name: "Brussel", emoji: "🍺", flag: "🇧🇪", country: "be", countryName: "België",
    duration: "2,5u rijden", km: "~210 km",
    tagline: "De hoofdstad van Europa: Grand Place, Art Nouveau, Atomium en Belgische frietjes.",
    desc: "De hoofdstad van Europa barst van cultuur: de UNESCO Grand Place, het Atomium, prachtige Art Nouveau architectuur en uiteraard de beroemde Belgische keuken.",
    luggage: "Bagage op aanvraag",
    highlights: ["Grand Place — UNESCO Werelderfgoed", "Atomium & Mini-Europe", "Koninklijk Paleis & Kunstberg", "Chocolade- en bierproeverij"],
    price: "€795",
    itinerary: [
      { t: "08:00", a: "Vertrek vanuit Amsterdam, Almere of Rotterdam" },
      { t: "10:30", a: "Aankomst — Grand Place & Manneken Pis" },
      { t: "12:00", a: "Wandeling door de Galeries Royales Saint-Hubert" },
      { t: "13:00", a: "Lunch in de buurt van Place Sainte-Catherine" },
      { t: "14:30", a: "Atomium & Mini-Europe" },
      { t: "16:30", a: "Chocoladewinkels & wafels proeven" },
      { t: "17:30", a: "Vertrek richting Nederland" },
      { t: "20:00", a: "Aankomst thuis" },
    ],
  },
  {
    slug: "keulen", name: "Keulen", emoji: "⛪", flag: "🇩🇪", country: "de", countryName: "Duitsland",
    duration: "2,5u rijden", km: "~230 km",
    tagline: "De Dom die de hemel raakt, en een stad vol kunst, bier en Rijnromantiek.",
    desc: "De Kölner Dom domineert het stadssilhouet en is een absolute must-see. Combineer dit met modern kunst, Rijnkruising en authentiek Kölsch bier in een traditioneel Brauhaus.",
    luggage: "Bagage in overleg",
    highlights: ["Kölner Dom — UNESCO Werelderfgoed", "Museum Ludwig (moderne kunst)", "Rijnpromenade & Altstadt", "Kölsch bierproeverij in een Brauhaus"],
    price: "€795",
    itinerary: [
      { t: "08:00", a: "Vertrek vanuit Amsterdam, Almere of Rotterdam" },
      { t: "10:30", a: "Aankomst Keulen — Kölner Dom bezoek" },
      { t: "12:00", a: "Wandeling Altstadt & Rijnpromenade" },
      { t: "13:00", a: "Lunch in een traditioneel Brauhaus (Kölsch!)" },
      { t: "14:30", a: "Museum Ludwig of Römisch-Germanisches Museum" },
      { t: "16:30", a: "Vrije winkeltijd Schildergasse" },
      { t: "17:30", a: "Vertrek richting Nederland" },
      { t: "20:00", a: "Aankomst thuis" },
    ],
  },
  {
    slug: "antwerpen", name: "Antwerpen", emoji: "💎", flag: "🇧🇪", country: "be", countryName: "België",
    duration: "1,5u rijden", km: "~150 km",
    tagline: "Diamantstad, modestad en havenstad in één — Rubens en haute couture naast elkaar.",
    desc: "De diamantstad van de wereld en het modehoofdkwartier van de Benelux. Van Rubens tot hedendaagse mode — Antwerpen is compact en verrassend divers.",
    luggage: "Bagage in overleg",
    highlights: ["Rubenshuis & Koninklijk Museum", "Diamantwijk — meest exclusieve wijk ter wereld", "Grote Markt & Onze-Lieve-Vrouwekathedraal", "Modemuseum MoMu"],
    price: "€595",
    itinerary: [
      { t: "09:00", a: "Vertrek vanuit Amsterdam, Almere of Rotterdam" },
      { t: "10:30", a: "Aankomst — Grote Markt & Stadhuis" },
      { t: "11:30", a: "Onze-Lieve-Vrouwekathedraal (Rubens altaarstukken)" },
      { t: "13:00", a: "Lunch in het historisch centrum" },
      { t: "14:30", a: "Diamantwijk of MoMu Modemuseum" },
      { t: "16:30", a: "Zurenborg wijk — Art Nouveau architectuur" },
      { t: "17:30", a: "Vertrek richting Nederland" },
      { t: "19:00", a: "Aankomst thuis" },
    ],
  },
  {
    slug: "rijnvallei", name: "Rijnvallei", emoji: "🏰", flag: "🇩🇪", country: "de", countryName: "Duitsland",
    duration: "3u rijden", km: "~290 km",
    tagline: "Kastelen op rotsen, wijngaarden en de mythische Loreleiklip langs Europa's mooiste rivier.",
    desc: "De Bovenrijn is officieel UNESCO Werelderfgoed — en terecht. Kasteelruïnes op iedere bergtop, wijngaarden zo ver het oog reikt en de mystieke Loreleiklip.",
    luggage: "Bagage in overleg",
    highlights: ["Loreleiklip & Rijnveer Boppard", "Kasteel Rheinfels (St. Goar)", "Bacharach — middeleeuwse wijnstad", "Rüdesheim — wijnproeverij Drosselgasse"],
    price: "€1.195",
    itinerary: [
      { t: "07:30", a: "Vroeg vertrek vanuit Amsterdam, Almere of Rotterdam" },
      { t: "10:30", a: "Aankomst Bacharach — middeleeuws stadje" },
      { t: "12:00", a: "Kasteel Rheinfels (St. Goar) — wandeling" },
      { t: "13:30", a: "Lunch met uitzicht op de Rijn" },
      { t: "15:00", a: "Loreleiklip bezoek" },
      { t: "16:30", a: "Rüdesheim — Drosselgasse & wijnproeverij" },
      { t: "18:00", a: "Vertrek richting Nederland" },
      { t: "21:00", a: "Aankomst thuis" },
    ],
  },
  {
    slug: "luxemburg", name: "Luxemburg-Stad", emoji: "🏰", flag: "🇱🇺", country: "lu", countryName: "Luxemburg",
    duration: "3,5u rijden", km: "~340 km",
    tagline: "UNESCO-vestingstad op een rots, met ondergrondse kazematten en een verfijnde culinaire scene.",
    desc: "Dit verborgen pareltje is onverdiend onbekend. Een vestingstad op een rots, met ondergrondse kazematten, een charmante benedenstad en een van de hoogste levensstandaarden ter wereld.",
    luggage: "Bagage in overleg",
    highlights: ["Bock Kazematten — ondergronds vestingwerk", "Grund (Benedenstad) aan de Alzette", "Groothertogelijk Paleis", "MUDAM — Musée d'Art Moderne"],
    price: "€1.295",
    itinerary: [
      { t: "07:00", a: "Vroeg vertrek vanuit Amsterdam, Almere of Rotterdam" },
      { t: "10:30", a: "Aankomst — Chemin de la Corniche (panoramapad)" },
      { t: "11:30", a: "Bock Kazematten — ondergronds vestingwerk" },
      { t: "13:00", a: "Lunch in Grund (de Benedenstad)" },
      { t: "14:30", a: "Groothertogelijk Paleis & Place Guillaume II" },
      { t: "16:00", a: "MUDAM Museum voor Moderne Kunst" },
      { t: "17:30", a: "Vertrek richting Nederland" },
      { t: "21:00", a: "Aankomst thuis" },
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
    itinerary: [
      { t: "09:00", a: "Vertrek vanuit Amsterdam" },
      { t: "09:45", a: "Aankomst Keukenhof — opening" },
      { t: "10:00", a: "Rondwandeling door de tuinen (3–4u)" },
      { t: "12:30", a: "Lunch in het Keukenhof Restaurant" },
      { t: "13:30", a: "Bollenvelden rijden langs de N208" },
      { t: "15:00", a: "Kasteel Keukenhof (buitenkant)" },
      { t: "16:00", a: "Terug naar Amsterdam" },
      { t: "17:00", a: "Aankomst thuis" },
    ],
  },
  {
    slug: "dusseldorf", name: "Düsseldorf", emoji: "🛍️", flag: "🇩🇪", country: "de", countryName: "Duitsland",
    duration: "2u rijden", km: "~215 km",
    tagline: "Mode, design en de Königsallee — Duitslands meest elegante winkelstraat.",
    desc: "Düsseldorf is Duitslands meest elegante stad — mode, design en de beroemde \"Kö\" (Königsallee). Combineer high-end shopping met kunst en een Altbier in de Altstadt.",
    luggage: "Bagage in overleg",
    highlights: ["Königsallee (de \"Kö\") — luxe shopping", "Altstadt & Rijnpromenade", "Kunstsammlung NRW (K20 & K21)", "MedienHafen — avant-garde architectuur"],
    price: "€795",
    itinerary: [
      { t: "08:30", a: "Vertrek vanuit Amsterdam, Almere of Rotterdam" },
      { t: "10:30", a: "Aankomst — Königsallee wandeling" },
      { t: "12:00", a: "Altstadt & Rijnpromenade" },
      { t: "13:00", a: "Lunch in het MedienHafen" },
      { t: "14:30", a: "Kunstsammlung NRW K20 of K21" },
      { t: "16:30", a: "Vrije winkeltijd of Japanisches Viertel" },
      { t: "17:30", a: "Vertrek richting Nederland" },
      { t: "19:30", a: "Aankomst thuis" },
    ],
  },
  {
    slug: "delft", name: "Delft & Den Haag", emoji: "🏺", flag: "🇳🇱", country: "nl", countryName: "Nederland",
    duration: "1u rijden", km: "~80 km",
    tagline: "Delfts Blauw, Vermeer, het Mauritshuis — koninklijke cultuur op één dag.",
    desc: "Een dag vol Vermeer, Delfts Blauw en koninklijke allure. Van de schilderachtige grachten van Delft naar het prestigieuze Mauritshuis in Den Haag — en dan nog een strandwandeling in Scheveningen.",
    luggage: "Bagage in overleg",
    highlights: ["Koninklijk Porseleinfabriek De Porceleyne Fles", "Mauritshuis — Meisje met de Parel", "Binnenhof & Hofvijver", "Scheveningen Strand"],
    price: "€499",
    itinerary: [
      { t: "09:30", a: "Vertrek vanuit Amsterdam, Almere of Rotterdam" },
      { t: "10:30", a: "Aankomst Delft — Markt & Nieuwe Kerk" },
      { t: "11:00", a: "Koninklijke Porceleinfabriek De Porceleyne Fles" },
      { t: "12:30", a: "Lunch in Delft" },
      { t: "13:30", a: "Rijden naar Den Haag — Mauritshuis" },
      { t: "15:00", a: "Binnenhof & Hofvijver" },
      { t: "16:30", a: "Scheveningen strand (optioneel)" },
      { t: "18:00", a: "Vertrek richting Amsterdam" },
      { t: "19:00", a: "Aankomst thuis" },
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
