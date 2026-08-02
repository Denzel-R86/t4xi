/**
 * Flight monitoring — service (Sprint 7.8A).
 *
 * Registreert luchthavenboekingen in `flight_monitoring` en werkt actieve vluchten
 * periodiek bij via de BESTAANDE Schiphol-service (lib/schiphol). De pure kern
 * (`buildMonitoringInsert`, `monitoringUpdateFromFlight`, `pollActiveFlights`) is
 * testbaar zonder DB of netwerk; de Supabase-wrappers zijn dun.
 *
 * Geen pricing, geen Stripe.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getFlightStatus,
  normalizeFlightNumber,
  FLIGHT_NUMBER_RE,
  type GetFlightOptions,
} from "@/lib/schiphol/service";
import type { SchipholClientDeps } from "@/lib/schiphol/client";
import type { NormalizedFlight } from "@/lib/schiphol/types";
import type {
  ActiveFlightRow,
  MonitoringInsert,
  MonitoringUpdate,
  PollSummary,
} from "./types";

const TABLE = "flight_monitoring";
const DEFAULT_POLL_LIMIT = 100;

// ── Pure kern ────────────────────────────────────────────────────────────────

/**
 * Bouwt de insert voor het registreren van een boeking. Retourneert null wanneer
 * er geen te volgen vlucht is (geen/ongeldig vluchtnummer of geen booking_id) —
 * de aanroeper slaat registratie dan gewoon over.
 */
export function buildMonitoringInsert(input: {
  bookingId: string | null | undefined;
  flightNumber: string;
  scheduleDate: string | null;
  direction: MonitoringInsert["direction"];
}): MonitoringInsert | null {
  const flightNumber = normalizeFlightNumber(input.flightNumber ?? "");
  if (!input.bookingId || !FLIGHT_NUMBER_RE.test(flightNumber)) return null;
  return {
    booking_id: input.bookingId,
    flight_number: flightNumber,
    schedule_date: input.scheduleDate ?? null,
    direction: input.direction ?? null,
    is_active: true,
  };
}

/** Een vlucht is terminaal (niet meer te volgen) zodra hij geland/vertrokken/geannuleerd is. */
export function isTerminalFlight(flight: NormalizedFlight): boolean {
  return flight.isLanded || flight.isDeparted || flight.isCancelled;
}

/** Pure: vertaalt een genormaliseerde vlucht naar de patch voor de monitoring-rij. */
export function monitoringUpdateFromFlight(
  flight: NormalizedFlight,
  checkedAtIso: string
): Required<MonitoringUpdate> {
  return {
    current_status: flight.status.label,
    estimated_time: flight.estimatedDateTime,
    actual_time: flight.actualDateTime,
    is_active: !isTerminalFlight(flight),
    last_checked_at: checkedAtIso,
  };
}

/** Injecteerbare afhankelijkheden voor een pollronde — maakt 'm testbaar zonder DB/netwerk. */
export type PollDeps = {
  fetchActive: () => Promise<ActiveFlightRow[]>;
  applyUpdate: (id: string, patch: MonitoringUpdate) => Promise<void>;
  getFlight: (flightNumber: string, opts: GetFlightOptions) => Promise<Awaited<ReturnType<typeof getFlightStatus>>>;
  now?: () => Date;
};

/**
 * Werkt elke actieve vlucht bij. Per rij: Schiphol raadplegen, de rij patchen.
 *   - ok            → status/tijden bijwerken; is_active=false bij terminale status.
 *   - not_found     → alleen last_checked_at (vlucht nog buiten Schiphol's venster).
 *   - upstream_error→ alleen last_checked_at, als fout geteld; doorgaan.
 *   - not_configured/unauthorized → ronde afbreken (configuratieprobleem).
 * Best-effort per rij: één DB-fout op een rij stopt de ronde niet.
 */
export async function pollActiveFlights(deps: PollDeps): Promise<PollSummary> {
  const now = deps.now ?? (() => new Date());
  const rows = await deps.fetchActive();

  let updated = 0;
  let deactivated = 0;
  let notFound = 0;
  let errors = 0;

  for (const row of rows) {
    const checkedAt = now().toISOString();
    const res = await deps.getFlight(row.flight_number, {
      scheduleDate: row.schedule_date ?? undefined,
      direction: row.direction ?? undefined,
    });

    if (res.status === "not_configured" || res.status === "unauthorized") {
      // Configuratie-/authfout geldt voor élke rij → ronde afbreken.
      return { checked: rows.length, updated, deactivated, notFound, errors, aborted: res.status };
    }

    try {
      if (res.status === "ok") {
        const patch = monitoringUpdateFromFlight(res.flight, checkedAt);
        await deps.applyUpdate(row.id, patch);
        updated += 1;
        if (!patch.is_active) deactivated += 1;
      } else if (res.status === "not_found") {
        await deps.applyUpdate(row.id, { last_checked_at: checkedAt });
        notFound += 1;
      } else {
        // upstream_error / invalid_input — markeer als gecontroleerd, tel als fout.
        await deps.applyUpdate(row.id, { last_checked_at: checkedAt });
        errors += 1;
      }
    } catch {
      // DB-fout op deze rij mag de ronde niet breken.
      errors += 1;
    }
  }

  return { checked: rows.length, updated, deactivated, notFound, errors };
}

// ── Supabase-wrappers (dun) ──────────────────────────────────────────────────

/**
 * Registreert (of ververst) de tracking voor een boeking. Idempotent via de
 * UNIQUE booking_id (upsert). Retourneert false bij een fout of wanneer er niets
 * te registreren valt — nooit een exception naar de booking-flow.
 */
export async function registerFlightMonitoring(
  supabase: SupabaseClient,
  insert: MonitoringInsert | null
): Promise<boolean> {
  if (!insert) return false;
  try {
    const { error } = await supabase.from(TABLE).upsert(insert, { onConflict: "booking_id" });
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
  opts: { limit?: number; schipholDeps?: SchipholClientDeps } = {}
): Promise<PollSummary> {
  return pollActiveFlights({
    fetchActive: async () => {
      const { data, error } = await supabase
        .from(TABLE)
        .select("id, booking_id, flight_number, schedule_date, direction")
        .eq("is_active", true)
        .order("last_checked_at", { ascending: true, nullsFirst: true })
        .limit(opts.limit ?? DEFAULT_POLL_LIMIT);
      if (error) throw new Error(error.message);
      return (data ?? []) as ActiveFlightRow[];
    },
    applyUpdate: async (id, patch) => {
      const { error } = await supabase.from(TABLE).update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    getFlight: (flightNumber, o) => getFlightStatus(flightNumber, o, opts.schipholDeps),
  });
}
