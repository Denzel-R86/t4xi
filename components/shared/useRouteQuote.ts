"use client";

import { useEffect, useState } from "react";
import type { AddressSuggestion } from "@/components/shared/AddressAutocomplete";

/**
 * DE gedeelde live-quote-flow: AddressAutocomplete → deze hook →
 * /api/pricing/quote (de autoritatieve Pricing Engine). Homepagehero en
 * boekingsformulier gebruiken exact dezelfde keten; er bestaat géén
 * client-side prijslogica.
 *
 * De luchthavencontext komt UITSLUITEND uit de engine — ook op de
 * "offerte op aanvraag"-tak — zodat het vluchtnummerveld overal op dezelfde
 * serverwaarheid reageert (Sprint 11.1).
 */

export type Airport = { isTransfer: boolean; direction: "arrival" | "departure" | null };

export type Quote =
  | { status: "idle" | "loading" | "error"; airport?: Airport }
  | { status: "onrequest"; airport: Airport }
  | {
      status: "ready";
      amount: string;
      price: number;
      returnApplied: boolean;
      airport: Airport;
      /** Backend-bevestigde afstand (km) — 0 als de engine er geen levert. */
      distanceKm: number;
      /** Backend-bevestigde geschatte reistijd (min) — 0 als onbekend. */
      estimatedDurationMin: number;
      /**
       * Quote-lock identifier van de opgeslagen prijs-snapshot. Wordt bij het
       * bevestigen meegestuurd zodat de boeking exact dit gelockte bedrag gebruikt.
       * `null` als de opslag niet is bevestigd (dan valt de boeking terug op vaste
       * route / offerte-op-aanvraag).
       */
      quoteId: string | null;
    };

export function useRouteQuote(
  pickup: AddressSuggestion | null,
  dropoff: AddressSuggestion | null,
  opts?: { returnTrip?: boolean; passengers?: number; date?: string; time?: string }
): Quote {
  const [quote, setQuote] = useState<Quote>({ status: "idle" });
  const returnTrip = opts?.returnTrip ?? false;
  const passengers = opts?.passengers ?? 1;
  // Optioneel gepland vertrek — de server rekent date+time om naar een UTC-instant
  // voor traffic-aware routing. Leeg laten waar er geen datum/tijd is (homepagehero).
  const date = opts?.date ?? "";
  const time = opts?.time ?? "";

  useEffect(() => {
    if (!pickup || !dropoff) {
      setQuote({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    setQuote({ status: "loading" });
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/pricing/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pickup: pickup.label,
            dropoff: dropoff.label,
            returnTrip,
            passengers,
            ...(date && time ? { date, time } : {}),
          }),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.available) {
          setQuote({
            status: "ready",
            amount: `€${data.price}`,
            price: Number(data.price),
            returnApplied: Boolean(data.returnApplied),
            distanceKm: Number(data.distanceKm) || 0,
            estimatedDurationMin: Number(data.estimatedDurationMin) || 0,
            quoteId: typeof data.quoteId === "string" ? data.quoteId : null,
            airport: {
              isTransfer: Boolean(data.isAirportTransfer),
              direction: data.flightDirection ?? null,
            },
          });
        } else {
          // Ook zonder vaste prijs geeft de API de luchthavencontext mee.
          setQuote({
            status: "onrequest",
            airport: {
              isTransfer: Boolean(data.isAirportTransfer),
              direction: data.flightDirection ?? null,
            },
          });
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setQuote({ status: "error" });
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [pickup, dropoff, returnTrip, passengers, date, time]);

  return quote;
}
