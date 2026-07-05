"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AddressAutocomplete, {
  type AddressSuggestion,
} from "@/components/booking/AddressAutocomplete";
import Icon from "@/components/ui/Icon";

/** Haalt postcode en stad uit een PDOK-weergavenaam ("Straat 1, 1234AB Stad"). */
function parseAddress(label: string) {
  const match = label.match(/\b(\d{4}\s?[A-Z]{2})\b\s*(.*)$/);
  return {
    postcode: match?.[1] ?? null,
    city: match?.[2]?.trim() || label.split(",").pop()?.trim() || null,
  };
}

export default function HeroBookingCard() {
  const router = useRouter();
  const [pickup, setPickup] = useState<AddressSuggestion | null>(null);
  const [dropoff, setDropoff] = useState<AddressSuggestion | null>(null);

  const meta = pickup ? parseAddress(pickup.label) : null;
  const ready = pickup && dropoff;

  return (
    <div className="relative overflow-hidden rounded-card-lg border border-line bg-white/90 p-6 shadow-hero-card md:p-7">
      {/* Gradient-topbalk uit het v14-design */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-accent via-stone to-stone-subtle"
      />

      <p className="text-sm font-bold uppercase tracking-[0.14em] text-stone">
        Boeken in minder dan 60 seconden
      </p>
      <p className="mb-4 mt-2 font-display text-[26px] font-extrabold leading-[1.08] tracking-tight text-ink md:text-[28px]">
        Uw ritprijs direct zichtbaar.
      </p>

      <div className="grid gap-1">
        <AddressAutocomplete
          label="Ophaaladres"
          placeholder="Bijv. Sterduinstraat 25, Almere"
          onSelect={setPickup}
        />
        <AddressAutocomplete
          label="Bestemming"
          placeholder="Bijv. Schiphol Airport"
          onSelect={setDropoff}
        />
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-3" aria-label="Adresdetectie">
        {[
          { key: "Postcode", value: meta?.postcode },
          { key: "Stad", value: meta?.city },
          { key: "Bron", value: pickup ? (pickup.source === "pdok" ? "PDOK BAG" : "Google") : null },
        ].map((pill) => (
          <div key={pill.key} className="rounded-xl border border-line bg-fog px-3 py-2.5">
            <small className="block text-[10px] uppercase tracking-[0.12em] text-stone">
              {pill.key}
            </small>
            <b className={`block truncate text-[13px] ${pill.value ? "text-accent" : "font-semibold text-stone"}`}>
              {pill.value ?? "—"}
            </b>
          </div>
        ))}
      </div>

      <div
        className="my-4 flex items-center justify-between gap-4 rounded-2xl border border-line bg-fog p-4"
        aria-live="polite"
      >
        <span className="text-xs text-secondary">
          {ready
            ? "Vaste prijs volgt direct bij bevestiging"
            : "Vul vertrek en bestemming in"}
        </span>
        <strong className="font-display text-[26px] text-accent">
          {ready ? "€ —" : "—"}
        </strong>
      </div>

      <button
        type="button"
        disabled={!ready}
        onClick={() => router.push("/boeken")}
        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-md bg-accent px-8 font-display text-base font-medium text-white shadow-cta transition-all hover:-translate-y-0.5 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
      >
        Bekijk beschikbaarheid
        <Icon name="arrow-right" size={18} />
      </button>

      <p className="mt-3.5 text-[13px] leading-relaxed text-secondary">
        Vaste prijs vooraf. Bagage direct afgestemd. Bevestiging via WhatsApp
        of e-mail.
      </p>
    </div>
  );
}
