/**
 * Schiphol Public Flight API — service & normalisatie (Sprint: Schiphol API foundation).
 *
 * De ENIGE plek die ruwe Schiphol-data naar het stabiele `NormalizedFlight`-model
 * vertaalt en die de client-uitkomsten op afhandelbare toestanden mapt. De HTTP-
 * transportlaag zit in lib/schiphol/client.ts; hier zit de betekenis.
 *
 * `normalizeFlight`, `normalizeFlightNumber` en de statuslabels zijn PUUR en
 * daarmee testbaar zonder netwerk. `getFlightStatus` en `checkSchipholHealth`
 * krijgen de client injecteerbaar mee.
 */

import {
  fetchSchipholFlights,
  schipholCredentials,
  type SchipholClientDeps,
  type SchipholClientResult,
} from "./client";
import type {
  FlightDirection,
  FlightLookupResult,
  NormalizedFlight,
  RawSchipholFlight,
  SchipholHealth,
} from "./types";

/**
 * Vluchtnummerformaat: zelfde patroon als het boekingsformulier en de
 * create_booking RPC — één definitie van "geldig vluchtnummer" door de hele app.
 */
export const FLIGHT_NUMBER_RE = /^[A-Z0-9]{2,3}[0-9]{1,4}[A-Z]?$/;

/** Normaliseert naar hoofdletters zonder scheidingstekens: "kl 1234" → "KL1234". */
export function normalizeFlightNumber(input: string): string {
  return (input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidFlightNumber(input: string): boolean {
  return FLIGHT_NUMBER_RE.test(normalizeFlightNumber(input));
}

/** Neutrale (Engelse) labels voor Schiphol-statuscodes; de UI vertaalt zelf. */
const STATE_LABELS: Record<string, string> = {
  SCH: "Scheduled",
  DEL: "Delayed",
  WIL: "Wait in lounge",
  GTO: "Gate open",
  BRD: "Boarding",
  GCL: "Gate closing",
  GTD: "Gate closed",
  DEP: "Departed",
  CNX: "Cancelled",
  GCH: "Gate change",
  TOM: "Tomorrow",
  ARR: "Arrived",
  AIR: "Airborne",
  EXP: "Expected",
  FIR: "In Dutch airspace",
  LND: "Landed",
  FIB: "First bag",
  LAS: "Last bag",
  DIV: "Diverted",
};

function labelForStates(codes: string[]): string {
  for (const code of codes) {
    const label = STATE_LABELS[code];
    if (label) return label;
  }
  return codes[0] ?? "Unknown";
}

function nonEmpty(value: string | undefined | null): string | null {
  const v = (value ?? "").trim();
  return v === "" ? null : v;
}

/** "A"/"D" → interne richting. Onbekend valt terug op "departure". */
function directionFromRaw(raw: string | undefined): FlightDirection {
  return (raw ?? "").toUpperCase() === "A" ? "arrival" : "departure";
}

/**
 * PUUR: vertaalt één ruwe Schiphol-vlucht naar `NormalizedFlight`. Defensief —
 * ontbrekende velden worden null/leeg, nooit een crash. Het genormaliseerde
 * vluchtnummer wordt afgeleid uit `flightName` (bv. "KL1234").
 */
export function normalizeFlight(raw: RawSchipholFlight): NormalizedFlight {
  const direction = directionFromRaw(raw.flightDirection);
  const codes = Array.isArray(raw.publicFlightState?.flightStates)
    ? raw.publicFlightState!.flightStates!.filter((c): c is string => typeof c === "string")
    : [];

  const isArrival = direction === "arrival";
  const estimatedDateTime = isArrival
    ? nonEmpty(raw.estimatedLandingTime)
    : nonEmpty(raw.publicEstimatedOffBlockTime);
  const actualDateTime = isArrival
    ? nonEmpty(raw.actualLandingTime)
    : nonEmpty(raw.actualOffBlockTime);

  return {
    flightNumber: normalizeFlightNumber(raw.flightName ?? ""),
    direction,
    scheduleDate: nonEmpty(raw.scheduleDate),
    scheduledDateTime: nonEmpty(raw.scheduleDateTime),
    estimatedDateTime,
    actualDateTime,
    status: { codes, label: labelForStates(codes) },
    isDelayed: codes.includes("DEL"),
    isCancelled: codes.includes("CNX"),
    isLanded: codes.includes("LND"),
    isDeparted: codes.includes("DEP"),
    routeIata: Array.isArray(raw.route?.destinations)
      ? raw.route!.destinations!.filter((d): d is string => typeof d === "string")
      : [],
    gate: nonEmpty(raw.gate),
    pier: nonEmpty(raw.pier),
    terminal: raw.terminal !== undefined && raw.terminal !== null ? String(raw.terminal) : null,
    aircraftType: nonEmpty(raw.aircraftType?.iataMain) ?? nonEmpty(raw.aircraftType?.iataSub),
    mainFlight: nonEmpty(raw.mainFlight),
    lastUpdatedAt: nonEmpty(raw.lastUpdatedAt),
  };
}

/** Mapt een niet-ok client-resultaat op de bijbehorende lookup-toestand. */
function lookupFromClientFailure(
  result: Exclude<SchipholClientResult, { ok: true }>
): FlightLookupResult {
  switch (result.reason) {
    case "not_configured":
      return { status: "not_configured" };
    case "unauthorized":
      return { status: "unauthorized" };
    case "network_error":
      return { status: "upstream_error", upstreamStatus: null };
    case "http_error":
      return {
        status: "upstream_error",
        upstreamStatus: result.status,
        ...(result.retryAfterSeconds !== undefined ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
      };
    case "invalid_json":
      return { status: "upstream_error", upstreamStatus: result.status };
  }
}

export type GetFlightOptions = {
  /** Filter op datum (YYYY-MM-DD). Zonder datum: Schiphol's standaardvenster. */
  scheduleDate?: string;
  /** Filter op richting. */
  direction?: FlightDirection;
};

/**
 * Haalt de status van één vlucht op en normaliseert die. Validatie → client →
 * normalisatie. Bij meerdere treffers (bv. codeshares of meerdere datums) wordt
 * de eerste teruggegeven met `matches` als totaal, zodat de aanroeper weet dat er
 * meer waren.
 */
export async function getFlightStatus(
  flightNumberInput: string,
  options: GetFlightOptions = {},
  deps: SchipholClientDeps = {}
): Promise<FlightLookupResult> {
  const flightName = normalizeFlightNumber(flightNumberInput);
  if (!FLIGHT_NUMBER_RE.test(flightName)) {
    return { status: "invalid_input", message: "Ongeldig vluchtnummer. Bijvoorbeeld: KL1234." };
  }

  const query: Record<string, string> = { flightName, sort: "+scheduleTime" };
  if (options.scheduleDate) query.scheduleDate = options.scheduleDate;
  if (options.direction) query.flightDirection = options.direction === "arrival" ? "A" : "D";

  const result = await fetchSchipholFlights(query, deps);
  if (!result.ok) return lookupFromClientFailure(result);

  const flights = Array.isArray(result.data.flights) ? result.data.flights : [];
  if (flights.length === 0) return { status: "not_found" };

  return { status: "ok", flight: normalizeFlight(flights[0]), matches: flights.length };
}

/**
 * Health-check tegen de Schiphol-API. Doet een minimale, goedkope opvraag en
 * interpreteert de uitkomst. Lekt nooit credentials; onderscheidt "niet
 * geconfigureerd", "geweigerd" (verkeerde sleutels) en "onbereikbaar".
 */
export async function checkSchipholHealth(deps: SchipholClientDeps = {}): Promise<SchipholHealth> {
  const checkedAt = new Date().toISOString();

  if (!(deps.credentials ?? schipholCredentials())) {
    return { ok: false, status: "not_configured", upstreamStatus: null, checkedAt };
  }

  // Goedkope opvraag: één pagina, gesorteerd; we lezen alleen de HTTP-status.
  const result = await fetchSchipholFlights({ page: "0", sort: "+scheduleTime" }, deps);
  if (result.ok) {
    return { ok: true, status: "ok", upstreamStatus: result.status, checkedAt };
  }
  if (result.reason === "unauthorized") {
    return { ok: false, status: "unauthorized", upstreamStatus: result.status, checkedAt };
  }
  if (result.reason === "not_configured") {
    return { ok: false, status: "not_configured", upstreamStatus: null, checkedAt };
  }
  const upstreamStatus = "status" in result ? result.status : null;
  return { ok: false, status: "unreachable", upstreamStatus, checkedAt };
}
