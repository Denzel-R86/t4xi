/**
 * Live Flight Card — pure presentatiehelpers (Sprint 7.9A).
 *
 * Zuivere, testbare afleidingen bovenop het bestaande `NormalizedFlight`-model.
 * GEEN pricing/bookings/DB — puur weergavelogica voor de vluchtkaart in het
 * boekingsformulier. De kaart gebruikt uitsluitend het bestaande /api/flights/*.
 */

import type { NormalizedFlight } from "@/lib/schiphol/types";

/** Zelfde formaat als de rest van de app (booking, RPC, schiphol). */
export const FLIGHT_NUMBER_RE = /^[A-Z0-9]{2,3}[0-9]{1,4}[A-Z]?$/;

export function normalizeFlightInput(value: string): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
export function isValidFlightNumber(value: string): boolean {
  return FLIGHT_NUMBER_RE.test(normalizeFlightInput(value));
}

export type FlightTone = "green" | "amber" | "red" | "neutral";
/** i18n-sleutel onder `booking.flightCard.status.*`. */
export type FlightStatusKey = "scheduled" | "delayed" | "cancelled" | "landed" | "departed";
export type FlightVisual = { tone: FlightTone; dot: string; statusKey: FlightStatusKey };

/**
 * Subtiele statusbadge: kleur + gekleurde stip + vertaalbare labelsleutel.
 * Bewust géén fel dashboard — één rustige indicator.
 */
export function flightVisual(f: NormalizedFlight): FlightVisual {
  if (f.isCancelled) return { tone: "red", dot: "🔴", statusKey: "cancelled" };
  if (f.isDelayed) return { tone: "amber", dot: "🟡", statusKey: "delayed" };
  if (f.isLanded) return { tone: "neutral", dot: "⚪", statusKey: "landed" };
  if (f.isDeparted) return { tone: "neutral", dot: "⚪", statusKey: "departed" };
  return { tone: "green", dot: "🟢", statusKey: "scheduled" };
}

/** Vertraging in hele minuten (estimated − scheduled), of null als onbekend/≤0. */
export function delayMinutes(f: NormalizedFlight): number | null {
  if (!f.scheduledDateTime || !f.estimatedDateTime) return null;
  const s = Date.parse(f.scheduledDateTime);
  const e = Date.parse(f.estimatedDateTime);
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  const min = Math.round((e - s) / 60_000);
  return min > 0 ? min : null;
}

/**
 * De relevante tijd om te tonen: werkelijk → verwacht → gepland. Bij aankomst is
 * dat de landingstijd, bij vertrek de off-block-tijd (zo levert de service het al).
 */
export function primaryTimeIso(f: NormalizedFlight): string | null {
  return f.actualDateTime ?? f.estimatedDateTime ?? f.scheduledDateTime;
}

/** IATA-luchthavencodes → leesbare stad (subset; val terug op de code zelf). */
const IATA_CITY: Record<string, string> = {
  AMS: "Amsterdam Schiphol", GOT: "Göteborg", LHR: "London Heathrow", LGW: "London Gatwick",
  CDG: "Parijs Charles de Gaulle", FRA: "Frankfurt", MUC: "München", BCN: "Barcelona",
  MAD: "Madrid", FCO: "Rome Fiumicino", LIS: "Lissabon", DUB: "Dublin", CPH: "Kopenhagen",
  OSL: "Oslo", ARN: "Stockholm Arlanda", HEL: "Helsinki", ZRH: "Zürich", GVA: "Genève",
  VIE: "Wenen", BRU: "Brussel", MXP: "Milaan Malpensa", IST: "Istanbul", JFK: "New York JFK",
  EWR: "New York Newark", ATL: "Atlanta", DXB: "Dubai",
};
export function iataCity(code: string): string {
  return IATA_CITY[code?.toUpperCase()] ?? code;
}

const AMS = "Amsterdam Schiphol";
/** Herkomst → bestemming voor de kaart. Schiphol staat op de vaste zijde. */
export function routeEndpoints(f: NormalizedFlight): { origin: string; destination: string } {
  const other = f.routeIata.length > 0 ? iataCity(f.routeIata[0]) : null;
  if (f.direction === "arrival") return { origin: other ?? "—", destination: AMS };
  return { origin: AMS, destination: other ?? "—" };
}

/** Luchtvaartmaatschappij uit het vluchtnummer-prefix (subset; anders null). */
const AIRLINES: Record<string, string> = {
  KL: "KLM Royal Dutch Airlines", HV: "Transavia", DL: "Delta Air Lines", TO: "Transavia France",
  BA: "British Airways", AF: "Air France", LH: "Lufthansa", U2: "easyJet", FR: "Ryanair",
  VY: "Vueling", TP: "TAP Air Portugal", SK: "SAS", LX: "SWISS", OS: "Austrian Airlines",
  SN: "Brussels Airlines", TK: "Turkish Airlines", EK: "Emirates", UA: "United Airlines",
  DY: "Norwegian", W6: "Wizz Air", AY: "Finnair", IB: "Iberia",
};
export function airlineName(flightNumber: string): string | null {
  const code = normalizeFlightInput(flightNumber).slice(0, 2);
  return AIRLINES[code] ?? null;
}
