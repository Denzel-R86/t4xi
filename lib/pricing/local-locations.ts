/**
 * Lokale locatiedataset — vliegvelden + populaire Nederlandse bestemmingen.
 *
 * Puur, geen IO: dit bestand levert alleen data + een zoekfunctie. De PDOK-
 * adreszoekfunctie in components/shared/AddressAutocomplete.tsx blijft de
 * primaire bron voor vrije adressen; deze module levert alléén de vooraf
 * bekende, veelgevraagde bestemmingen die sneller en betrouwbaarder lokaal
 * te matchen zijn dan via een externe suggestie-API.
 *
 * Coördinaten zijn vooraf vastgelegd (nooit per toetsaanslag opgehaald):
 * - Nederlandse adressen zijn opgezocht via de PDOK Locatieserver `free`-
 *   endpoint (WGS84, `centroide_ll` = "POINT(lon lat)").
 * - Buitenlandse vliegvelden (Duitsland, België, Luxemburg, Frankrijk) komen
 *   niet in PDOK voor; daarvoor zijn de gepubliceerde ICAO-referentiepunten
 *   (Wikipedia/luchtvaartbronnen) gebruikt.
 *
 * De geselecteerde locatie levert altijd een label (adres + plaats) dat op
 * dezelfde manier als een getypt of PDOK-gekozen adres de bestaande
 * afstands-/route-/prijsberekening ingaat (adres-string → Google Routes API
 * resp. lib/pricing/location-aliases.ts). De coördinaten hieronder zijn
 * aanvullende, gevalideerde metadata op de suggestie zelf — geen vervanging
 * van die bestaande adrestekst-gebaseerde flow.
 */

import { nsStations } from "./ns-stations";

export type LocalLocationCategory =
  | "airport"
  | "station"
  | "museum"
  | "attraction"
  | "theme_park"
  | "zoo"
  | "stadium"
  | "event_venue"
  | "shopping"
  | "tourist_area"
  | "cruise_terminal"
  | "ferry_terminal";

export type LocalLocation = {
  id: string;
  name: string;
  aliases: string[];
  address: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  type: "airport" | "popular_destination";
  category: LocalLocationCategory;
  iata?: string;
};

// ── Vliegvelden ──────────────────────────────────────────────────────────────

export const airports: LocalLocation[] = [
  {
    id: "airport-ams",
    name: "Amsterdam Airport Schiphol",
    iata: "AMS",
    aliases: [
      "Schiphol",
      "Amsterdam Airport",
      "Amsterdam Schiphol",
      "Schiphol Airport",
      "vliegveld Amsterdam",
      "luchthaven Amsterdam",
    ],
    address: "Evert van de Beekstraat 202, 1118 CP Schiphol",
    city: "Schiphol",
    country: "Nederland",
    latitude: 52.303897,
    longitude: 4.747908,
    type: "airport",
    category: "airport",
  },
  {
    id: "airport-ein",
    name: "Eindhoven Airport",
    iata: "EIN",
    aliases: ["vliegveld Eindhoven", "luchthaven Eindhoven", "Eindhoven vliegveld"],
    address: "Luchthavenweg 25, 5657 EA Eindhoven",
    city: "Eindhoven",
    country: "Nederland",
    latitude: 51.458221,
    longitude: 5.391941,
    type: "airport",
    category: "airport",
  },
  {
    id: "airport-rtm",
    name: "Rotterdam The Hague Airport",
    iata: "RTM",
    aliases: [
      "Rotterdam Airport",
      "Rotterdam vliegveld",
      "vliegveld Rotterdam",
      "luchthaven Rotterdam",
      "Zestienhoven",
    ],
    address: "Rotterdam Airportplein 60, 3045 AP Rotterdam",
    city: "Rotterdam",
    country: "Nederland",
    latitude: 51.949065,
    longitude: 4.433703,
    type: "airport",
    category: "airport",
  },
  {
    id: "airport-mst",
    name: "Maastricht Aachen Airport",
    iata: "MST",
    aliases: [
      "Maastricht Airport",
      "Aachen Airport",
      "vliegveld Maastricht",
      "luchthaven Maastricht",
      "Maastricht vliegveld",
    ],
    address: "Vliegveldweg 90, 6199 AD Maastricht-Airport",
    city: "Maastricht-Airport",
    country: "Nederland",
    latitude: 50.915536,
    longitude: 5.768931,
    type: "airport",
    category: "airport",
  },
  {
    id: "airport-grq",
    name: "Groningen Airport Eelde",
    iata: "GRQ",
    aliases: [
      "Eelde Airport",
      "Groningen Airport",
      "vliegveld Eelde",
      "vliegveld Groningen",
      "luchthaven Groningen",
    ],
    address: "Machlaan 14A, 9761 TK Eelde",
    city: "Eelde",
    country: "Nederland",
    latitude: 53.128896,
    longitude: 6.587546,
    type: "airport",
    category: "airport",
  },

  // Duitsland
  {
    id: "airport-nrn",
    name: "Airport Weeze",
    iata: "NRN",
    aliases: [
      "Weeze Airport",
      "Düsseldorf Weeze",
      "Dusseldorf Weeze",
      "Niederrhein Airport",
      "Flughafen Weeze",
      "vliegveld Weeze",
    ],
    address: "Flughafen-Ring 1, 47652 Weeze",
    city: "Weeze",
    country: "Duitsland",
    latitude: 51.6025,
    longitude: 6.1422,
    type: "airport",
    category: "airport",
  },
  {
    id: "airport-dus",
    name: "Düsseldorf Airport",
    iata: "DUS",
    aliases: [
      "Dusseldorf Airport",
      "Flughafen Düsseldorf",
      "Düsseldorf Flughafen",
      "vliegveld Düsseldorf",
      "luchthaven Düsseldorf",
    ],
    address: "Flughafenstraße 120, 40474 Düsseldorf",
    city: "Düsseldorf",
    country: "Duitsland",
    latitude: 51.2894,
    longitude: 6.7667,
    type: "airport",
    category: "airport",
  },
  {
    id: "airport-fmo",
    name: "Münster/Osnabrück Airport",
    iata: "FMO",
    aliases: [
      "Munster Osnabruck Airport",
      "Münster Airport",
      "Osnabrück Airport",
      "Flughafen Münster",
      "Flughafen Osnabrück",
    ],
    address: "Airportallee 1, 48268 Greven",
    city: "Greven",
    country: "Duitsland",
    latitude: 52.1361,
    longitude: 7.6858,
    type: "airport",
    category: "airport",
  },
  {
    id: "airport-dtm",
    name: "Dortmund Airport",
    iata: "DTM",
    aliases: ["Flughafen Dortmund", "Dortmund Flughafen", "vliegveld Dortmund"],
    address: "Flughafenring 2, 44319 Dortmund",
    city: "Dortmund",
    country: "Duitsland",
    latitude: 51.5183,
    longitude: 7.6122,
    type: "airport",
    category: "airport",
  },
  {
    id: "airport-cgn",
    name: "Köln/Bonn Airport",
    iata: "CGN",
    aliases: [
      "Cologne Bonn Airport",
      "Keulen Bonn Airport",
      "Koln Bonn Airport",
      "Flughafen Köln Bonn",
      "vliegveld Keulen",
    ],
    address: "Kennedystraße, 51147 Köln",
    city: "Köln",
    country: "Duitsland",
    latitude: 50.8658,
    longitude: 7.1428,
    type: "airport",
    category: "airport",
  },
  {
    id: "airport-pad",
    name: "Paderborn/Lippstadt Airport",
    iata: "PAD",
    aliases: ["Paderborn Airport", "Lippstadt Airport", "Flughafen Paderborn", "vliegveld Paderborn"],
    address: "Flughafenstraße 33, 33142 Büren",
    city: "Büren",
    country: "Duitsland",
    latitude: 51.6153,
    longitude: 8.6172,
    type: "airport",
    category: "airport",
  },
  {
    id: "airport-bre",
    name: "Bremen Airport",
    iata: "BRE",
    aliases: ["Flughafen Bremen", "Bremen Flughafen", "vliegveld Bremen"],
    address: "Flughafenallee 20, 28199 Bremen",
    city: "Bremen",
    country: "Duitsland",
    latitude: 53.0468,
    longitude: 8.7893,
    type: "airport",
    category: "airport",
  },
  {
    id: "airport-haj",
    name: "Hannover Airport",
    iata: "HAJ",
    aliases: ["Hanover Airport", "Flughafen Hannover", "Hannover Langenhagen", "vliegveld Hannover"],
    address: "Flughafenstraße 4, 30855 Langenhagen",
    city: "Langenhagen",
    country: "Duitsland",
    latitude: 52.4611,
    longitude: 9.6851,
    type: "airport",
    category: "airport",
  },

  // België
  {
    id: "airport-bru",
    name: "Brussels Airport",
    iata: "BRU",
    aliases: [
      "Brussel Airport",
      "Brussels Zaventem",
      "Zaventem Airport",
      "vliegveld Zaventem",
      "luchthaven Brussel",
      "Brussel Nationaal",
    ],
    address: "Leopoldlaan, 1930 Zaventem",
    city: "Zaventem",
    country: "België",
    latitude: 50.9014,
    longitude: 4.4844,
    type: "airport",
    category: "airport",
  },
  {
    id: "airport-crl",
    name: "Brussels South Charleroi Airport",
    iata: "CRL",
    aliases: [
      "Charleroi Airport",
      "Brussel Charleroi",
      "Brussels Charleroi",
      "Charleroi vliegveld",
      "luchthaven Charleroi",
    ],
    address: "Rue des Fusillés 21, 6040 Jumet",
    city: "Charleroi",
    country: "België",
    latitude: 50.46,
    longitude: 4.4528,
    type: "airport",
    category: "airport",
  },
  {
    id: "airport-anr",
    name: "Antwerp Airport",
    iata: "ANR",
    aliases: [
      "Antwerpen Airport",
      "Deurne Airport",
      "Luchthaven Antwerpen",
      "vliegveld Antwerpen",
      "vliegveld Deurne",
    ],
    address: "Luchthavenlei 1, 2100 Antwerpen",
    city: "Antwerpen",
    country: "België",
    latitude: 51.1894,
    longitude: 4.4603,
    type: "airport",
    category: "airport",
  },
  {
    id: "airport-ost",
    name: "Ostend-Bruges Airport",
    iata: "OST",
    aliases: ["Oostende Airport", "Oostende Brugge Airport", "Luchthaven Oostende", "vliegveld Oostende"],
    address: "Nieuwpoortsesteenweg 889, 8400 Oostende",
    city: "Oostende",
    country: "België",
    latitude: 51.1989,
    longitude: 2.8622,
    type: "airport",
    category: "airport",
  },
  {
    id: "airport-lgg",
    name: "Liège Airport",
    iata: "LGG",
    aliases: ["Liege Airport", "Luik Airport", "Bierset Airport", "Luchthaven Luik", "vliegveld Luik"],
    address: "Rue de l'Aéroport 21, 4460 Grâce-Hollogne",
    city: "Grâce-Hollogne",
    country: "België",
    latitude: 50.6364,
    longitude: 5.4428,
    type: "airport",
    category: "airport",
  },

  // Luxemburg en Frankrijk
  {
    id: "airport-lux",
    name: "Luxembourg Airport",
    iata: "LUX",
    aliases: ["Luxemburg Airport", "Findel Airport", "Luchthaven Luxemburg", "vliegveld Luxemburg"],
    address: "Rue de Trèves, L-2632 Findel",
    city: "Findel",
    country: "Luxemburg",
    latitude: 49.6233,
    longitude: 6.2044,
    type: "airport",
    category: "airport",
  },
  {
    id: "airport-lil",
    name: "Lille Airport",
    iata: "LIL",
    aliases: ["Luchthaven Lille", "Rijsel Airport", "Lille Lesquin", "Aéroport de Lille", "vliegveld Lille"],
    address: "Route de l'Aéroport, 59810 Lesquin",
    city: "Lesquin",
    country: "Frankrijk",
    latitude: 50.5633,
    longitude: 3.0869,
    type: "airport",
    category: "airport",
  },
];

// ── Populaire bestemmingen ───────────────────────────────────────────────────

export const popularDestinations: LocalLocation[] = [
  // Amsterdam
  // Amsterdam Centraal (en alle overige Nederlandse treinstations) komt uit
  // `nsStations` (lib/pricing/ns-stations.ts) — hier bewust niet nogmaals
  // opgenomen, anders staat hetzelfde station tweemaal in de zoekresultaten.
  {
    id: "anne-frank-huis",
    name: "Anne Frank Huis",
    aliases: ["Anne Frank House", "Anne Frank Museum"],
    address: "Westermarkt 20, 1016 GV Amsterdam",
    city: "Amsterdam",
    country: "Nederland",
    latitude: 52.374936,
    longitude: 4.884317,
    type: "popular_destination",
    category: "museum",
  },
  {
    id: "rijksmuseum",
    name: "Rijksmuseum",
    aliases: ["Rijks Museum", "Museumplein Rijksmuseum"],
    address: "Museumstraat 1, 1071 XX Amsterdam",
    city: "Amsterdam",
    country: "Nederland",
    latitude: 52.359942,
    longitude: 4.885386,
    type: "popular_destination",
    category: "museum",
  },
  {
    id: "van-gogh-museum",
    name: "Van Gogh Museum",
    aliases: ["Vincent van Gogh Museum", "Museumplein Van Gogh"],
    address: "Museumplein 6, 1071 DJ Amsterdam",
    city: "Amsterdam",
    country: "Nederland",
    latitude: 52.357925,
    longitude: 4.881323,
    type: "popular_destination",
    category: "museum",
  },
  {
    id: "museumplein",
    name: "Museumplein",
    aliases: ["Museum Square Amsterdam", "Museums Amsterdam"],
    address: "Museumplein, 1071 DJ Amsterdam",
    city: "Amsterdam",
    country: "Nederland",
    latitude: 52.357351,
    longitude: 4.88276,
    type: "popular_destination",
    category: "tourist_area",
  },
  {
    id: "dam-amsterdam",
    name: "De Dam",
    aliases: ["Dam Amsterdam", "Paleis op de Dam", "Royal Palace Amsterdam"],
    address: "Dam 1, 1012 JS Amsterdam",
    city: "Amsterdam",
    country: "Nederland",
    latitude: 52.373293,
    longitude: 4.893718,
    type: "popular_destination",
    category: "tourist_area",
  },
  {
    id: "rai-amsterdam",
    name: "RAI Amsterdam",
    aliases: ["Amsterdam RAI", "RAI Congrescentrum", "RAI Exhibition Centre"],
    address: "Europaplein 24, 1078 GZ Amsterdam",
    city: "Amsterdam",
    country: "Nederland",
    latitude: 52.341226,
    longitude: 4.889907,
    type: "popular_destination",
    category: "event_venue",
  },
  {
    id: "johan-cruijff-arena",
    name: "Johan Cruijff ArenA",
    aliases: ["Amsterdam Arena", "Ajax stadion", "Johan Cruyff Arena", "Arena Amsterdam"],
    address: "Johan Cruijff Boulevard 1, 1101 AX Amsterdam",
    city: "Amsterdam",
    country: "Nederland",
    latitude: 52.313755,
    longitude: 4.940529,
    type: "popular_destination",
    category: "stadium",
  },
  {
    id: "ziggo-dome",
    name: "Ziggo Dome",
    aliases: ["Ziggodome", "Ziggo Dome Amsterdam"],
    address: "De Passage 100, 1101 AX Amsterdam",
    city: "Amsterdam",
    country: "Nederland",
    latitude: 52.313753,
    longitude: 4.937709,
    type: "popular_destination",
    category: "event_venue",
  },
  {
    id: "afas-live",
    name: "AFAS Live",
    aliases: ["Heineken Music Hall", "HMH", "AFAS Amsterdam"],
    address: "Johan Cruijff Boulevard 590, 1101 DS Amsterdam",
    city: "Amsterdam",
    country: "Nederland",
    latitude: 52.312322,
    longitude: 4.944225,
    type: "popular_destination",
    category: "event_venue",
  },
  {
    id: "artis",
    name: "ARTIS",
    aliases: ["Artis Zoo", "Artis Amsterdam", "Natura Artis Magistra"],
    address: "Plantage Kerklaan 38-40, 1018 CZ Amsterdam",
    city: "Amsterdam",
    country: "Nederland",
    latitude: 52.366961,
    longitude: 4.912582,
    type: "popular_destination",
    category: "zoo",
  },
  {
    id: "nemo",
    name: "NEMO Science Museum",
    aliases: ["Nemo Amsterdam", "Science Museum Amsterdam"],
    address: "Oosterdok 2, 1011 VX Amsterdam",
    city: "Amsterdam",
    country: "Nederland",
    latitude: 52.373853,
    longitude: 4.912111,
    type: "popular_destination",
    category: "museum",
  },
  {
    id: "adam-lookout",
    name: "A'DAM Lookout",
    aliases: ["Adam Lookout", "A'DAM Toren", "Amsterdam Lookout"],
    address: "Overhoeksplein 5, 1031 KS Amsterdam",
    city: "Amsterdam",
    country: "Nederland",
    latitude: 52.383922,
    longitude: 4.902003,
    type: "popular_destination",
    category: "attraction",
  },
  {
    id: "heineken-experience",
    name: "Heineken Experience",
    aliases: ["Heineken Museum", "Heineken Brouwerij Amsterdam"],
    address: "Stadhouderskade 78, 1072 AE Amsterdam",
    city: "Amsterdam",
    country: "Nederland",
    latitude: 52.357869,
    longitude: 4.891496,
    type: "popular_destination",
    category: "attraction",
  },
  {
    id: "westergas",
    name: "Westergas",
    aliases: ["Westergasterrein", "Westerpark evenementen", "Westergasfabriek"],
    address: "Pazzanistraat 37, 1014 BE Amsterdam",
    city: "Amsterdam",
    country: "Nederland",
    latitude: 52.386107,
    longitude: 4.872144,
    type: "popular_destination",
    category: "event_venue",
  },
  {
    id: "passenger-terminal-amsterdam",
    name: "Passenger Terminal Amsterdam",
    aliases: ["PTA Amsterdam", "Amsterdam Cruise Port", "Cruise Terminal Amsterdam"],
    address: "Piet Heinkade 27, 1019 BR Amsterdam",
    city: "Amsterdam",
    country: "Nederland",
    latitude: 52.377812,
    longitude: 4.915329,
    type: "popular_destination",
    category: "cruise_terminal",
  },

  // Noord-Holland en Zuid-Holland
  {
    id: "zaanse-schans",
    name: "Zaanse Schans",
    aliases: ["Windmolens Zaanse Schans", "Zaanse molens", "Windmills Zaandam"],
    address: "Schansend 7, 1509 AW Zaandam",
    city: "Zaandam",
    country: "Nederland",
    latitude: 52.473633,
    longitude: 4.822324,
    type: "popular_destination",
    category: "attraction",
  },
  {
    id: "keukenhof",
    name: "Keukenhof",
    aliases: ["Tulpenpark", "Bloementuin Lisse", "Keukenhof Gardens", "Tulip Garden"],
    address: "Stationsweg 166A, 2161 AM Lisse",
    city: "Lisse",
    country: "Nederland",
    latitude: 52.267965,
    longitude: 4.549731,
    type: "popular_destination",
    category: "attraction",
  },
  {
    id: "madurodam",
    name: "Madurodam",
    aliases: ["Miniatuurpark Den Haag", "Miniature Holland"],
    address: "George Maduroplein 1, 2584 RZ Den Haag",
    city: "Den Haag",
    country: "Nederland",
    latitude: 52.099097,
    longitude: 4.299043,
    type: "popular_destination",
    category: "attraction",
  },
  {
    id: "pier-scheveningen",
    name: "De Pier Scheveningen",
    aliases: ["Scheveningen Pier", "Pier Den Haag", "Scheveningen strand"],
    address: "Strandweg 150-154, 2586 JW Den Haag",
    city: "Den Haag",
    country: "Nederland",
    latitude: 52.117726,
    longitude: 4.279897,
    type: "popular_destination",
    category: "attraction",
  },
  {
    id: "sea-life-scheveningen",
    name: "SEA LIFE Scheveningen",
    aliases: ["Sea Life Den Haag", "Aquarium Scheveningen"],
    address: "Strandweg 13, 2586 JK Den Haag",
    city: "Den Haag",
    country: "Nederland",
    latitude: 52.112668,
    longitude: 4.279604,
    type: "popular_destination",
    category: "attraction",
  },
  {
    id: "world-forum",
    name: "World Forum Den Haag",
    aliases: ["World Forum The Hague", "Congrescentrum Den Haag"],
    address: "Churchillplein 10, 2517 JW Den Haag",
    city: "Den Haag",
    country: "Nederland",
    latitude: 52.093181,
    longitude: 4.283434,
    type: "popular_destination",
    category: "event_venue",
  },
  {
    id: "mauritshuis",
    name: "Mauritshuis",
    aliases: ["Mauritshuis Museum", "Museum Mauritshuis"],
    address: "Plein 29, 2511 CS Den Haag",
    city: "Den Haag",
    country: "Nederland",
    latitude: 52.080345,
    longitude: 4.314388,
    type: "popular_destination",
    category: "museum",
  },
  {
    id: "duinrell",
    name: "Duinrell",
    aliases: ["Attractiepark Duinrell", "Tikibad", "Duinrell Wassenaar"],
    address: "Duinrell 1, 2242 JP Wassenaar",
    city: "Wassenaar",
    country: "Nederland",
    latitude: 52.141752,
    longitude: 4.385833,
    type: "popular_destination",
    category: "theme_park",
  },

  // Rotterdam
  {
    id: "rotterdam-ahoy",
    name: "Rotterdam Ahoy",
    aliases: ["Ahoy", "Ahoy Rotterdam", "Ahoy evenementenhal"],
    address: "Ahoyweg 10, 3084 BA Rotterdam",
    city: "Rotterdam",
    country: "Nederland",
    latitude: 51.883554,
    longitude: 4.487123,
    type: "popular_destination",
    category: "event_venue",
  },
  {
    id: "markthal-rotterdam",
    name: "Markthal Rotterdam",
    aliases: ["Rotterdam Markthal", "Market Hall Rotterdam"],
    address: "Dominee Jan Scharpstraat 298, 3011 GZ Rotterdam",
    city: "Rotterdam",
    country: "Nederland",
    latitude: 51.919771,
    longitude: 4.486259,
    type: "popular_destination",
    category: "attraction",
  },
  {
    id: "euromast",
    name: "Euromast",
    aliases: ["Euromast Rotterdam", "Euromast Tower"],
    address: "Parkhaven 20, 3016 GM Rotterdam",
    city: "Rotterdam",
    country: "Nederland",
    latitude: 51.905402,
    longitude: 4.466512,
    type: "popular_destination",
    category: "attraction",
  },
  {
    id: "diergaarde-blijdorp",
    name: "Diergaarde Blijdorp",
    aliases: ["Blijdorp", "Rotterdam Zoo", "Dierentuin Rotterdam"],
    address: "Blijdorplaan 8, 3041 JG Rotterdam",
    city: "Rotterdam",
    country: "Nederland",
    latitude: 51.928012,
    longitude: 4.443558,
    type: "popular_destination",
    category: "zoo",
  },
  {
    id: "de-kuip",
    name: "Stadion Feijenoord De Kuip",
    aliases: ["De Kuip", "Feyenoord stadion", "Feijenoord stadion"],
    address: "Van Zandvlietplein 1, 3077 AA Rotterdam",
    city: "Rotterdam",
    country: "Nederland",
    latitude: 51.894336,
    longitude: 4.524698,
    type: "popular_destination",
    category: "stadium",
  },
  {
    id: "cruise-terminal-rotterdam",
    name: "Cruise Terminal Rotterdam",
    aliases: ["Rotterdam Cruise Port", "Cruise Port Rotterdam"],
    address: "Wilhelminakade 699, 3072 AP Rotterdam",
    city: "Rotterdam",
    country: "Nederland",
    latitude: 51.906115,
    longitude: 4.487379,
    type: "popular_destination",
    category: "cruise_terminal",
  },

  // Overige attracties
  {
    id: "efteling",
    name: "Efteling",
    aliases: ["De Efteling", "Pretpark Kaatsheuvel", "Efteling Park"],
    address: "Europalaan 1, 5171 KW Kaatsheuvel",
    city: "Kaatsheuvel",
    country: "Nederland",
    latitude: 51.652492,
    longitude: 5.050901,
    type: "popular_destination",
    category: "theme_park",
  },
  {
    id: "walibi-holland",
    name: "Walibi Holland",
    aliases: ["Walibi", "Walibi Flevo", "Pretpark Biddinghuizen"],
    address: "Spijkweg 30, 8256 RJ Biddinghuizen",
    city: "Biddinghuizen",
    country: "Nederland",
    latitude: 52.440862,
    longitude: 5.767413,
    type: "popular_destination",
    category: "theme_park",
  },
  {
    id: "toverland",
    name: "Toverland",
    aliases: ["Attractiepark Toverland", "Pretpark Sevenum"],
    address: "Toverlaan 2, 5975 MR Sevenum",
    city: "Sevenum",
    country: "Nederland",
    latitude: 51.395936,
    longitude: 5.986915,
    type: "popular_destination",
    category: "theme_park",
  },
  {
    id: "beekse-bergen",
    name: "Safaripark Beekse Bergen",
    aliases: ["Beekse Bergen", "Safari Park", "Dierenpark Hilvarenbeek"],
    address: "Beekse Bergen 1, 5081 NJ Hilvarenbeek",
    city: "Hilvarenbeek",
    country: "Nederland",
    latitude: 51.52284,
    longitude: 5.13859,
    type: "popular_destination",
    category: "zoo",
  },
  {
    id: "burgers-zoo",
    name: "Burgers' Zoo",
    aliases: ["Burgers Zoo", "Dierentuin Arnhem"],
    address: "Antoon van Hooffplein 1, 6816 SH Arnhem",
    city: "Arnhem",
    country: "Nederland",
    latitude: 52.007157,
    longitude: 5.898572,
    type: "popular_destination",
    category: "zoo",
  },
  {
    id: "ouwehands-dierenpark",
    name: "Ouwehands Dierenpark",
    aliases: ["Ouwehands Zoo", "Pandaberen Rhenen", "Dierentuin Rhenen"],
    address: "Grebbeweg 111, 3911 AV Rhenen",
    city: "Rhenen",
    country: "Nederland",
    latitude: 51.956217,
    longitude: 5.591268,
    type: "popular_destination",
    category: "zoo",
  },
  {
    id: "wildlands-emmen",
    name: "Wildlands Adventure Zoo Emmen",
    aliases: ["Wildlands", "Dierentuin Emmen", "Noorder Dierenpark"],
    address: "Raadhuisplein 99, 7811 AP Emmen",
    city: "Emmen",
    country: "Nederland",
    latitude: 52.782271,
    longitude: 6.891041,
    type: "popular_destination",
    category: "zoo",
  },
  {
    id: "paleis-het-loo",
    name: "Paleis Het Loo",
    aliases: ["Het Loo", "Koninklijk Paleis Apeldoorn"],
    address: "Koninklijk Park 16, 7315 JA Apeldoorn",
    city: "Apeldoorn",
    country: "Nederland",
    latitude: 52.234604,
    longitude: 5.942823,
    type: "popular_destination",
    category: "museum",
  },
  {
    id: "openluchtmuseum",
    name: "Nederlands Openluchtmuseum",
    aliases: ["Openluchtmuseum Arnhem", "Dutch Open Air Museum"],
    address: "Hoeferlaan 4, 6816 SG Arnhem",
    city: "Arnhem",
    country: "Nederland",
    latitude: 52.00809,
    longitude: 5.907217,
    type: "popular_destination",
    category: "museum",
  },
  {
    id: "kroller-muller",
    name: "Kröller-Müller Museum",
    aliases: ["Kroller Muller", "Van Gogh Museum Otterlo", "Museum Hoge Veluwe"],
    address: "Houtkampweg 6, 6731 AW Otterlo",
    city: "Otterlo",
    country: "Nederland",
    latitude: 52.096224,
    longitude: 5.817664,
    type: "popular_destination",
    category: "museum",
  },
  {
    id: "spoorwegmuseum",
    name: "Het Spoorwegmuseum",
    aliases: ["Spoorwegmuseum Utrecht", "Railway Museum Utrecht"],
    address: "Maliebaanstation 16, 3581 XW Utrecht",
    city: "Utrecht",
    country: "Nederland",
    latitude: 52.087959,
    longitude: 5.131077,
    type: "popular_destination",
    category: "museum",
  },
  {
    id: "naturalis",
    name: "Naturalis Biodiversity Center",
    aliases: ["Naturalis Leiden", "Natuurmuseum Leiden"],
    address: "Darwinweg 2, 2333 CR Leiden",
    city: "Leiden",
    country: "Nederland",
    latitude: 52.164899,
    longitude: 4.473367,
    type: "popular_destination",
    category: "museum",
  },

  // Winkelen
  {
    id: "designer-outlet-roermond",
    name: "Designer Outlet Roermond",
    aliases: ["Outlet Roermond", "McArthurGlen Roermond", "Roermond Outlet"],
    address: "Stadsweide 2, 6041 TD Roermond",
    city: "Roermond",
    country: "Nederland",
    latitude: 51.199819,
    longitude: 5.989825,
    type: "popular_destination",
    category: "shopping",
  },
  {
    id: "batavia-stad",
    name: "Batavia Stad Fashion Outlet",
    aliases: ["Batavia Stad", "Outlet Lelystad"],
    address: "Bataviaplein 60, 8242 PN Lelystad",
    city: "Lelystad",
    country: "Nederland",
    latitude: 52.522966,
    longitude: 5.440716,
    type: "popular_destination",
    category: "shopping",
  },
  {
    id: "mall-of-the-netherlands",
    name: "Westfield Mall of the Netherlands",
    aliases: ["Mall of the Netherlands", "Leidsenhage", "Westfield Leidschendam"],
    address: "Liguster 202, 2262 AC Leidschendam",
    city: "Leidschendam",
    country: "Nederland",
    latitude: 52.087789,
    longitude: 4.383315,
    type: "popular_destination",
    category: "shopping",
  },

  // Evenementen en sport
  {
    id: "gelredome",
    name: "GelreDome",
    aliases: ["Gelredome Arnhem", "Vitesse stadion"],
    address: "Batavierenweg 25, 6841 HN Arnhem",
    city: "Arnhem",
    country: "Nederland",
    latitude: 51.96366,
    longitude: 5.89333,
    type: "popular_destination",
    category: "stadium",
  },
  {
    id: "philips-stadion",
    name: "Philips Stadion",
    aliases: ["PSV stadion", "Philips Stadium Eindhoven"],
    address: "Frederiklaan 10A, 5616 NH Eindhoven",
    city: "Eindhoven",
    country: "Nederland",
    latitude: 51.442018,
    longitude: 5.466076,
    type: "popular_destination",
    category: "stadium",
  },
  {
    id: "jaarbeurs-utrecht",
    name: "Jaarbeurs Utrecht",
    aliases: ["Jaarbeurs", "Utrecht Convention Centre"],
    address: "Jaarbeursplein 6, 3521 AL Utrecht",
    city: "Utrecht",
    country: "Nederland",
    latitude: 52.087779,
    longitude: 5.106838,
    type: "popular_destination",
    category: "event_venue",
  },
  {
    id: "mecc-maastricht",
    name: "MECC Maastricht",
    aliases: ["MECC", "Congrescentrum Maastricht"],
    address: "Forum 100, 6229 GV Maastricht",
    city: "Maastricht",
    country: "Nederland",
    latitude: 50.837763,
    longitude: 5.713153,
    type: "popular_destination",
    category: "event_venue",
  },
  {
    id: "tt-circuit-assen",
    name: "TT Circuit Assen",
    aliases: ["TT Assen", "Circuit Assen", "Dutch TT"],
    address: "De Haar 9, 9405 TE Assen",
    city: "Assen",
    country: "Nederland",
    latitude: 52.961498,
    longitude: 6.523498,
    type: "popular_destination",
    category: "event_venue",
  },
  {
    id: "circuit-zandvoort",
    name: "Circuit Zandvoort",
    // "F1" is een informele afkorting die niet letterlijk in "Formule 1
    // Zandvoort" voorkomt — expliciet toegevoegd zodat de zoekopdracht "f1"
    // matcht (testeis).
    aliases: ["Zandvoort Circuit", "Formule 1 Zandvoort", "Dutch Grand Prix", "F1"],
    address: "Burgemeester van Alphenstraat 108, 2041 KP Zandvoort",
    city: "Zandvoort",
    country: "Nederland",
    latitude: 52.389057,
    longitude: 4.541384,
    type: "popular_destination",
    category: "event_venue",
  },

  // Veerboten en cruisehavens
  {
    id: "felison-cruise-terminal",
    name: "Felison Cruise Terminal",
    aliases: ["Cruise Terminal IJmuiden", "Felison Terminal", "IJmuiden Cruise Port"],
    address: "Cruiseboulevard 10, 1976 EB IJmuiden",
    city: "IJmuiden",
    country: "Nederland",
    latitude: 52.459007,
    longitude: 4.568085,
    type: "popular_destination",
    category: "cruise_terminal",
  },
  {
    id: "dfds-ijmuiden",
    name: "DFDS Terminal IJmuiden",
    aliases: ["DFDS Amsterdam", "Ferry IJmuiden Newcastle", "Newcastle Ferry"],
    address: "Sluisplein 33, 1975 AG IJmuiden",
    city: "IJmuiden",
    country: "Nederland",
    latitude: 52.463116,
    longitude: 4.58584,
    type: "popular_destination",
    category: "ferry_terminal",
  },
  {
    id: "stena-line-hoek-van-holland",
    name: "Stena Line Hoek van Holland",
    aliases: ["Hoek van Holland Ferry", "Ferry Harwich", "Stena Line Terminal"],
    address: "Stationsweg 10, 3151 HS Hoek van Holland",
    city: "Hoek van Holland",
    country: "Nederland",
    latitude: 51.975766,
    longitude: 4.126347,
    type: "popular_destination",
    category: "ferry_terminal",
  },
];

/** Alle lokale locaties samen: vliegvelden + populaire bestemmingen + treinstations. */
export const localLocations: LocalLocation[] = [...airports, ...popularDestinations, ...nsStations];

// ── Normalisatie ─────────────────────────────────────────────────────────────

export function normalizeSearchValue(value: string): string {
  return value
    .normalize("NFD")
    // Combining diacritical marks (géén \p{Diacritic}/u: dat vereist een hogere
    // regex-target dan dit project compileert — zelfde aanpak als
    // normalizeForRanking in components/shared/AddressAutocomplete.tsx).
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokensOf(value: string): string[] {
  return value.split(" ").filter(Boolean);
}

/** Alle queryTokens moeten (los van volgorde) als substring in `haystack` voorkomen. */
function tokensAllMatch(queryTokens: string[], haystack: string): boolean {
  return queryTokens.length > 0 && queryTokens.every((token) => haystack.includes(token));
}

/** Kleine Levenshtein-afstand — voor lichte typefouttolerantie op enkele woorden. */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] =
        a[i - 1] === b[j - 1]
          ? previous[j - 1]
          : 1 + Math.min(previous[j - 1], previous[j], current[j - 1]);
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Een losse zoekterm van precies drie letters (bv. "AMS", "ein") — voorkomt dat
 * een normaal woord als "dam" per ongeluk als IATA-code wordt behandeld: dat mag
 * alléén als de HELE (getrimde) zoekopdracht drie letters is, niet als losse
 * token binnen een langere zin.
 */
function isThreeLetterCodeQuery(rawQuery: string): boolean {
  return /^[a-zA-Z]{3}$/.test(rawQuery.trim());
}

// Scoretrappen — hoger wint. Volgorde per opdracht:
// IATA-exact > naam-exact > alias-exact > naam-prefix > alias-prefix >
// naam/alias-contains > plaats > adres > fuzzy (typefouttolerantie).
const SCORE = {
  iataExact: 1000,
  nameExact: 900,
  aliasExact: 850,
  namePrefix: 800,
  aliasPrefix: 750,
  contains: 700,
  city: 600,
  address: 500,
  fuzzy: 400,
} as const;

function scoreLocation(loc: LocalLocation, rawQuery: string, nq: string): number | null {
  if (isThreeLetterCodeQuery(rawQuery) && loc.iata && loc.iata.toLowerCase() === rawQuery.trim().toLowerCase()) {
    return SCORE.iataExact;
  }

  const nName = normalizeSearchValue(loc.name);
  const nAliases = loc.aliases.map(normalizeSearchValue);
  const nCity = normalizeSearchValue(loc.city);
  const nAddress = normalizeSearchValue(loc.address);
  const queryTokens = tokensOf(nq);

  if (nName === nq) return SCORE.nameExact;
  if (nAliases.includes(nq)) return SCORE.aliasExact;
  if (nName.startsWith(nq)) return SCORE.namePrefix;
  if (nAliases.some((a) => a.startsWith(nq))) return SCORE.aliasPrefix;
  if (tokensAllMatch(queryTokens, nName) || nAliases.some((a) => tokensAllMatch(queryTokens, a))) {
    return SCORE.contains;
  }
  if (tokensAllMatch(queryTokens, nCity)) return SCORE.city;
  if (tokensAllMatch(queryTokens, nAddress)) return SCORE.address;

  // Lichte typefouttolerantie: alleen voor query's van 4+ tekens, op woordniveau.
  if (nq.length >= 4) {
    const candidates = [nName, ...nAliases, nCity];
    for (const candidate of candidates) {
      if (levenshteinDistance(candidate, nq) <= 1) return SCORE.fuzzy;
      for (const token of tokensOf(candidate)) {
        if (token.length >= 4 && levenshteinDistance(token, nq) <= 1) return SCORE.fuzzy;
      }
    }
  }

  return null;
}

/**
 * Zoekt in `name`, `aliases`, `address`, `city` en (impliciet) `category` via de
 * gecombineerde velden hierboven. Case-insensitive, accent-insensitive en met
 * lichte typefouttolerantie. Retourneert de best passende lokale locaties,
 * hoogste score eerst.
 */
export function searchLocalLocations(query: string, limit = 5): LocalLocation[] {
  const nq = normalizeSearchValue(query);
  if (!nq) return [];

  return localLocations
    .map((loc) => ({ loc, score: scoreLocation(loc, query, nq) }))
    .filter((entry): entry is { loc: LocalLocation; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.loc);
}

// ── Weergave ─────────────────────────────────────────────────────────────────

const CATEGORY_ICON: Partial<Record<LocalLocationCategory, string>> = {
  theme_park: "🎢",
  museum: "🏛️",
  stadium: "🎟️",
  event_venue: "🎟️",
  cruise_terminal: "🚢",
  station: "🚉",
};

const DEFAULT_ICON = "📍";
const AIRPORT_ICON = "✈";

export function iconForLocalLocation(loc: LocalLocation): string {
  if (loc.type === "airport") return AIRPORT_ICON;
  return CATEGORY_ICON[loc.category] ?? DEFAULT_ICON;
}

/** "📍 Naam — plaats" (of "✈ Naam (IATA) — plaats" voor vliegvelden). */
export function displayLabelFor(loc: LocalLocation): string {
  const icon = iconForLocalLocation(loc);
  const name = loc.iata ? `${loc.name} (${loc.iata})` : loc.name;
  return `${icon} ${name} — ${loc.city}`;
}

/**
 * Het adres zoals het als vrije tekst het invoerveld ingaat na selectie — elk
 * `address`-veld bevat al de postcode + plaats, dus dit is exact de vorm die
 * de bestaande resolver (location-aliases.ts) en Routes API ook van PDOK of
 * getypte invoer krijgen.
 */
export function addressLabelFor(loc: LocalLocation): string {
  return loc.address;
}
