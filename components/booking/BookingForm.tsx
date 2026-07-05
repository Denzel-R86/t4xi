"use client";

import { useState } from "react";
import AddressAutocomplete, {
  type AddressSuggestion,
} from "@/components/booking/AddressAutocomplete";

/**
 * Client-formulier van /boeken — gescheiden van de (server) page zodat
 * de route eigen metadata kan exporteren.
 */
export default function BookingForm() {
  const [pickup, setPickup] = useState<AddressSuggestion | null>(null);
  const [dropoff, setDropoff] = useState<AddressSuggestion | null>(null);

  const ready = pickup && dropoff;

  return (
    <div className="mt-10 max-w-lg space-y-6 rounded-2xl border border-line bg-card p-8">
      <AddressAutocomplete
        label="Ophaaladres"
        placeholder="Straat, huisnummer, plaats"
        onSelect={setPickup}
      />
      <AddressAutocomplete
        label="Bestemming"
        placeholder="Straat, huisnummer, plaats"
        onSelect={setDropoff}
      />

      <button
        type="button"
        disabled={!ready}
        className="w-full rounded-full bg-ink px-7 py-4 text-sm font-medium text-white transition-colors hover:bg-ink-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        {ready ? "Bereken vaste prijs" : "Vul beide adressen in"}
      </button>

      <p className="text-xs text-secondary">
        Prijsberekening en ritopslag via Supabase volgen in de volgende
        bouwfase. Adressen worden gevalideerd via PDOK BAG.
      </p>
    </div>
  );
}
