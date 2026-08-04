import { pageMetadata, localeUrl } from "@/lib/seo-locale";
import { Link } from "@/i18n/navigation";
import "@/components/horizon/horizon.css";
import { loadRateCard, type CityRates, type RateEntry } from "@/lib/pricing/rate-card";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import DestinationExplorer from "@/components/tarieven/DestinationExplorer";
import { destinationGroupFor } from "@/lib/destinations";
import RouteFinder from "@/components/tarieven/RouteFinder";
import FairFarePromise from "@/components/tarieven/FairFarePromise";
import Icon from "@/components/ui/Icon";
import { STEDEN } from "@/lib/seo-steden";

/**
 * Tarievenpagina — premium, begeleide routezoeker binnen de Horizon Design
 * Language. De vroegere lange prijscatalogus is niet verdwenen maar verplaatst
 * naar een inklapbaar overzicht onderaan; de standaardweergave is nu de
 * conversiegerichte routezoeker (RouteFinder).
 *
 * ÉÉN PRIJSBRON. De routezoeker, dit catalogus-overzicht, de homepage-quote en
 * /boeken lezen allemaal dezelfde bron (fixed_route_prices via de Pricing
 * Engine). Er is geen tweede berekening. Zie de uitgebreide caching-toelichting
 * hieronder: bewust dynamisch, niet ISR, zodat tarief en boekingsprijs nooit
 * uiteenlopen.
 */
export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { locale: string } }) {
  return pageMetadata(params.locale, "/tarieven", "tarievenTitle", "tarievenDesc");
}

const eur = (n: number) => `€ ${n}`;

/** Laagste enkele-reisprijs naar Schiphol + bijbehorende afstand, of null. */
function cheapestToSchiphol(city: CityRates | undefined): RateEntry | null {
  if (!city || city.toSchiphol.length === 0) return null;
  return city.toSchiphol.reduce((min, e) => (e.single < min.single ? e : min));
}

function RateRows({ entries }: { entries: RateEntry[] }) {
  const t = useTranslations("tarieven");
  return (
    <ul className="mt-3 list-none">
      {entries.map((e) => (
        <li
          key={`${e.from}-${e.to}`}
          className="grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1 border-t border-line py-4 first:border-t-0 sm:grid-cols-[1fr_auto_auto_auto]"
        >
          <span className="font-display text-[15px] font-medium text-ink sm:text-base">
            {e.from} <span className="text-stone">→</span> {e.to}
          </span>
          <span className="order-3 text-xs uppercase tracking-[0.1em] text-stone sm:order-none [font-variant-numeric:tabular-nums]">
            {e.distanceKm} {t("km")}
          </span>
          <span className="text-right font-display text-[15px] font-bold text-ink [font-variant-numeric:tabular-nums] sm:text-base">
            {eur(e.single)}
          </span>
          <span className="order-4 text-right text-sm text-secondary [font-variant-numeric:tabular-nums] sm:order-none">
            {e.retour !== null ? <>{t("retour")} {eur(e.retour)}</> : <>—</>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RouteGroup({ title, entries, cityName }: { title: string; entries: RateEntry[]; cityName: string }) {
  const t = useTranslations("tarieven");
  return (
    <div className="mt-9">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-secondary">{title}</h3>
      {entries.length > 0 ? (
        <RateRows entries={entries} />
      ) : (
        <p className="mt-3 border-t border-line pt-4 text-sm text-secondary">
          {t("andereBestemmingVraag", { stad: cityName })}{" "}
          <Link href="/boeken" className="hz-guide-line text-ink no-underline">
            {t("vraagVastePrijs")}
          </Link>
          .
        </p>
      )}
    </div>
  );
}

function CitySection({ city }: { city: CityRates }) {
  const t = useTranslations("tarieven");
  return (
    <section aria-labelledby={`stad-${city.citySlug}`} className="border-t border-ink/25 pt-12">
      <p className="flex items-center gap-3.5 text-[11px] font-medium uppercase tracking-[0.16em] text-secondary">
        <span aria-hidden="true" className="h-px w-8 bg-ink" />
        {t("vertrek")}
      </p>
      <h3
        id={`stad-${city.citySlug}`}
        className="mt-3 font-display text-[clamp(26px,3.6vw,44px)] font-extrabold leading-none tracking-[-0.02em] text-ink"
      >
        {t("vanuit", { stad: city.cityName })}
      </h3>
      <RouteGroup title={t("naarSchiphol")} entries={city.toSchiphol} cityName={city.cityName} />
      {city.otherAirports.length > 0 && (
        <RouteGroup title={t("overigeLuchthavens")} entries={city.otherAirports} cityName={city.cityName} />
      )}
      <RouteGroup title={t("intercity")} entries={city.intercity} cityName={city.cityName} />
      {(() => {
        const group = destinationGroupFor(city.citySlug);
        return group ? (
          <DestinationExplorer group={group} cityName={city.cityName} intercity={city.intercity} />
        ) : null;
      })()}
    </section>
  );
}

const WHY_FEATURES = ["eig1", "eig2", "eig3", "eig4", "eig5", "eig6"] as const;
const FAQ_ITEMS = ["1", "2", "3"] as const;

export default async function TarievenPage({ params }: { params: { locale: string } }) {
  const t = await getTranslations("routezoeker");
  const tt = await getTranslations("tarieven");
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
    provider: { "@type": "Organization", name: "T4XI", url: "https://t4xi.nl" },
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

      {/* ═══ VOLLEDIG TARIEVENOVERZICHT (ingeklapt, crawlbaar) ═══ */}
      <section aria-labelledby="catalogus-title" className="bg-fog">
        <div className="mx-auto max-w-site px-[5vw] py-16 md:py-24">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
              <Icon name="chevron-down" size={20} className="text-stone transition-transform group-open:rotate-180 motion-reduce:transition-none" />
              <h2 id="catalogus-title" className="font-display text-display-md font-bold text-ink">{t("catalogusKop")}</h2>
            </summary>
            <p className="mt-4 max-w-2xl text-secondary">{tt("intro")}</p>
            <div className="mt-12 space-y-16">
              {cities.length > 0 ? (
                cities.map((city) => <CitySection key={city.citySlug} city={city} />)
              ) : (
                <p className="border-t border-ink/25 pt-12 text-secondary">
                  {tt("nietBeschikbaar")}{" "}
                  <Link href="/boeken" className="hz-guide-line text-ink no-underline">{tt("vraagVastePrijs")}</Link>.
                </p>
              )}
            </div>
            <p className="mt-16 border-t border-line pt-6 text-[13px] leading-relaxed text-secondary">
              {tt("routeNietGevonden")}{" "}
              <Link href="/boeken" className="hz-guide-line text-ink no-underline">{tt("vraagVastePrijs")}</Link>{" "}
              {tt("ofBel")}{" "}
              <a href="tel:+31634744522" className="hz-guide-line text-ink no-underline">+31 6 34 74 45 22</a>
              {tt("adviesbagage")}
            </p>
          </details>
        </div>
      </section>
    </>
  );
}
