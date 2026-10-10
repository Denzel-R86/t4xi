"use client";

import { useLocale, useTranslations } from "next-intl";
import { computeTariffComparison, LEGAL_TAXI_TARIFF } from "@/lib/pricing/legal-tariff";

/**
 * Compact vergelijkingsblok binnen de ritprijskaart: de bindende vaste
 * ritprijs naast het wettelijke taxametermaximum (opstapmarkt).
 *
 * PR 2.7 (F-28): geen "U betaalt … minder (…%)"-claim en geen evenredig
 * "afgeleide" opbouw meer — die kwam niet van de server. De prijsopbouw van de
 * rit zelf staat in RideResult en toont alleen serverwaarden.
 *
 * Toont niets zonder een echte afstand/rijtijd — er wordt nooit met
 * verzonnen kilometers of minuten vergeleken.
 */
export default function TariffComparison({
  distanceKm,
  durationMin,
  price,
}: {
  distanceKm: number;
  durationMin: number;
  price: number;
}) {
  const t = useTranslations("routezoeker");
  const locale = useLocale();

  if (!(distanceKm > 0) || !(durationMin > 0) || !(price > 0)) return null;

  const tariff = LEGAL_TAXI_TARIFF;
  const c = computeTariffComparison(distanceKm, durationMin, price, tariff);

  const money = new Intl.NumberFormat(locale === "nl" ? "nl-NL" : "en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const euro = (n: number) => `€ ${money.format(n)}`;
  const { km, min } = c;

  return (
    <div className="mt-6 rounded-field border border-line bg-card p-4 sm:p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-secondary">
        {t("tariefVergelijkKop")}
      </p>
      <p className="mt-1 text-[12px] text-secondary">{t("tariefVergelijkSub")}</p>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-secondary">{t("tariefStarttarief")}</dt>
          <dd className="text-right font-medium text-ink [font-variant-numeric:tabular-nums]">
            {euro(tariff.starttarief)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-secondary">{t("tariefAfstandRegel", { km, tarief: money.format(tariff.kilometertarief) })}</dt>
          <dd className="text-right font-medium text-ink [font-variant-numeric:tabular-nums]">
            {euro(km * tariff.kilometertarief)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-secondary">{t("tariefTijdRegel", { min, tarief: money.format(tariff.minuuttarief) })}</dt>
          <dd className="text-right font-medium text-ink [font-variant-numeric:tabular-nums]">
            {euro(min * tariff.minuuttarief)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2">
          <dt className="font-medium text-ink">{t("tariefMaximum")}</dt>
          <dd className="text-right font-semibold text-ink [font-variant-numeric:tabular-nums]">
            {euro(c.taxameterMaximum)}
          </dd>
        </div>
      </dl>

      {/* Neutraal naast elkaar: geen voordeelclaim (F-28, §0c) — alleen de twee bedragen. */}
      <div className="mt-3 flex items-baseline justify-between gap-3 rounded-field border border-line bg-fog p-3 text-sm">
        <p className="text-secondary">{t("tariefVastePrijsLabel")}</p>
        <p className="text-right font-semibold text-ink [font-variant-numeric:tabular-nums]">{euro(price)}</p>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-secondary">
        {t("tariefToelichting", { prijs: euro(price) })}
      </p>
    </div>
  );
}
