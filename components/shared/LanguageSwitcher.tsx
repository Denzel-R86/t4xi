"use client";

import { Suspense } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

/**
 * NL/EN-taalwisselaar (stap 3). Blijft op dezelfde inhoudelijke pagina en
 * neemt ALLE queryparameters mee: /boeken?pickup=…&dropoff=… wordt
 * /en/boeken?pickup=…&dropoff=… en terug. De URL is de enige taalbron; er is
 * bewust geen localecookie en geen automatische browsertaaldetectie.
 */
type Props = {
  className?: string;
  /** Bv. het mobiele menu sluiten na een taalwissel. */
  onSwitched?: () => void;
};

/**
 * useSearchParams vereist een Suspense-grens bij statische prerendering; de
 * wrapper hieronder levert die, zodat elke pagina statisch kan blijven.
 */
export default function LanguageSwitcher(props: Props) {
  return (
    <Suspense fallback={null}>
      <LanguageSwitcherInner {...props} />
    </Suspense>
  );
}

function LanguageSwitcherInner({ className = "", onSwitched }: Props) {
  const t = useTranslations("taal");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  function switchTo(next: Locale) {
    if (next === locale) return;
    const search = searchParams.toString();
    router.replace(`${pathname}${search ? `?${search}` : ""}`, { locale: next });
    onSwitched?.();
  }

  return (
    <div
      role="group"
      aria-label={t("wissel")}
      className={`flex items-center overflow-hidden rounded-md border border-line text-xs font-medium ${className}`}
    >
      {routing.locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => switchTo(l)}
          aria-label={t(l)}
          aria-current={l === locale ? "true" : undefined}
          className={`min-h-8 px-2.5 uppercase tracking-wide transition-colors ${
            l === locale
              ? "bg-accent text-white"
              : "bg-transparent text-secondary hover:bg-ink/5 hover:text-ink"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
