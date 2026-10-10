"use client";

import { useEffect, useState } from "react";
import type { Quote } from "@/components/shared/useRouteQuote";
import { priceWasUpdated, provisionalPrice, type ShownPrice } from "@/lib/booking-handoff";

/**
 * Voorlopige prijs op /boeken na de handoff (PR 2.3, besluit eigenaar #70).
 * Zodra de hook ooit een uitkomst gaf (ready/onrequest/error) of de onthouden quote
 * verloopt, is de voorlopige weergave voorgoed weg; daarna telt alleen de server.
 */
export function useHandoffPrice(shown: ShownPrice | null | undefined, quote: Quote, rideUnchanged: boolean) {
  const [settled, setSettled] = useState(false);
  if (!settled && quote.status !== "idle" && quote.status !== "loading") setSettled(true);

  // Verlopen tijdens het wachten (hangende aanvraag): opnieuw renderen op de vervaltijd.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!shown || settled) return;
    const id = window.setTimeout(() => setNow(Date.now()), Math.max(0, shown.expiresAt - Date.now()));
    return () => window.clearTimeout(id);
  }, [shown, settled]);

  const outcome = quote.status === "ready" ? { status: "ready" as const, price: quote.price } : { status: quote.status };
  return {
    provisional: provisionalPrice({ shown, now, settled, rideUnchanged, quote: outcome }),
    updated: priceWasUpdated({ shown, rideUnchanged, quote: outcome }),
  };
}
