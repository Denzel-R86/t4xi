/**
 * Flight monitoring — types (Sprint 7.8A, B1–B3 hardening).
 */

import type { FlightDirection } from "@/lib/schiphol/types";

/** Een door `claim_flights_for_monitoring` atomair geclaimde rij. */
export type ClaimedFlightRow = {
  id: string;
  booking_id: string;
  flight_number: string;
  schedule_date: string | null;
  direction: FlightDirection | null;
  created_at: string;
  retry_count: number;
};

/** Parameters voor registratie (RPC register_flight_monitoring). Geen is_active:
 *  de DB-default zet 'm en herregistratie reactiveert een terminale rij niet. */
export type MonitoringRegistration = {
  booking_id: string;
  flight_number: string;
  schedule_date: string | null;
  direction: FlightDirection | null;
};

/** Patch die de poller op een rij toepast. `last_checked_at` is altijd aanwezig. */
export type MonitoringUpdate = {
  current_status?: string | null;
  estimated_time?: string | null;
  actual_time?: string | null;
  is_active?: boolean;
  /** Volgende due-tijd (ISO) of null wanneer de rij gedeactiveerd wordt. */
  next_check_at?: string | null;
  retry_count?: number;
  last_checked_at: string;
};

/** Configuratie voor een pollronde (env-gedreven defaults, zie service). */
export type PollConfig = {
  /** Normale herhaalinterval voor een actieve, gezonde rij (seconden). */
  pollIntervalSec: number;
  /** Blijf een gelande vlucht volgen tot zoveel minuten ná de landingstijd. */
  landedTimeoutMinutes: number;
  /** Deactiveer rijen ouder dan zoveel dagen (stuck/not_found vangnet). */
  maxAgeDays: number;
  /** Backoff-basis en -plafond bij upstream-fouten (seconden). */
  backoffBaseSec: number;
  backoffMaxSec: number;
  /** Claim-batchgrootte en max. aantal batches per run (drain-plafond). */
  batchSize: number;
  maxBatches: number;
};

/** Uitkomst van één pollronde. */
export type PollSummary = {
  claimed: number;
  updated: number;
  deactivated: number;
  notFound: number;
  errors: number;
  rateLimited: number;
  batches: number;
  /** Gezet wanneer de ronde vroegtijdig stopte door een configuratie-/authfout. */
  aborted?: "not_configured" | "unauthorized";
};
