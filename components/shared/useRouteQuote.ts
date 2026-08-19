"use client";

import { useEffect, useState } from "react";
import type { AddressSuggestion } from "@/components/shared/AddressAutocomplete";
import { formatEuro } from "@/lib/format/currency";

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
  opts?: {
    returnTrip?: boolean;
    passengers?: number;
    date?: string;
    time?: string;
    returnDate?: string;
    returnTime?: string;
    /**
     * 2026-08-19 (hotfix): bewust gekozen bagagecategorie (zelfde catalogus als
     * /api/bookings, lib/pricing/luggage.ts — "geen-bagage" is een geldige,
     * expliciete keuze). Wordt als 'luggageCategory' meegestuurd naar
     * /api/pricing/quote, dat een prijs zonder geldige bagagekeuze weigert
     * (server-side afdwinging naast de `ready`-gate hieronder).
     */
    luggage?: string;
    /**
     * 2026-08-19 (hotfix): datum, tijd en bagage zijn nu verplicht vóórdat
     * enige prijs getoond of quote-API-call gedaan wordt (adres-alleen mag
     * nooit meer een prijs opleveren). De aanroeper berekent `ready` uit
     * pickup+dropoff+date+time+bagagekeuze en geeft dat hier expliciet door.
     * Standaard `true` zodat bestaande aanroepers die dit (nog) niet doorgeven
     * ongewijzigd blijven werken — beide huidige aanroepers (hero,
     * boekingsformulier) geven dit nu wél expliciet door.
     */
    ready?: boolean;
  }
): Quote {
  const [quote, setQuote] = useState<Quote>({ status: "idle" });
  const returnTrip = opts?.returnTrip ?? false;
  const passengers = opts?.passengers ?? 1;
  // Optioneel gepland vertrek — de server rekent date+time om naar een UTC-instant
  // voor traffic-aware routing én het nachttarief. Leeg laten waar er geen datum/tijd
  // is (homepagehero). Retourtijd bepaalt het nachttarief van het retour-ritdeel.
  const date = opts?.date ?? "";
  const time = opts?.time ?? "";
  const returnDate = opts?.returnDate ?? "";
  const returnTime = opts?.returnTime ?? "";
  const luggage = opts?.luggage ?? "";
  const ready = opts?.ready ?? true;

  useEffect(() => {
    // 2026-08-19 (hotfix): zonder `ready` (datum/tijd/bagage nog niet compleet)
    // wordt er NOOIT gefetcht, ook niet als pickup+dropoff al bekend zijn —
    // dit is de kern van "geen prijs/quote-call vóór datum, tijd en bagage".
    if (!pickup || !dropoff || !ready) {
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
            date,
            time,
            luggageCategory: luggage,
            ...(returnTrip && returnDate && returnTime ? { returnDate, returnTime } : {}),
          }),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.available) {
          setQuote({
            status: "ready",
            amount: formatEuro(Number(data.price)),
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
  }, [pickup, dropoff, ready, returnTrip, passengers, date, time, luggage, returnDate, returnTime]);

  return quote;
}
