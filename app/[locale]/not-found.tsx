import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { notFoundMetadata } from "@/lib/seo-locale";

export const metadata: Metadata = notFoundMetadata();

const POPULAR_ROUTES = [
  { key: "amsterdam", pickup: "Amsterdam Centrum" },
  { key: "rotterdam", pickup: "Rotterdam" },
  { key: "almere", pickup: "Almere Poort" },
] as const;

function bookingHref(pickup: string): string {
  return `/boeken?pickup=${encodeURIComponent(pickup)}&dropoff=${encodeURIComponent("Schiphol Airport")}`;
}

export default function NotFound() {
  const t = useTranslations("nietGevonden");
  return (
    <section className="mx-auto max-w-site px-6 py-20 text-center md:py-24">
      <div className="mx-auto max-w-2xl">
        <p className="text-eyebrow font-medium uppercase text-accent">404</p>
        <h1 className="mt-3 font-display text-display-lg font-semibold text-ink">
          {t("kop")}
        </h1>
        <p className="mx-auto mt-4 max-w-md text-secondary">
          {t("tekst")}
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/tarieven"
            className="inline-flex min-h-[52px] items-center justify-center rounded-md bg-accent px-7 text-sm font-medium text-white shadow-cta transition-colors hover:bg-accent-hover"
          >
            {t("prijsBerekenen")}
          </Link>
          <Link
            href="/boeken"
            className="inline-flex min-h-[52px] items-center justify-center rounded-md border border-line-strong bg-white/70 px-7 text-sm font-medium text-ink transition-colors hover:bg-white"
          >
            {t("ritBoeken")}
          </Link>
        </div>
      </div>

      <div className="mx-auto mt-14 max-w-3xl border-t border-line pt-10">
        <h2 className="font-display text-xl font-semibold text-ink">
          {t("populaireKop")}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-secondary">
          {t("populaireTekst")}
        </p>
        <ul className="mt-6 grid gap-3 text-left sm:grid-cols-3">
          {POPULAR_ROUTES.map((route) => (
            <li key={route.key}>
              <Link
                href={bookingHref(route.pickup)}
                className="group flex min-h-[88px] h-full flex-col justify-between rounded-card border border-line bg-card px-5 py-4 transition-colors hover:border-line-strong hover:bg-white"
              >
                <span className="font-display text-[15px] font-semibold text-ink">
                  {t(`routes.${route.key}`)}
                </span>
                <span className="mt-3 flex items-center justify-between text-xs font-medium text-secondary">
                  {t("routeBekijken")}
                  <span aria-hidden="true" className="text-ink transition-transform group-hover:translate-x-0.5">→</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href="/"
          className="mt-7 inline-flex min-h-11 items-center text-sm font-medium text-secondary underline-offset-4 hover:text-ink hover:underline"
        >
          {t("naarHome")}
        </Link>
      </div>
    </section>
  );
}
