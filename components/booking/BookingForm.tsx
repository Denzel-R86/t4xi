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
    <div className="relative mt-10 max-w-lg space-y-6 overflow-hidden rounded-[28px] border border-line bg-card p-7 shadow-hero-card">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-accent via-stone to-stone-subtle"
      />
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
        className="flex min-h-[52px] w-full items-center justify-center rounded-md bg-accent px-7 font-display text-sm font-medium text-white shadow-cta transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
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
