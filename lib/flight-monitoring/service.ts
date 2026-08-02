/**
 * Flight monitoring — service (Sprint 7.8A, B1–B3 hardening).
 *
 * Registreert luchthavenboekingen en pollt actieve vluchten via de BESTAANDE
 * Schiphol-service. Ontwerp:
 *   B1 concurrency — rijen worden atomair GECLAIMD via de RPC
 *     `claim_flights_for_monitoring` (FOR UPDATE SKIP LOCKED + next_check_at).
 *     Gelijktijdige runs krijgen disjuncte rijen; een geclaimde rij is pas na
 *     next_check_at opnieuw claimbaar → geen dubbele polling, geen ouder-
 *     overschrijft-nieuwer.
 *   B2 lifecycle — cancelled/departed stoppen direct; landed blijft actief tot
 *     een configureerbare timeout ná de landingstijd; een max-age vangnet stopt
 *     stuck/not_found-rijen.
 *   B3 schaalbaarheid — de run DRAINT in batches (geen stille limit=100); bij
 *     upstream-fouten exponentiële backoff, met respect voor 429 Retry-After.
 *
 * De pure kern (decidePatch, backoff, lifecycle) is testbaar zonder DB/netwerk;
 * de Supabase-wrappers zijn dun. Geen pricing, geen Stripe.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getFlightStatus,
  normalizeFlightNumber,
  FLIGHT_NUMBER_RE,
  type GetFlightOptions,
} from "@/lib/schiphol/service";
import type { SchipholClientDeps } from "@/lib/schiphol/client";
import type { FlightLookupResult, NormalizedFlight } from "@/lib/schiphol/types";
import type {
  ClaimedFlightRow,
  MonitoringRegistration,
  MonitoringUpdate,
  PollConfig,
  PollSummary,
} from "./types";

const TABLE = "flight_monitoring";

// ── Configuratie ─────────────────────────────────────────────────────────────

/** Env-gedreven defaults. Alle waarden zijn bewust configureerbaar (B2/B3). */
export function defaultPollConfig(
  env: Record<string, string | undefined> = process.env
): PollConfig {
  const num = (v: string | undefined, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  return {
    pollIntervalSec: num(env.FLIGHT_POLL_INTERVAL_SEC, 300),
    landedTimeoutMinutes: num(env.FLIGHT_LANDED_TIMEOUT_MIN, 90),
    maxAgeDays: num(env.FLIGHT_MAX_AGE_DAYS, 2),
    backoffBaseSec: num(env.FLIGHT_BACKOFF_BASE_SEC, 60),
    backoffMaxSec: num(env.FLIGHT_BACKOFF_MAX_SEC, 3600),
    batchSize: num(env.FLIGHT_POLL_BATCH_SIZE, 50),
    maxBatches: num(env.FLIGHT_POLL_MAX_BATCHES, 20),
  };
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Bouwt de registratie-parameters; null wanneer er geen te volgen vlucht is. */
export function buildRegistration(input: {
  bookingId: string | null | undefined;
  flightNumber: string;
  scheduleDate: string | null;
  direction: MonitoringRegistration["direction"];
}): MonitoringRegistration | null {
  const flightNumber = normalizeFlightNumber(input.flightNumber ?? "");
  if (!input.bookingId || !FLIGHT_NUMBER_RE.test(flightNumber)) return null;
  return {
    booking_id: input.bookingId,
    flight_number: flightNumber,
    schedule_date: input.scheduleDate ?? null,
    direction: input.direction ?? null,
  };
}

/** Een vlucht is terminaal (niet meer te volgen) bij geland/vertrokken/geannuleerd. */
export function isTerminalFlight(flight: NormalizedFlight): boolean {
  return flight.isLanded || flight.isDeparted || flight.isCancelled;
}

const isoPlusSeconds = (now: Date, sec: number) =>
  new Date(now.getTime() + Math.max(sec, 1) * 1000).toISOString();

/** Exponentiële backoff met plafond (seconden). retryCount is 1-based. */
export function backoffSeconds(retryCount: number, config: PollConfig): number {
  const factor = 2 ** Math.max(retryCount - 1, 0);
  return Math.min(config.backoffMaxSec, Math.round(config.backoffBaseSec * factor));
}

/**
 * Is de landing-timeout verstreken? Referentie = werkelijke, anders verwachte
 * landingstijd. Zonder bruikbare tijd (net geland, geen tijd) → nog niet verstreken,
 * zodat we blijven pollen tot Schiphol een tijd levert.
 */
export function landedTimeoutElapsed(flight: NormalizedFlight, now: Date, config: PollConfig): boolean {
  const ref = flight.actualDateTime ?? flight.estimatedDateTime;
  if (!ref) return false;
  const refMs = Date.parse(ref);
  if (Number.isNaN(refMs)) return false;
  return now.getTime() - refMs >= config.landedTimeoutMinutes * 60_000;
}

/** Max-age vangnet voor stuck/not_found-rijen: te oud → niet langer volgen. */
export function isPastMaxAge(
  row: Pick<ClaimedFlightRow, "schedule_date" | "created_at">,
  now: Date,
  config: PollConfig
): boolean {
  const ref = row.schedule_date
    ? Date.parse(`${row.schedule_date}T00:00:00Z`)
    : Date.parse(row.created_at);
  if (Number.isNaN(ref)) return false;
  return now.getTime() - ref > config.maxAgeDays * 86_400_000;
}

export type PatchCategory = "updated" | "deactivated" | "notFound" | "rateLimited" | "error";

/**
 * PURE kern: bepaalt de patch + categorie voor één geclaimde rij op basis van het
 * Schiphol-resultaat, de tijd en de config. `not_configured`/`unauthorized` horen
 * hier NIET te komen — die breken de hele ronde af in pollActiveFlights.
 */
export function decidePatch(input: {
  row: ClaimedFlightRow;
  result: FlightLookupResult;
  now: Date;
  config: PollConfig;
}): { patch: MonitoringUpdate; category: PatchCategory } {
  const { row, result, now, config } = input;
  const nowIso = now.toISOString();
  const expired = isPastMaxAge(row, now, config);

  if (result.status === "ok") {
    const f = result.flight;
    let active: boolean;
    if (f.isCancelled || f.isDeparted) active = false; // stop direct
    else if (f.isLanded) active = !landedTimeoutElapsed(f, now, config); // blijf tot timeout
    else active = true; // scheduled/delayed/…
    if (expired) active = false;

    const patch: MonitoringUpdate = {
      current_status: f.status.label,
      estimated_time: f.estimatedDateTime,
      actual_time: f.actualDateTime,
      is_active: active,
      retry_count: 0,
      next_check_at: active ? isoPlusSeconds(now, config.pollIntervalSec) : null,
      last_checked_at: nowIso,
    };
    return { patch, category: active ? "updated" : "deactivated" };
  }

  if (result.status === "not_found") {
    const active = !expired;
    return {
      patch: {
        is_active: active,
        next_check_at: active ? isoPlusSeconds(now, config.pollIntervalSec) : null,
        last_checked_at: nowIso,
      },
      category: active ? "notFound" : "deactivated",
    };
  }

  // Transiënte fout (upstream_error incl. 429, of invalid_input): backoff, actief
  // laten tenzij te oud. 429 → Retry-After respecteren (met ondergrens = backoff-basis).
  const is429 = result.status === "upstream_error" && result.upstreamStatus === 429;
  const retryCount = row.retry_count + 1;
  const active = !expired;
  const retryAfter = result.status === "upstream_error" ? result.retryAfterSeconds : undefined;
  const delaySec = is429 && retryAfter !== undefined
    ? Math.max(retryAfter, config.backoffBaseSec)
    : backoffSeconds(retryCount, config);

  return {
    patch: {
      is_active: active,
      retry_count: retryCount,
      next_check_at: active ? isoPlusSeconds(now, delaySec) : null,
      last_checked_at: nowIso,
    },
    category: !active ? "deactivated" : is429 ? "rateLimited" : "error",
  };
}

// ── Pollronde (batched draining) ─────────────────────────────────────────────

export type PollDeps = {
  /** Claimt tot `limit` due rijen atomair; bumpt hun next_check_at met nextIntervalSec. */
  claimBatch: (limit: number, nextIntervalSec: number) => Promise<ClaimedFlightRow[]>;
  applyUpdate: (id: string, patch: MonitoringUpdate) => Promise<void>;
  getFlight: (flightNumber: string, opts: GetFlightOptions) => Promise<FlightLookupResult>;
  now?: () => Date;
};

/**
 * Draait één ronde: claim → poll → patch, in batches tot alles gedraineerd is of
 * het batch-plafond bereikt is (geen stille limit=100). Best-effort per rij; een
 * config-/authfout breekt de ronde af.
 */
export async function pollActiveFlights(deps: PollDeps, config: PollConfig): Promise<PollSummary> {
  const now = deps.now ?? (() => new Date());
  const summary: PollSummary = {
    claimed: 0, updated: 0, deactivated: 0, notFound: 0, errors: 0, rateLimited: 0, batches: 0,
  };

  for (let batch = 0; batch < config.maxBatches; batch += 1) {
    const rows = await deps.claimBatch(config.batchSize, config.pollIntervalSec);
    if (rows.length === 0) break;
    summary.batches += 1;
    summary.claimed += rows.length;

    for (const row of rows) {
      const res = await deps.getFlight(row.flight_number, {
        scheduleDate: row.schedule_date ?? undefined,
        direction: row.direction ?? undefined,
      });
      if (res.status === "not_configured" || res.status === "unauthorized") {
        summary.aborted = res.status;
        return summary;
      }

      const { patch, category } = decidePatch({ row, result: res, now: now(), config });
      try {
        await deps.applyUpdate(row.id, patch);
        summary[category === "updated" ? "updated"
          : category === "deactivated" ? "deactivated"
          : category === "notFound" ? "notFound"
          : category === "rateLimited" ? "rateLimited"
          : "errors"] += 1;
      } catch {
        summary.errors += 1; // DB-fout op deze rij mag de ronde niet breken.
      }
    }

    if (rows.length < config.batchSize) break; // gedraineerd
  }

  return summary;
}

// ── Supabase-wrappers (dun) ──────────────────────────────────────────────────

/**
 * Registreert (of ververst) de tracking voor een boeking via de RPC
 * `register_flight_monitoring` (idempotent op booking_id; reactiveert een terminale
 * rij NIET). Retourneert false bij fout/niets-te-doen — nooit een exception naar de
 * booking-flow.
 */
export async function registerFlightMonitoring(
  supabase: SupabaseClient,
  registration: MonitoringRegistration | null
): Promise<boolean> {
  if (!registration) return false;
  try {
    const { error } = await supabase.rpc("register_flight_monitoring", {
      p_booking_id: registration.booking_id,
      p_flight_number: registration.flight_number,
      p_schedule_date: registration.schedule_date,
      p_direction: registration.direction,
    });
    if (error) {
      console.error("[flight-monitoring] registratie faalde:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[flight-monitoring] registratie-exceptie:", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Draait een pollronde tegen Supabase + de Schiphol-service. */
export async function pollActiveFlightsWithSupabase(
  supabase: SupabaseClient,
  opts: { config?: Partial<PollConfig>; schipholDeps?: SchipholClientDeps } = {}
): Promise<PollSummary> {
  const config: PollConfig = { ...defaultPollConfig(), ...opts.config };
  return pollActiveFlights(
    {
      claimBatch: async (limit, nextIntervalSec) => {
        const { data, error } = await supabase.rpc("claim_flights_for_monitoring", {
          p_limit: limit,
          p_next_interval_seconds: nextIntervalSec,
        });
        if (error) throw new Error(error.message);
        return (data ?? []) as ClaimedFlightRow[];
      },
      applyUpdate: async (id, patch) => {
        const { error } = await supabase.from(TABLE).update(patch).eq("id", id);
        if (error) throw new Error(error.message);
      },
      getFlight: (flightNumber, o) => getFlightStatus(flightNumber, o, opts.schipholDeps),
    },
    config
  );
}
