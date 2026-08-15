"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Icon from "@/components/ui/Icon";
import { useConsent, consentFeatureEnabled } from "@/components/consent/ConsentContext";

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? "bg-accent" : "bg-subtle"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export default function ConsentBanner() {
  const t = useTranslations("consent");
  const { ready, hasChoice, statistics, marketing, panelOpen, openPanel, closePanel, acceptAll, rejectOptional, savePreferences } =
    useConsent();
  const [draftStatistics, setDraftStatistics] = useState(statistics);
  const [draftMarketing, setDraftMarketing] = useState(marketing);

  // Her-synchroniseren bij elke keer dat het paneel opent — niet alleen via de
  // eigen "Voorkeuren aanpassen"-knop, maar ook via context.openPanel() van
  // buitenaf (CookieSettingsLink in de footer). Zonder dit tonen de toggles een
  // verouderde stand als eerder al statistieken/marketing waren toegestaan.
  useEffect(() => {
    if (!panelOpen) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setDraftStatistics(statistics);
      setDraftMarketing(marketing);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen]);

  if (!consentFeatureEnabled || !ready || hasChoice) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-[92px] z-50 mx-auto w-[calc(100%-1.5rem)] max-w-xl rounded-card border border-line bg-card p-5 shadow-card-lg lg:bottom-6 lg:left-6 lg:right-auto lg:w-full"
      role="dialog"
      aria-modal="false"
      aria-label={t("titel")}
    >
      <div className="flex items-start gap-3">
        <Icon name="shield-check" size={20} className="mt-0.5 shrink-0 text-accent" />
        <div className="min-w-0">
          <p className="font-display text-sm font-bold text-ink">{t("titel")}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-secondary">{t("tekst")}</p>
          <Link href="/privacy" className="mt-1.5 inline-block text-sm underline text-ink">
            {t("meerInfo")}
          </Link>
        </div>
      </div>

      {panelOpen ? (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-ink">{t("noodzakelijkKop")}</p>
              <p className="text-xs text-secondary">{t("noodzakelijkTekst")}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-stone">{t("altijdAan")}</span>
              <Toggle checked disabled label={t("noodzakelijkKop")} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-ink">{t("statistiekenKop")}</p>
              <p className="text-xs text-secondary">{t("statistiekenTekst")}</p>
            </div>
            <Toggle checked={draftStatistics} onChange={setDraftStatistics} label={t("statistiekenKop")} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-ink">{t("marketingKop")}</p>
              <p className="text-xs text-secondary">{t("marketingTekst")}</p>
            </div>
            <Toggle checked={draftMarketing} onChange={setDraftMarketing} label={t("marketingKop")} />
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => savePreferences({ statistics: draftStatistics, marketing: draftMarketing })}
              className="rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white"
            >
              {t("opslaan")}
            </button>
            <button
              type="button"
              onClick={closePanel}
              className="rounded-md border border-line-strong px-4 py-2.5 text-sm font-medium text-ink"
            >
              {t("sluiten")}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {/* Weigeren en accepteren zijn bewust IDENTIEK gestyled — zelfde vulling,
              grootte, gewicht en contrast — en verschillen alleen in labeltekst.
              Eén gevuld tegenover één omlijnd zou nog altijd sturend zijn: een
              volle knop trekt meer aandacht dan een randje, ook bij gelijke
              afmeting. Geen van beide keuzes krijgt zo een visueel voordeel. */}
          <button
            type="button"
            onClick={acceptAll}
            className="rounded-md bg-accent px-5 py-3 text-sm font-semibold text-white"
          >
            {t("allesAccepteren")}
          </button>
          <button
            type="button"
            onClick={rejectOptional}
            className="rounded-md bg-accent px-5 py-3 text-sm font-semibold text-white"
          >
            {t("alleenNoodzakelijk")}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraftStatistics(statistics);
              setDraftMarketing(marketing);
              openPanel();
            }}
            className="px-4 py-3 text-sm font-medium text-ink underline"
          >
            {t("voorkeuren")}
          </button>
        </div>
      )}
    </div>
  );
}
