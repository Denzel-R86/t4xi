"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("fout");
  useEffect(() => {
    // Alleen digest loggen — geen stack traces of gebruikersdata naar console in productie
    console.error("Onverwachte fout", error.digest ?? "");
  }, [error]);

  return (
    <section className="mx-auto max-w-site px-6 py-24 text-center">
      <p className="text-eyebrow font-medium uppercase text-accent">{t("label")}</p>
      <h1 className="mt-3 font-display text-display-lg font-semibold text-ink">
        {t("kop")}
      </h1>
      <p className="mx-auto mt-4 max-w-md text-secondary">
        {t("tekst")}
      </p>
      <div className="mt-8 flex justify-center gap-4">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-accent px-7 py-3.5 text-sm font-medium text-white shadow-cta transition-colors hover:bg-accent-hover"
        >
          {t("opnieuw")}
        </button>
        <a
          href="tel:+31634744522"
          className="rounded-full border border-line bg-card px-7 py-3.5 text-sm font-medium text-ink hover:border-stone"
        >
          {t("bel")}
        </a>
      </div>
    </section>
  );
}
