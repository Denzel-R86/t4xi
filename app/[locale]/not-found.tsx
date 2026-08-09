import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { notFoundMetadata } from "@/lib/seo-locale";

export const metadata: Metadata = notFoundMetadata();

export default function NotFound() {
  const t = useTranslations("nietGevonden");
  return (
    <section className="mx-auto max-w-site px-6 py-24 text-center">
      <p className="text-eyebrow font-medium uppercase text-accent">404</p>
      <h1 className="mt-3 font-display text-display-lg font-semibold text-ink">
        {t("kop")}
      </h1>
      <p className="mx-auto mt-4 max-w-md text-secondary">
        {t("tekst")}
      </p>
      <div className="mt-8">
        <Link
          href="/"
          className="inline-flex rounded-md bg-accent px-7 py-3.5 text-sm font-medium text-white shadow-cta transition-colors hover:bg-accent-hover"
        >
          {t("naarHome")}
        </Link>
      </div>
    </section>
  );
}
