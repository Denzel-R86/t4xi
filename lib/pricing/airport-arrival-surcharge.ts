/**
 * Aankomsttoeslag bij ophalen OP een luchthaven (2026-10-10).
 *
 * Commercieel akkoord: een vaste route wordt voortaan in BEIDE richtingen
 * geprijsd. De heenprijs is de basis; een rit die OP een luchthaven begint
 * krijgt daarbovenop een vaste, per luchthaven configureerbare toeslag. Die
 * dekt wat een aankomstrit extra vraagt en een vertrekrit niet: vluchtmonitoring,
 * afstemming bij vertraging, mogelijke wachttijd en luchthaven-/parkeerkosten.
 *
 * Vier eigenschappen, expliciet vereist door de eigenaar:
 *
 *   1. CONFIGUREERBAAR PER LUCHTHAVEN — het bedrag staat in
 *      `pricing_airport_arrival_surcharge`, nooit hardcoded in deze code.
 *      Een luchthaven ZONDER actieve configuratierij krijgt geen toeslag
 *      (en dus ook geen stilzwijgende default).
 *   2. ÉÉNMAAL PER RIT — ook bij een retour. Een retour vanaf de luchthaven
 *      bevat precies één aankomst (de heenrit); de terugrit eindigt er juist.
 *      Zie `applyArrivalSurcharge`: de toeslag wordt bij de enkele- én de
 *      retourprijs exact één keer opgeteld, nooit verdubbeld.
 *   3. BUITEN DE NACHTTOESLAGBASIS — de toeslag dekt parkeren, monitoring en
 *      wachttijd; die kosten schalen niet met het nachtvenster. De nachttoeslag
 *      blijft daarom onverkort gelden over `rideOnlySinglePriceCents` (de
 *      passagiersrit), exact zoals bij de pickup-aanrijcomponent. Zo wordt de
 *      toeslag nooit ongemerkt met 15% opgehoogd of bij een retour dubbel belast.
 *   4. ZICHTBAAR IN DE INTERNE PRIJSOPBOUW — via `AirportArrivalSurcharge` op
 *      het quote-resultaat en in de quote-log. De KLANT ziet uitsluitend één
 *      vast eindbedrag: de toeslag zit in `price`/`priceCents` verwerkt en komt
 *      nooit als losse regel in de publieke API-response.
 *
 * Deze module is bewust puur en synchroon: het laden van de configuratie
 * gebeurt in service.ts, het rekenen hier.
 */

/** Eén actieve toeslagconfiguratie, zoals geladen uit de database. */
export type AirportArrivalSurchargeConfig = {
  /** Slug van de luchthaven (`locations.slug`), uitsluitend voor de opbouw/log. */
  airportSlug: string;
  /** Vast bedrag in hele centen. Altijd >= 0. */
  surchargeCents: number;
};

/** INTERN — de opbouwregel. Nooit in de publieke API-response opnemen. */
export type AirportArrivalSurcharge = {
  airportSlug: string;
  surchargeCents: number;
  /**
   * Altijd `true`. Expliciet in de opbouw opgenomen zodat bij het lezen van een
   * oude quote-log zichtbaar is dat de toeslag per rit geldt en niet per ritdeel.
   */
  appliedOnce: true;
};

function isValidCents(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && Number.isFinite(value);
}

/**
 * Bepaalt de toeslag voor deze rit. Levert `null` — géén toeslag — wanneer de
 * rit niet op een luchthaven begint, er geen actieve configuratie voor die
 * luchthaven is, of het geconfigureerde bedrag onbruikbaar is (fail-closed:
 * bij twijfel liever geen toeslag dan een willekeurige).
 */
export function resolveArrivalSurcharge(params: {
  /** Begint de rit OP een luchthaven? Komt uit de bestaande AirportContext. */
  pickupIsAirport: boolean;
  /** Configuratie van de ophaallocatie, of `null` als die er niet is. */
  config: AirportArrivalSurchargeConfig | null;
}): AirportArrivalSurcharge | null {
  if (!params.pickupIsAirport) return null;
  const config = params.config;
  if (!config) return null;
  if (!isValidCents(config.surchargeCents)) return null;
  if (config.surchargeCents === 0) return null;
  return {
    airportSlug: config.airportSlug,
    surchargeCents: config.surchargeCents,
    appliedOnce: true,
  };
}

/**
 * Telt de toeslag EXACT ÉÉNMAAL op bij zowel de enkele- als de retourprijs.
 *
 * `returnCents === null` betekent: voor deze route is geen retourprijs
 * geconfigureerd; dan blijft die `null` (geen toeslag op een niet-bestaande prijs).
 *
 * Let op het verschil met een per-ritdeel-toeslag: de retourprijs is hier de
 * REEDS bestaande retourprijs van de route (factor x1,8 in de vaste tarieven),
 * waar de toeslag één keer bovenop komt — niet twee keer, en niet 1,8 keer.
 */
export function applyArrivalSurcharge(params: {
  singleCents: number;
  returnCents: number | null;
  surcharge: AirportArrivalSurcharge | null;
  /**
   * Vertrekt het HEENritdeel vanaf de luchthaven? Alleen dan hoort de toeslag
   * ook bij de enkele-reisprijs.
   *
   * Bij `stad -> luchthaven -> stad` is dit `false`: de enkele reis naar de
   * luchthaven blijft onveranderd (Almere -> Schiphol = EUR 102), terwijl de
   * RETOUR de toeslag wél krijgt omdat de terugrit vanaf de luchthaven
   * vertrekt (EUR 184 + EUR 15 = EUR 199).
   */
  appliesToSingle: boolean;
}): { singleCents: number; returnCents: number | null } {
  const { surcharge } = params;
  if (!surcharge) {
    return { singleCents: params.singleCents, returnCents: params.returnCents };
  }
  return {
    singleCents: params.appliesToSingle
      ? params.singleCents + surcharge.surchargeCents
      : params.singleCents,
    // De retourprijs bevat altijd precies één luchthavenvertrek zodra er
    // überhaupt een toeslag van toepassing is — dus altijd eenmaal optellen,
    // nooit vermenigvuldigen met de retourfactor.
    returnCents: params.returnCents === null ? null : params.returnCents + surcharge.surchargeCents,
  };
}
