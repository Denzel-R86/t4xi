import { pageMetadata, localeUrl } from "@/lib/seo-locale";
import { Link } from "@/i18n/navigation";
import "@/components/horizon/horizon.css";
import { loadRateCard, type CityRates, type RateEntry } from "@/lib/pricing/rate-card";
import { getTranslations, setRequestLocale } from "next-intl/server";
import RouteFinder from "@/components/tarieven/RouteFinder";
import FairFarePromise from "@/components/tarieven/FairFarePromise";
import Icon from "@/components/ui/Icon";
import { STEDEN } from "@/lib/seo-steden";

/**
 * Tarievenpagina — premium, begeleide routezoeker binnen de Horizon Design
 * Language. De vroegere lange prijscatalogus is vervangen door de
 * conversiegerichte routezoeker (RouteFinder); de vaste routeprijzen blijven
 * zichtbaar via de Schiphol-routekaarten (vanafprijs uit dezelfde bron).
 *
 * ÉÉN PRIJSBRON. De routezoeker, de Schiphol-vanafprijzen, de homepage-quote en
 * /boeken lezen allemaal dezelfde bron (fixed_route_prices via de Pricing
 * Engine). Er is geen tweede berekening. Bewust dynamisch (force-dynamic), niet
 * ISR, zodat tarief en boekingsprijs nooit uiteenlopen.
 */
export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { locale: string } }) {
  return pageMetadata(params.locale, "/tarieven", "tarievenTitle", "tarievenDesc");
}

/** Laagste enkele-reisprijs naar Schiphol + bijbehorende afstand, of null. */
function cheapestToSchiphol(city: CityRates | undefined): RateEntry | null {
  if (!city || city.toSchiphol.length === 0) return null;
  return city.toSchiphol.reduce((min, e) => (e.single < min.single ? e : min));
}

const WHY_FEATURES = ["eig1", "eig2", "eig3", "eig4", "eig5", "eig6"] as const;
const FAQ_ITEMS = ["1", "2", "3"] as const;

export default async function TarievenPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const t = await getTranslations({ locale: params.locale, namespace: "routezoeker" });
  const cities = await loadRateCard();

  const schipholLinks = STEDEN.map((stad) => {
    const city = cities.find((c) => c.citySlug === stad.citySlug);
    const cheapest = cheapestToSchiphol(city);
    return { slug: stad.slug, naam: stad.naam, vanaf: cheapest?.single ?? null, km: cheapest?.distanceKm ?? null };
  });

  const canonical = localeUrl(params.locale === "en" ? "en" : "nl", "/tarieven");
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: localeUrl(params.locale === "en" ? "en" : "nl", "/") },
      { "@type": "ListItem", position: 2, name: t("breadcrumb"), item: canonical },
    ],
  };
  const serviceLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType: t("serviceType"),
    provider: { "@type": "Organization", name: "T4XI", url: "https://www.t4xi.nl" },
    areaServed: STEDEN.map((s) => ({ "@type": "City", name: s.naam })),
    url: canonical,
  };
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((n) => ({
      "@type": "Question",
      name: t(`faqV${n}`),
      acceptedAnswer: { "@type": "Answer", text: t(`faqA${n}`) },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />

      {/* ═══ HERO + ROUTEZOEKER ═══ */}
      <section className="border-b border-line bg-fog" aria-labelledby="page-h1">
        <div className="mx-auto max-w-site px-[5vw] py-16 md:py-24">
          <header className="max-w-3xl">
            <p className="flex items-center gap-3.5 text-[11px] font-medium uppercase tracking-[0.18em] text-secondary">
              <span aria-hidden="true" className="h-px w-8 bg-ink" />
              {t("heroEyebrow")}
            </p>
            <h1 className="mt-6 font-display text-[clamp(38px,6.2vw,84px)] font-extrabold leading-[0.98] tracking-[-0.03em] text-ink">
              {t("heroKop1")}
              <br />
              <span className="font-light italic text-stone">{t("heroKop2")}</span>
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-secondary">{t("heroIntro")}</p>
          </header>

          <div className="mt-10 max-w-3xl">
            <RouteFinder />
          </div>
        </div>
      </section>

      {/* ═══ FAIR FARE PROMISE ═══ */}
      <FairFarePromise />

      {/* ═══ WAAROM T4XI ═══ */}
      <section aria-labelledby="waarom-title" className="border-b border-line bg-card">
        <div className="mx-auto max-w-site px-[5vw] py-16 md:py-24">
          <h2 id="waarom-title" className="max-w-2xl font-display text-display-md font-bold text-ink">
            {t("waaromKop")}
          </h2>
          <ul className="mt-8 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {WHY_FEATURES.map((k) => (
              <li key={k} className="flex items-start gap-3 border-t border-line pt-4 text-ink">
                <Icon name="circle-check" size={18} className="mt-0.5 shrink-0 text-accent" />
                <span className="text-[15px]">{t(k)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ═══ SCHIPHOL-ROUTES (interne SEO, crawlbaar) ═══ */}
      <section aria-labelledby="schiphol-title" className="border-b border-line bg-fog">
        <div className="mx-auto max-w-site px-[5vw] py-16 md:py-24">
          <p className="flex items-center gap-3.5 text-[11px] font-medium uppercase tracking-[0.18em] text-secondary">
            <span aria-hidden="true" className="h-px w-8 bg-ink" />
            {t("schipholKicker")}
          </p>
          <h2 id="schiphol-title" className="mt-4 max-w-2xl font-display text-display-md font-bold text-ink">
            {t("schipholKop")}
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {schipholLinks.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/${r.slug}`}
                  className="group flex h-full flex-col justify-between rounded-card border border-line bg-card p-5 transition-colors hover:border-line-strong"
                >
                  <span className="font-display text-base font-semibold text-ink">
                    {t("schipholAnchor", { stad: r.naam })}
                  </span>
                  <span className="mt-3 flex items-center justify-between text-sm text-secondary [font-variant-numeric:tabular-nums]">
                    <span>
                      {r.vanaf !== null ? t("vanafPrijs", { prijs: r.vanaf }) : t("prijsOpAanvraag")}
                      {r.km !== null ? ` · ${r.km} km` : ""}
                    </span>
                    <span aria-hidden="true" className="text-ink transition-transform group-hover:translate-x-0.5">→</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ═══ FAQ (zichtbaar + FAQPage structured data) ═══ */}
      <section aria-labelledby="faq-title" className="border-b border-line bg-card">
        <div className="mx-auto max-w-site px-[5vw] py-16 md:py-24">
          <h2 id="faq-title" className="font-display text-display-md font-bold text-ink">{t("faqKop")}</h2>
          <div className="mt-6 max-w-2xl">
            {FAQ_ITEMS.map((n) => (
              <details key={n} className="group border-t border-line py-4 last:border-b">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                  {t(`faqV${n}`)}
                  <Icon name="chevron-down" size={18} className="shrink-0 text-stone transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                </summary>
                <p className="mt-3 text-secondary">{t(`faqA${n}`)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
