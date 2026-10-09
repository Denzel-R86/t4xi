/**
 * Boekingszin 2.0 (Experience 2.0 PR 2.1, masterplan §6) — pure beslislogica.
 * Geen DOM, geen React: de component meet en tekent, deze functies beslissen.
 */
import type { JourneyState } from "@/lib/horizon/journey-line-state";

/**
 * Passagierskeuze in de zin: dezelfde grens als /boeken (BookingSection,
 * `min={1} max={4}`). Of een combinatie met bagage handmatig beoordeeld moet
 * worden, beslist uitsluitend de server (/api/pricing/quote → `onrequest`).
 */
export const SENTENCE_PASSENGERS = [1, 2, 3, 4] as const;
export const SENTENCE_DEFAULT_PASSENGERS = 1;

/** Normaliseert een (select-)waarde naar 1–4; alles daarbuiten → standaard 1. */
export function sentencePassengers(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : SENTENCE_DEFAULT_PASSENGERS;
}

/** Duur van de reis over de JourneyLine (§4: 600ms, `--jl-run`). */
export const JOURNEY_RUN_MS = 600;

/**
 * Prijsreveal (§6.4): de prijs verschijnt pas als de lijn is aangekomen.
 * Tijdens `travelling` blijft de regel "bezig" (geen prijs, wel aria-busy).
 * `onrequest`/`error` krijgen geen theater: die tonen meteen hun eigen tekst.
 */
export function priceRevealed(status: string, drawn: JourneyState): boolean {
  return status === "ready" && drawn !== "travelling";
}

/** Is de resultaatregel nog bezig (laden, of de reis vóór de prijs)? */
export function resultBusy(status: string, drawn: JourneyState): boolean {
  return status === "loading" || (status === "ready" && drawn === "travelling");
}
