"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { NormalizedFlight } from "@/lib/schiphol/types";
import {
  normalizeFlightInput,
  isValidFlightNumber,
  flightVisual,
  delayMinutes,
  primaryTimeIso,
  routeEndpoints,
  airlineName,
  type FlightTone,
} from "@/lib/flight-card";

/**
 * Live vluchtkaart (Sprint 7.9A). Zodra de klant een vluchtnummer invoert:
 * debounce 500 ms → GET /api/flights/[flightNumber] → premium informatiekaart.
 *
 * Read-only: gebruikt uitsluitend het bestaande /api/flights/*. Geen pricing,
 * bookings, database of nieuwe API's. Volledig NL/EN via next-intl.
 */

const DEBOUNCE_MS = 500;

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "found"; flight: NormalizedFlight }
  | { kind: "notfound" }
  | { kind: "error" };

/** Subtiele statusbadge — rustige stip + kleur, geen fel dashboard. */
const TONE_CLASSES: Record<FlightTone, string> = {
  green: "border-green-600/30 bg-green-600/5 text-green-700",
  amber: "border-amber-500/30 bg-amber-500/5 text-amber-700",
  red: "border-red-500/30 bg-red-500/5 text-red-700",
  neutral: "border-line bg-fog text-secondary",
};

export default function FlightCard({
  flightNumber,
  direction = null,
}: {
  flightNumber: string;
  /** Ritrichting: bepaalt WELK ritdeel (vertrek/aankomst) van hetzelfde
   *  vluchtnummer wordt getoond. Bij een vertrek adres → Schiphol tonen we de
   *  vertrekvlucht, niet de gelijknamige aankomst. */
  direction?: "arrival" | "departure" | null;
}) {
  const t = useTranslations("booking.flightCard");
  const format = useFormatter();
  const [state, setState] = useState<State>({ kind: "idle" });

  const normalized = normalizeFlightInput(flightNumber);
  const valid = isValidFlightNumber(normalized);

  useEffect(() => {
    if (!valid) {
      setState({ kind: "idle" });
      return;
    }
    const controller = new AbortController();
    setState({ kind: "loading" });
    const timer = setTimeout(async () => {
      try {
        const qs = direction ? `?direction=${direction}` : "";
        const res = await fetch(`/api/flights/${encodeURIComponent(normalized)}${qs}`, {
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok && data.flight) {
          setState({ kind: "found", flight: data.flight as NormalizedFlight });
        } else if (res.status === 404 || data.error === "not_found") {
          setState({ kind: "notfound" });
        } else {
          setState({ kind: "error" });
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setState({ kind: "error" });
      }
    }, DEBOUNCE_MS);
    // Debounce + cancel: bij elke wijziging vervalt de vorige timer/fetch → geen API-spam.
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [normalized, valid, direction]);

  if (state.kind === "idle") return null;

  const card = "mt-3 rounded-2xl border border-line bg-fog p-5";

  if (state.kind === "loading") {
    return (
      <div className={card} role="status" aria-live="polite" aria-busy="true">
        <p className="text-[13px] font-semibold text-secondary">{t("searching")}</p>
        <div className="mt-3 flex flex-col gap-2" aria-hidden="true">
          <div className="h-3 w-2/3 animate-pulse rounded bg-stone/20" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-stone/20" />
          <div className="h-8 w-1/3 animate-pulse rounded bg-stone/20" />
        </div>
      </div>
    );
  }

  if (state.kind === "notfound") {
    return (
      <div className={card} role="status" aria-live="polite">
        <p className="text-base" aria-hidden="true">⚠️</p>
        <p className="mt-1 text-sm font-bold text-ink">{t("notFoundTitle")}</p>
        <p className="mt-1 text-[13px] text-secondary">{t("notFoundHint")}</p>
        <p className="mt-2 text-[12px] text-stone">
          {t("example")}: <span className="font-semibold text-secondary">KL1234</span>
        </p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className={card} role="status" aria-live="polite">
        <p className="text-[13px] text-secondary">{t("error")}</p>
      </div>
    );
  }

  // ── found ──────────────────────────────────────────────────────────────────
  const flight = state.flight;
  const visual = flightVisual(flight);
  const { origin, destination } = routeEndpoints(flight);
  const airline = airlineName(flight.flightNumber);
  const isArrival = flight.direction === "arrival";
  const delay = delayMinutes(flight);
  const timeIso = primaryTimeIso(flight);
  const timeLabel = isArrival ? t("landing") : t("departure");
  const hhmm = (iso: string) =>
    format.dateTime(new Date(iso), { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });

  return (
    <div className={card} role="status" aria-live="polite">
      {/* Kop: vluchtnummer + maatschappij */}
      <div className="flex items-baseline gap-2">
        <span aria-hidden="true">✈️</span>
        <span className="font-display text-lg font-bold text-ink">{flight.flightNumber}</span>
      </div>
      {airline && <p className="mt-0.5 text-[13px] text-secondary">{airline}</p>}

      {/* Route */}
      <p className="mt-2 text-sm font-medium text-ink">
        {origin} <span className="text-stone">→</span> {destination}
      </p>

      {/* Subtiele statusbadge */}
      <span
        className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold ${TONE_CLASSES[visual.tone]}`}
      >
        <span aria-hidden="true">{visual.dot}</span>
        {t(`status.${visual.statusKey}`)}
      </span>

      {/* Tijd (landing/vertrek) + eventuele vertraging */}
      {timeIso && (
        <div className="mt-3">
          <div className="text-[11px] uppercase tracking-[0.12em] text-stone">
            {delay ? (isArrival ? t("newLanding") : t("newDeparture")) : timeLabel}
          </div>
          <div className="mt-0.5 font-display text-2xl font-bold text-accent">{hhmm(timeIso)}</div>
          {delay && <div className="mt-0.5 text-[12px] font-semibold text-amber-700">{t("delayMin", { count: delay })}</div>}
        </div>
      )}

      {/* Terminal / gate — alleen wanneer bekend */}
      {(flight.terminal || flight.gate) && (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-secondary">
          {flight.terminal && <span>{t("terminal")} <b className="text-ink">{flight.terminal}</b></span>}
          {flight.gate && <span>{t("gate")} <b className="text-ink">{flight.gate}</b></span>}
        </div>
      )}

      {/* Laatste update */}
      {flight.lastUpdatedAt && (
        <div className="mt-3 text-[12px] text-stone">
          {t("lastUpdate")}{" "}
          <span className="text-secondary">{format.relativeTime(new Date(flight.lastUpdatedAt))}</span>
        </div>
      )}

      {/* Belofte */}
      <p className="mt-3 border-t border-line pt-3 text-[12px] text-secondary">
        <span className="font-semibold text-accent" aria-hidden="true">✓</span> {t("tracking")}
      </p>
    </div>
  );
}
