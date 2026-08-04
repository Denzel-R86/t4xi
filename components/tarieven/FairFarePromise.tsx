"use client";

import Icon from "@/components/ui/Icon";
import { useTranslations } from "next-intl";
import { track } from "@/lib/analytics";

/**
 * Fair Fare Promise — Navy Gray-merkblok direct onder het prijsresultaat.
 *
 * Toont WAAROM een T4XI-tarief is opgebouwd zoals het is, zónder percentages,
 * marges of vertrouwelijke bedrijfsinformatie. De uitleg is een native
 * <details> (werkt zonder JS, correcte aria-expanded/semantiek); openen wordt
 * niet-herleidbaar gemeten.
 */

const BREAKDOWN = ["chauffeur", "voertuig", "vlucht", "verzekering", "support", "btw"] as const;

export default function FairFarePromise() {
  const t = useTranslations("fairFare");
  return (
    <section aria-labelledby="fairfare-title" className="bg-ink text-fog">
      <div className="mx-auto max-w-site px-[5vw] py-16 md:py-24">
        <div className="max-w-2xl">
          <p className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-stone-subtle">
            <span aria-hidden="true" className="h-px w-8 bg-stone-subtle" />
            {t("kicker")}
          </p>
          <h2 id="fairfare-title" className="mt-4 font-display text-display-md font-bold text-fog">
            {t("kop")}
          </h2>
          <p className="mt-4 text-[17px] leading-[1.75] text-stone-subtle">{t("tekst")}</p>

          <details
            className="group mt-7 border-t border-white/15 pt-5"
            onToggle={(e) => {
              if ((e.currentTarget as HTMLDetailsElement).open) track("fair_fare_geopend");
            }}
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-fog [&::-webkit-details-marker]:hidden">
              <Icon
                name="chevron-down"
                size={16}
                className="text-stone-subtle transition-transform group-open:rotate-180 motion-reduce:transition-none"
              />
              {t("uitklap")}
            </summary>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {BREAKDOWN.map((k) => (
                <li key={k} className="flex items-start gap-2.5 text-sm text-stone-subtle">
                  <Icon name="circle-check" size={15} className="mt-0.5 shrink-0 text-fog/70" />
                  {t(`punt_${k}`)}
                </li>
              ))}
            </ul>
            <p className="mt-5 border-t border-white/15 pt-4 text-sm leading-relaxed text-stone-subtle">
              {t("afsluiting")}
            </p>
          </details>
        </div>
      </div>
    </section>
  );
}
