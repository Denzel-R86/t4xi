"use client";

import "./handoff.css";
import { useLayoutEffect } from "react";
import JourneyLine from "@/components/horizon/JourneyLine";
import type { AddressSuggestion } from "@/components/shared/AddressAutocomplete";
import type { Quote } from "@/components/shared/useRouteQuote";
import { journeyStateFor } from "@/lib/horizon/journey-line-state";
import { signalHandoffLanded } from "./view-transition";

/** Korte plaatsnaam zoals in de zin ("Amsterdam Zuidas, Amsterdam" → "Amsterdam Zuidas"). */
const short = (label: string) => label.split(",")[0]?.trim() || label;

/**
 * Route uit de hero op /boeken (PR 2.3): dezelfde JourneyLine als in de zin, met
 * dezelfde view-transition-naam, zodat de lijn bij de overgang doorloopt. Volgt de
 * actuele formulierstaat; `arrived` alleen bij een backend-bevestigde quote.
 * Decoratief: de adressen staan als tekst in de velden eronder.
 */
export default function HandoffRouteLine({
  pickup,
  dropoff,
  quote,
}: {
  pickup: AddressSuggestion | null;
  dropoff: AddressSuggestion | null;
  quote: Quote;
}) {
  // Na de commit van de nieuwe DOM: de view transition mag de nieuwe toestand vastleggen.
  useLayoutEffect(() => signalHandoffLanded(), []);
  if (!pickup || !dropoff) return null;
  return (
    <div className="hx-handoff-journey mb-5">
      <JourneyLine
        state={journeyStateFor(quote, pickup, dropoff)}
        from={short(pickup.label)}
        to={short(dropoff.label)}
        decorative
      />
    </div>
  );
}
