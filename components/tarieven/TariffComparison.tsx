"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Icon from "@/components/ui/Icon";
import { computeTariffComparison, LEGAL_TAXI_TARIFF } from "@/lib/pricing/legal-tariff";

/**
 * Compact vergelijkingsblok binnen de ritprijskaart: de bindende vaste
 * ritprijs naast het wettelijke taxametermaximum (opstapmarkt), met een
 * standaard-gesloten accordion voor de evenredige prijsopbouw.
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
  const [open, setOpen] = useState(false);
  const contentId = `${useId()}-prijsopbouw`;

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
    <div className="mt-6 rounded-field border border-line bg-fog p-4 sm:p-5">
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

      <div
        className={`mt-3 rounded-field border p-3 ${
          c.isVoordeliger ? "border-emerald-200 bg-emerald-50" : "border-line bg-card"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p
              className={`text-[10px] uppercase tracking-[0.12em] ${
                c.isVoordeliger ? "text-emerald-700" : "text-stone"
              }`}
            >
              {t("tariefVastePrijsLabel")}
            </p>
            <p
              className={`text-base font-bold [font-variant-numeric:tabular-nums] ${
                c.isVoordeliger ? "text-emerald-900" : "text-ink"
              }`}
            >
              {euro(price)}
            </p>
            {c.isVoordeliger && (
              <p className="mt-0.5 text-[13px] font-medium text-emerald-700 [font-variant-numeric:tabular-nums]">
                {t("tariefVoordeel", { bedrag: euro(c.voordeelInEuro), percentage: c.voordeelPercentage })}
              </p>
            )}
          </div>

          <button
            type="button"
            aria-expanded={open}
            aria-controls={contentId}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-medium text-ink transition-colors hover:text-accent"
          >
            {t("prijsopbouwKnop")}
            <Icon
              name="chevron-down"
              size={16}
              className={`shrink-0 transition-transform duration-200 motion-reduce:transition-none ${
                open ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>

        <div
          id={contentId}
          role="region"
          aria-hidden={!open}
          className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            <dl className="space-y-1.5 border-t border-line/70 pt-3 mt-3 text-[13px]">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-secondary">{t("prijsopbouwStart")}</dt>
                <dd className="text-right font-medium text-ink [font-variant-numeric:tabular-nums]">
                  {euro(c.startcomponent)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-secondary">{t("prijsopbouwAfstand", { km })}</dt>
                <dd className="text-right font-medium text-ink [font-variant-numeric:tabular-nums]">
                  {euro(c.afstandscomponent)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-secondary">{t("prijsopbouwTijd", { min })}</dt>
                <dd className="text-right font-medium text-ink [font-variant-numeric:tabular-nums]">
                  {euro(c.tijdscomponent)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-line/70 pt-1.5">
                <dt className="text-secondary">{t("prijsopbouwSubtotaal", { btw: tariff.btwPercentage })}</dt>
                <dd className="text-right font-medium text-ink [font-variant-numeric:tabular-nums]">
                  {euro(c.bedragExclusiefBtw)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-secondary">{t("prijsopbouwBtw", { btw: tariff.btwPercentage })}</dt>
                <dd className="text-right font-medium text-ink [font-variant-numeric:tabular-nums]">
                  {euro(c.btwBedrag)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-line/70 pt-1.5">
                <dt className="font-semibold text-ink">{t("prijsopbouwTotaal")}</dt>
                <dd className="text-right font-semibold text-ink [font-variant-numeric:tabular-nums]">
                  {euro(price)}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-[11px] text-secondary">{t("prijsopbouwToelichting")}</p>
          </div>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-secondary">
        {t("tariefToelichting", { prijs: euro(price) })}
      </p>
    </div>
  );
}
