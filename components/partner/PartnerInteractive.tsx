"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Icon from "@/components/ui/Icon";

const inputCls =
  "min-h-[52px] w-full rounded-field border border-[rgba(31,39,48,0.14)] bg-field px-4 text-[15px] font-medium text-ink placeholder:font-normal placeholder:text-stone focus:border-accent focus:bg-white focus:shadow-[0_0_0_4px_rgba(40,49,59,0.10)] focus:outline-none";
const labelCls = "mb-1.5 block text-xs font-bold text-secondary";

/** Commissie + maandbedrag per pakket — taalneutraal (label komt uit i18n). */
const PAKKETTEN = [
  { value: 0.2, fixed: 0 },
  { value: 0.12, fixed: 99 },
  { value: 0.08, fixed: 199 },
  { value: 0.05, fixed: 299 },
];

/** Verdiencalculator uit partner.html (#calculator). */
export function EarningsCalculator() {
  const t = useTranslations("partner");
  const locale = useLocale();
  const euro = (n: number) => "€" + Math.round(n).toLocaleString(locale === "nl" ? "nl-NL" : "en-GB");

  const [ritten, setRitten] = useState(75);
  const [prijs, setPrijs] = useState(79);
  const [pakket, setPakket] = useState(1);

  const pakLabels = t.raw("pakLabels") as string[];
  const resLabels = t.raw("calcRes") as string[];

  const p = PAKKETTEN[pakket];
  const omzet = ritten * prijs;
  const netto = omzet * (1 - p.value) - p.fixed;
  const uber = omzet * 0.65;
  const verschil = netto - uber;

  return (
    <div className="rounded-card border border-line bg-card p-6 shadow-card md:p-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="c-ritten" className={labelCls}>{t("calcLabelRitten")}</label>
          <input
            id="c-ritten" type="number" min={1} max={300} value={ritten}
            onChange={(e) => setRitten(Number(e.target.value) || 0)}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="c-prijs" className={labelCls}>{t("calcLabelPrijs")}</label>
          <input
            id="c-prijs" type="number" min={10} max={500} value={prijs}
            onChange={(e) => setPrijs(Number(e.target.value) || 0)}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="c-pakket" className={labelCls}>{t("calcLabelPakket")}</label>
          <select
            id="c-pakket" value={pakket}
            onChange={(e) => setPakket(Number(e.target.value))}
            className={inputCls}
          >
            {pakLabels.map((label, i) => (
              <option key={label} value={i}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-live="polite">
        {[
          { val: euro(omzet), label: resLabels[0] },
          { val: euro(netto), label: resLabels[1], highlight: true },
          { val: euro(uber), label: resLabels[2] },
          { val: `+${euro(verschil)}`, label: resLabels[3], green: true },
        ].map((r) => (
          <div
            key={r.label}
            className={`rounded-xl border p-4 text-center ${r.highlight ? "border-accent bg-accent/5" : "border-line bg-fog"}`}
          >
            <div className={`font-display text-2xl font-bold ${r.green ? "text-green-600" : "text-ink"}`}>
              {r.val}
            </div>
            <div className="mt-1 text-[11px] text-secondary">{r.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-secondary">
        {t("calcFoot")}
      </p>
    </div>
  );
}

/** Aanmeldformulier uit partner.html (#aanmelden). */
export function PartnerSignupForm() {
  const t = useTranslations("partner");
  const [sent, setSent] = useState(false);

  const vergOpts = t.raw("fVergOpts") as string[];
  const regioOpts = t.raw("fRegioOpts") as string[];
  const rittenOpts = t.raw("fRittenOpts") as string[];
  const pakketOpts = t.raw("fPakketOpts") as string[];

  return (
    <form
      className="relative overflow-hidden rounded-[28px] border border-line bg-card p-6 shadow-hero-card md:p-7"
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-accent via-stone to-stone-subtle" />
      {sent && (
        <p className="mb-5 flex items-center gap-2 rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-3.5 text-sm text-green-700">
          <Icon name="check" size={16} />
          {t("formSent")}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="p-naam" className={labelCls}>{t("fNaam")}</label>
          <input id="p-naam" placeholder={t("fNaamPl")} autoComplete="name" required className={inputCls} />
        </div>
        <div>
          <label htmlFor="p-tel" className={labelCls}>{t("fTel")}</label>
          <input id="p-tel" type="tel" placeholder="+31 6 ..." autoComplete="tel" required className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="p-email" className={labelCls}>{t("fEmail")}</label>
          <input id="p-email" type="email" placeholder={t("fEmailPl")} autoComplete="email" className={inputCls} />
        </div>
        <div>
          <label htmlFor="p-auto" className={labelCls}>{t("fAuto")}</label>
          <input id="p-auto" placeholder={t("fAutoPl")} className={inputCls} />
        </div>
        <div>
          <label htmlFor="p-verg" className={labelCls}>{t("fVerg")}</label>
          <select id="p-verg" defaultValue="" className={inputCls}>
            <option value="" disabled>{vergOpts[0]}</option>
            {vergOpts.slice(1).map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="p-regio" className={labelCls}>{t("fRegio")}</label>
          <select id="p-regio" defaultValue="" className={inputCls}>
            <option value="" disabled>{regioOpts[0]}</option>
            {regioOpts.slice(1).map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="p-ritten" className={labelCls}>{t("fRittenWk")}</label>
          <select id="p-ritten" className={inputCls}>
            {rittenOpts.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="p-pakket" className={labelCls}>{t("fPakket")}</label>
          <select id="p-pakket" required defaultValue="" className={inputCls}>
            <option value="" disabled>{pakketOpts[0]}</option>
            {pakketOpts.slice(1).map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
      </div>
      <button
        type="submit"
        className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-md bg-accent px-8 font-display text-base font-medium text-white shadow-cta transition-all hover:-translate-y-0.5 hover:bg-accent-hover"
      >
        <Icon name="send" size={17} />
        {t("fSubmit")}
      </button>
      <p className="mt-3 text-center text-xs text-secondary">
        {t("fBel")}{" "}
        <a href="tel:+31634744522" className="text-accent hover:underline">+31 6 34 74 45 22</a>
      </p>
    </form>
  );
}
