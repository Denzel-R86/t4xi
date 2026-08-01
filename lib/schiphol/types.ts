/**
 * Schiphol Public Flight API — types (Sprint: Schiphol API foundation).
 *
 * Twee lagen:
 *   1. RAW — een BEWUST beperkte weergave van de velden uit de Schiphol
 *      `public-flights/flights`-respons die wij gebruiken. De echte respons bevat
 *      veel meer; we typen alleen wat we lezen en behandelen alles als optioneel,
 *      want een externe API is geen contract.
 *   2. GENORMALISEERD — de schone, stabiele vorm die de rest van T4XI ziet. De
 *      normalisatie (lib/schiphol/service.ts) is de enige plek die van RAW naar
 *      dit model vertaalt, zodat een wijziging bij Schiphol één plek raakt.
 *
 * GEEN booking-, pricing- of UI-koppeling hier — puur de vluchtdata-foundation.
 */

/** Richting zoals wij die intern hanteren (Schiphol codeert 'A'/'D'). */
export type FlightDirection = "arrival" | "departure";

/** RAW: subset van één vlucht uit de Schiphol-respons. Alles optioneel. */
export interface RawSchipholFlight {
  flightName?: string;
  flightNumber?: number;
  /** "A" = arrival, "D" = departure. */
  flightDirection?: string;
  scheduleDate?: string;
  scheduleTime?: string;
  scheduleDateTime?: string;
  /** Aankomst. */
  estimatedLandingTime?: string;
  actualLandingTime?: string;
  /** Vertrek. */
  publicEstimatedOffBlockTime?: string;
  actualOffBlockTime?: string;
  expectedTimeGateOpen?: string;
  expectedTimeBoarding?: string;
  gate?: string;
  pier?: string;
  terminal?: number;
  publicFlightState?: { flightStates?: string[] };
  route?: { destinations?: string[]; eu?: string; visa?: boolean };
  aircraftType?: { iataMain?: string; iataSub?: string };
  mainFlight?: string;
  lastUpdatedAt?: string;
  prefixIATA?: string;
  prefixICAO?: string;
}

/** RAW: de omhullende respons (`{ flights: [...] }`). */
export interface RawSchipholFlightsResponse {
  flights?: RawSchipholFlight[];
}

/** GENORMALISEERD: de stabiele vorm voor de rest van de app. */
export interface NormalizedFlight {
  /** Genormaliseerd vluchtnummer, bv. "KL1234". */
  flightNumber: string;
  direction: FlightDirection;
  scheduleDate: string | null;
  /** ISO-8601 gepland vertrek/aankomst. */
  scheduledDateTime: string | null;
  /** ISO-8601 verwacht (landing bij aankomst, off-block bij vertrek). */
  estimatedDateTime: string | null;
  /** ISO-8601 werkelijk (landing bij aankomst, off-block bij vertrek). */
  actualDateTime: string | null;
  status: {
    /** Ruwe Schiphol-statuscodes, bv. ["DEL"]. */
    codes: string[];
    /** Neutrale (Engelse) label voor de primaire code; UI vertaalt zelf. */
    label: string;
  };
  isDelayed: boolean;
  isCancelled: boolean;
  /** Aankomst geland. */
  isLanded: boolean;
  /** Vertrek vertrokken. */
  isDeparted: boolean;
  /** IATA-codes van herkomst (aankomst) resp. bestemming (vertrek). */
  routeIata: string[];
  gate: string | null;
  pier: string | null;
  terminal: string | null;
  aircraftType: string | null;
  /** Codeshare-hoofdvlucht, indien deze vlucht een codeshare is. */
  mainFlight: string | null;
  lastUpdatedAt: string | null;
}

/** Uitkomst van een vluchtopvraag — expliciete, afhandelbare toestanden. */
export type FlightLookupResult =
  | { status: "ok"; flight: NormalizedFlight; matches: number }
  | { status: "invalid_input"; message: string }
  | { status: "not_found" }
  | { status: "not_configured" }
  | { status: "unauthorized" }
  | { status: "upstream_error"; upstreamStatus: number | null };

/** Uitkomst van de health-check tegen de Schiphol-API. */
export type SchipholHealth = {
  ok: boolean;
  status: "ok" | "not_configured" | "unauthorized" | "unreachable";
  /** HTTP-status van de upstream-check, indien er een respons was. */
  upstreamStatus: number | null;
  checkedAt: string;
};
