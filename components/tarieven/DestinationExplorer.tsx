"use client";

import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import Icon from "@/components/ui/Icon";
import AddressAutocomplete, {
  type AddressSuggestion,
} from "@/components/shared/AddressAutocomplete";
import type { RateEntry } from "@/lib/pricing/rate-card";
import type { OriginDestinationGroup } from "@/lib/destinations";
import { useTranslations } from "next-intl";

/**
 * Bestemmingskiezer per vertrekstad: Steden / Attracties & bezienswaardigheden /
 * Andere bestemming.
 *
 * PRIJZEN KOMEN UITSLUITEND UIT DE RATE-CARD. Dit component toont een vaste
 * prijs alleen wanneer de vertrekstad die bestemming al in fixed_route_prices
 * heeft; alles daarbuiten is expliciet "Prijs op aanvraag". Er wordt hier dus
 * nooit een bedrag verzonnen of afgeleid.
 *
 * "Andere bestemming" gebruikt de GEDEELDE AddressAutocomplete en deep-linkt
 * naar /boeken?pickup=…&dropoff=… — dezelfde flow als hero en boekingsformulier.
 */

type Segment = "cities" | "attractions" | "other";

const SEGMENTS: { key: Segment; labelKey: "steden" | "attracties" | "andere" }[] = [
  { key: "cities", labelKey: "steden" },
  { key: "attractions", labelKey: "attracties" },
  { key: "other", labelKey: "andere" },
];

export default function DestinationExplorer({
  group,
  cityName,
  intercity,
}: {
  group: OriginDestinationGroup;
  cityName: string;
  /** Bestaande vaste intercityprijzen van deze vertrekstad (rate-card). */
  intercity: RateEntry[];
}) {
  const t = useTranslations("kiezer");
  const router = useRouter();
  const [segment, setSegment] = useState<Segment>("cities");
  const [other, setOther] = useState<AddressSuggestion | null>(null);
  const [otherText, setOtherText] = useState("");

  // Vaste prijs per bestemmingsnaam — alléén wat de rate-card al kent.
  const priceByDestination = new Map(intercity.map((e) => [e.to, e]));

  const otherValue = other?.label ?? (otherText.trim().length >= 3 ? otherText.trim() : null);
  const bookingHref = (dropoff: string) =>
    `/boeken?pickup=${encodeURIComponent(cityName)}&dropoff=${encodeURIComponent(dropoff)}`;

  const options = segment === "cities" ? group.cities : segment === "attractions" ? group.attractions : [];

  return (
    <div className="mt-9">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-secondary">
        {t("kop")}
      </h3>

      <div role="tablist" aria-label={t("ariaBestemmingen", { stad: cityName })} className="mt-3 flex flex-wrap gap-2">
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            role="tab"
            aria-selected={segment === s.key}
            onClick={() => setSegment(s.key)}
            className={`min-h-10 rounded-full border px-4 text-sm font-medium transition-colors ${
              segment === s.key
                ? "border-accent bg-accent text-white"
                : "border-line bg-white/70 text-secondary hover:text-ink"
            }`}
          >
            {t(s.labelKey)}
          </button>
        ))}
      </div>

      {segment !== "other" ? (
        <ul className="mt-4 list-none">
          {options.map((o) => {
            const fixed = priceByDestination.get(o.label);
            return (
              <li
                key={o.searchValue + o.label}
                className="grid grid-cols-[1fr_auto] items-baseline gap-x-6 border-t border-line py-3.5 first:border-t-0"
              >
                <span className="font-display text-[15px] font-medium text-ink">
                  {cityName} <span className="text-stone">→</span> {o.label}
                </span>
                {fixed ? (
                  <Link
                    href={bookingHref(o.searchValue)}
                    className="text-right font-display text-[15px] font-bold text-ink underline-offset-4 [font-variant-numeric:tabular-nums] hover:underline"
                  >
                    € {fixed.single}
                    {fixed.retour !== null && (
                      <span className="ml-2 text-sm font-normal text-secondary">{t("retour")} € {fixed.retour}</span>
                    )}
                  </Link>
                ) : (
                  <Link
                    href={bookingHref(o.searchValue)}
                    className="text-right text-sm text-secondary underline-offset-4 hover:text-ink hover:underline"
                  >
                    {t("prijsOpAanvraag")}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-4 max-w-xl border-t border-line pt-4">
          <p className="mb-2 text-sm text-secondary">
            {t("andereUitleg")}
          </p>
          <AddressAutocomplete
            label={t("bestemmingVanuit", { stad: cityName })}
            placeholder={t("anderePh")}
            onSelect={setOther}
            onTextChange={setOtherText}
          />
          <button
            type="button"
            disabled={!otherValue}
            onClick={() => otherValue && router.push(bookingHref(otherValue))}
            className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-6 text-sm font-medium text-white shadow-cta transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("bekijkVastePrijs")}
            <Icon name="arrow-right" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
