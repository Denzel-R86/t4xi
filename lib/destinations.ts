/**
 * Bestemmingskiezer-data voor /tarieven (en later hero/boeken).
 *
 * DIT IS EEN NAVIGATIE- EN CONVERSIELAAG, GEEN PRIJSBRON. Bedragen komen
 * uitsluitend uit de rate-card (fixed_route_prices); een bestemming zonder
 * vaste route toont "Prijs op aanvraag". Voeg hier dus nooit prijzen toe.
 *
 * Regels (vastgesteld door de eigenaar, 2026-07-22):
 *   · Eindhoven en Maastricht staan bij iedere vertrekstad op positie 1 en 2.
 *   · `label` is de korte zichtbare naam; `searchValue` is de eenduidige
 *     locatie voor autocomplete/resolver (met plaats, tegen naamsverwarring).
 *   · searchValues zijn taalneutraal; labels worden via i18n vertaald waar
 *     een gangbare Engelse naam bestaat.
 */

export type DestinationOption = {
  label: string;
  /** Eenduidige zoek-/resolverwaarde, bv. "Kasteel de Haar, Haarzuilens". */
  searchValue: string;
  type: "city" | "attraction";
};

export type OriginSlug = "amsterdam" | "almere" | "utrecht" | "den-haag" | "rotterdam";

export type OriginDestinationGroup = {
  origin: OriginSlug;
  cities: DestinationOption[];
  attractions: DestinationOption[];
};

const stad = (label: string, plaats?: string): DestinationOption => ({
  label,
  searchValue: plaats ?? label,
  type: "city",
});

const attractie = (label: string, searchValue: string): DestinationOption => ({
  label,
  searchValue,
  type: "attraction",
});

/* Gedeelde attracties — één definitie per locatie, zodat gelijknamige plekken
   (bv. meerdere Julianaparken) overal identiek en eenduidig oplossen. */
const KASTEEL_DE_HAAR = attractie("Kasteel de Haar", "Kasteel de Haar, Haarzuilens");
const WALIBI = attractie("Walibi Holland", "Walibi Holland, Biddinghuizen");
const EFTELING = attractie("Efteling", "Efteling, Kaatsheuvel");
const KEUKENHOF = attractie("Keukenhof", "Keukenhof, Lisse");
const ZAANSE_SCHANS = attractie("Zaanse Schans", "Zaanse Schans, Zaandam");
const GIETHOORN = attractie("Giethoorn", "Giethoorn");
const JULIANAPARK = attractie("Julianapark", "Julianapark, Utrecht");
const MADURODAM = attractie("Madurodam", "Madurodam, Den Haag");
const KINDERDIJK = attractie("Kinderdijk", "Kinderdijk");

export const DESTINATION_GROUPS: OriginDestinationGroup[] = [
  {
    origin: "amsterdam",
    cities: [
      stad("Eindhoven"), stad("Maastricht"), stad("Utrecht"), stad("Rotterdam"),
      stad("Den Haag"), stad("Almere"), stad("Haarlem"), stad("Leiden"),
      stad("Amersfoort"), stad("'s-Hertogenbosch"),
    ],
    attractions: [
      ZAANSE_SCHANS, KEUKENHOF, attractie("Volendam", "Volendam"), GIETHOORN,
      WALIBI, EFTELING, KASTEEL_DE_HAAR, JULIANAPARK, MADURODAM, KINDERDIJK,
    ],
  },
  {
    origin: "almere",
    cities: [
      stad("Eindhoven"), stad("Maastricht"), stad("Amsterdam"), stad("Utrecht"),
      stad("Amersfoort"), stad("Hilversum"), stad("Haarlem"), stad("Den Haag"),
      stad("Rotterdam"), stad("Lelystad"),
    ],
    attractions: [
      WALIBI, attractie("Batavia Stad", "Batavia Stad, Lelystad"),
      attractie("Aviodrome", "Aviodrome, Lelystad"), GIETHOORN,
      attractie("Dolfinarium", "Dolfinarium, Harderwijk"), ZAANSE_SCHANS,
      attractie("Artis", "Artis, Amsterdam"), EFTELING, KASTEEL_DE_HAAR, JULIANAPARK,
    ],
  },
  {
    origin: "utrecht",
    cities: [
      stad("Eindhoven"), stad("Maastricht"), stad("Amsterdam"), stad("Rotterdam"),
      stad("Den Haag"), stad("Arnhem"), stad("Nijmegen"), stad("Amersfoort"),
      stad("'s-Hertogenbosch"), stad("Breda"),
    ],
    attractions: [
      JULIANAPARK, KASTEEL_DE_HAAR, WALIBI, EFTELING,
      attractie("Burgers' Zoo", "Burgers' Zoo, Arnhem"),
      attractie("Ouwehands Dierenpark", "Ouwehands Dierenpark, Rhenen"),
      attractie("Nationaal Park De Hoge Veluwe", "Nationaal Park De Hoge Veluwe, Otterlo"),
      KEUKENHOF, ZAANSE_SCHANS, GIETHOORN,
    ],
  },
  {
    origin: "rotterdam",
    cities: [
      stad("Eindhoven"), stad("Maastricht"), stad("Amsterdam"), stad("Den Haag"),
      stad("Utrecht"), stad("Breda"), stad("Dordrecht"), stad("Delft"),
      stad("Leiden"), stad("'s-Hertogenbosch"),
    ],
    attractions: [
      attractie("Diergaarde Blijdorp", "Diergaarde Blijdorp, Rotterdam"),
      attractie("Euromast", "Euromast, Rotterdam"),
      KINDERDIJK, MADURODAM, KEUKENHOF, EFTELING, WALIBI, KASTEEL_DE_HAAR,
      ZAANSE_SCHANS, GIETHOORN,
    ],
  },
  {
    origin: "den-haag",
    cities: [
      stad("Eindhoven"), stad("Maastricht"), stad("Rotterdam"), stad("Amsterdam"),
      stad("Utrecht"), stad("Leiden"), stad("Delft"), stad("Gouda"), stad("Breda"),
    ],
    attractions: [
      attractie("Scheveningen", "Scheveningen, Den Haag"), MADURODAM, KEUKENHOF,
      attractie("Duinrell", "Duinrell, Wassenaar"),
      attractie("Diergaarde Blijdorp", "Diergaarde Blijdorp, Rotterdam"),
      KINDERDIJK, EFTELING, WALIBI, KASTEEL_DE_HAAR, JULIANAPARK,
    ],
  },
];

export function destinationGroupFor(origin: string): OriginDestinationGroup | null {
  return DESTINATION_GROUPS.find((g) => g.origin === origin) ?? null;
}
