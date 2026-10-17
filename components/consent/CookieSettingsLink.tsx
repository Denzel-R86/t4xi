"use client";

import { useTranslations } from "next-intl";
import { useConsent, consentFeatureEnabled } from "@/components/consent/ConsentContext";

/** Heropent de consent-banner in het voorkeurenpaneel. Toont zich niet als er geen optionele tracker actief is. */
export default function CookieSettingsLink({ className }: { className?: string }) {
  const t = useTranslations("consent");
  const { reopen, openPanel } = useConsent();

  if (!consentFeatureEnabled) return null;

  return (
    <button
      type="button"
      onClick={() => {
        reopen();
        openPanel();
      }}
      className={className}
    >
      {t("instellingenLink")}
    </button>
  );
}
