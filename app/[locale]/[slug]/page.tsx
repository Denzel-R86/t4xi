import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import schipholAvond from "@/public/schiphol-avond.jpg";
import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";
import FaqList from "@/components/sections/FaqList";
import RateTable from "@/components/seo/RateTable";
import { getAirportLandingCopy } from "@/lib/airport-landing-copy";
import { getAirportLandingLocale, getLocalizedStad } from "@/lib/seo-steden";
import { localeMetadata, localeUrl, notFoundMetadata, SITE_URL } from "@/lib/seo-locale";
import { loadRateCard } from "@/lib/pricing/rate-card";

/**
 * Tweetalige SEO-landingspagina's voor taxi-<stad>-schiphol.
 *
 * PRIJZEN KOMEN UIT DE ENGINE, NOOIT UIT DE CONTENT. De pagina leest
 * `loadRateCard()` — dezelfde live bron als /tarieven en /api/pricing/quote.
 * Daarom is de route bewust dynamisch: een tariefwijziging mag niet op een oude
 * build blijven hangen.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale: localeInput, slug } = await params;
  const locale = getAirportLandingLocale(localeInput);
  const stad = getLocalizedStad(slug, locale);
  if (!stad) return notFoundMetadata();

  return localeMetadata({
    locale,
    path: `/${stad.slug}`,
    title: stad.metaTitle,
    description: stad.metaDescription,
  });
}

export default async function SeoLandingPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: localeInput, slug } = await params;
  const locale = getAirportLandingLocale(localeInput);
  const stad = getLocalizedStad(slug, locale);
  if (!stad) notFound();

  const copy = getAirportLandingCopy(locale);
  const bookingHref = `/boeken?pickup=${encodeURIComponent(
    stad.bookingPickupName,
  )}&dropoff=${encodeURIComponent("Schiphol Airport")}`;

  // Live tarieven voor deze stad. Levert de engine niets, dan tonen we geen
  // bedrag — liever geen prijs dan een verkeerde.
  const rateCard = await loadRateCard();
  const cityRates = rateCard.find((city) => city.citySlug === stad.citySlug) ?? null;
  const schipholRates = cityRates?.toSchiphol ?? [];
  const canonical = localeUrl(locale, `/${stad.slug}`);
  const bookingUrl = localeUrl(locale, bookingHref);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: copy.breadcrumbHome,
        item: localeUrl(locale, "/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: stad.metaTitle,
        item: canonical,
      },
    ],
  };

  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${canonical}#service`,
    name: copy.serviceType(stad.naam),
    serviceType: copy.serviceType(stad.naam),
    description: stad.metaDescription,
    url: canonical,
    provider: {
      "@type": "Organization",
      name: "T4XI",
      url: SITE_URL,
      telephone: "+31634744522",
    },
    areaServed: { "@type": "City", name: stad.naam },
    availableChannel: {
      "@type": "ServiceChannel",
      serviceUrl: bookingUrl,
      servicePhone: {
        "@type": "ContactPoint",
        telephone: "+31634744522",
      },
    },
    ...(schipholRates.length > 0
      ? {
          offers: schipholRates.map((rate) => ({
            "@type": "Offer",
            name: `${stad.rateLabelTranslations[rate.from] ?? rate.from} → Schiphol`,
            price: rate.single,
            priceCurrency: "EUR",
            // Link naar exact het vertrekpunt waarvan deze prijs afkomstig is.
            // Een generieke stads-URL kan een ander tarief opleveren.
            url: localeUrl(
              locale,
              `/boeken?pickup=${encodeURIComponent(rate.from)}&dropoff=${encodeURIComponent("Schiphol Airport")}`,
            ),
          })),
        }
      : {}),
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: stad.faq.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd).replace(/</g, "\\u003c") }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd).replace(/</g, "\\u003c") }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c") }}
      />

      <section className="relative overflow-hidden border-b border-line" aria-labelledby="page-h1">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(135deg,#F5F3F1_0%,#FFFFFF_54%,#E8E4DE_100%)]"
        />
        <div className="relative mx-auto grid max-w-site items-start gap-12 px-6 pb-14 pt-16 lg:grid-cols-2 lg:pb-20 lg:pt-24">
          <div>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-px w-4 bg-accent" />
              {copy.heroEyebrow}
            </p>
            <h1 id="page-h1" className="mt-5 font-display text-display-xl font-bold text-ink">
              Taxi {stad.naam}
              <br />
              <span className="italic text-secondary">{copy.heroDestination}</span>
            </h1>
            <p className="mt-6 max-w-[480px] text-secondary">{stad.intro}</p>
            <ul className="mt-7 flex flex-col gap-2.5">
              {copy.heroBullets.map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm text-ink">
                  <Icon name="check" size={16} className="shrink-0 text-accent" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              {/* De next-intl Link behoudt de huidige locale: op EN wordt dit
                  /en/boeken met dezelfde adresparameters. */}
              <Link
                href={bookingHref}
                className="inline-flex min-h-[52px] items-center gap-2 rounded-md bg-accent px-8 font-display text-base font-medium text-white shadow-cta transition-colors hover:bg-accent-hover"
              >
                <Icon name="calendar-check" size={18} />
                {copy.bookNow}
              </Link>
              <a
                href="tel:+31634744522"
                className="inline-flex min-h-[52px] items-center gap-2 rounded-md border border-line-strong bg-white/60 px-8 font-display text-base font-medium text-ink transition-colors hover:bg-white"
              >
                <Icon name="phone" size={18} />
                {copy.callUs}
              </a>
            </div>
            <p className="mt-6 text-xs text-secondary">
              {copy.departurePoints}: {stad.vertrekpunten.join(", ")}
            </p>
          </div>

          <RateTable
            stad={stad}
            rates={schipholRates}
            bookingHref={bookingHref}
            locale={locale}
          />
        </div>
      </section>

      <div className="border-b border-line bg-card">
        <div className="mx-auto grid max-w-site gap-6 px-6 py-10 sm:grid-cols-2 lg:grid-cols-4">
          {copy.usps.map((usp) => (
            <div key={usp.title}>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-accent/5 text-accent">
                <Icon name={usp.icon} size={20} />
              </span>
              <h2 className="mt-3 font-display text-base font-semibold text-ink">{usp.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-secondary">{usp.text}</p>
            </div>
          ))}
        </div>
      </div>

      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-site px-6">
          <ScrollReveal>
            <div className="max-w-[720px]">
              <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
                <span aria-hidden="true" className="h-px w-4 bg-accent" />
                {copy.why(stad.naam)}
              </p>
              <h2 className="mt-4 font-display text-display-lg font-bold text-ink">
                {copy.contentHeading}
                <br />
                <span className="italic text-secondary">{copy.contentHeadingAccent}</span>
              </h2>
              {copy.contentParagraphs(stad.naam).map((paragraph, index) => (
                <p key={paragraph} className={index === 0 ? "mt-5 text-secondary" : "mt-4 text-secondary"}>
                  {paragraph}
                </p>
              ))}

              <h3 className="mt-10 font-display text-xl font-bold text-ink">
                {copy.localHeading(stad.naam)}
              </h3>
              <p className="mt-3 text-secondary">{copy.localIntro}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {stad.vertrekpunten.map((vertrekpunt) => (
                  <span
                    key={vertrekpunt}
                    className="rounded-full border border-line bg-card px-3.5 py-1.5 text-xs text-secondary"
                  >
                    {vertrekpunt}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-[13px] text-secondary">{copy.unlisted}</p>
              <p className="mt-6 text-secondary">
                {copy.exactFareLead}{" "}
                <Link
                  href="/tarieven"
                  className="font-medium text-ink underline underline-offset-4 hover:opacity-80"
                >
                  {copy.exactFareLink}
                </Link>{" "}
                {copy.exactFareTail}
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <section className="border-t border-line bg-card/60 py-16 md:py-24">
        <div className="mx-auto max-w-site px-6">
          <ScrollReveal>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-px w-4 bg-accent" />
              {copy.faqEyebrow}
            </p>
            <h2 className="mb-12 mt-4 font-display text-display-lg font-bold text-ink">
              {copy.faqTitle(stad.naam)}
            </h2>
          </ScrollReveal>
          <FaqList items={stad.faq} />
        </div>
      </section>

      <div className="relative overflow-hidden border-t border-line bg-ink py-16 text-center md:py-20">
        <Image
          src={schipholAvond}
          alt=""
          fill
          placeholder="blur"
          sizes="100vw"
          className="object-cover object-center opacity-40"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-ink via-ink/85 to-ink/70" />
        <div className="relative mx-auto max-w-site px-6">
          <p className="text-eyebrow font-medium uppercase text-stone">{copy.ctaEyebrow}</p>
          <h2 className="mt-4 font-display text-display-lg font-bold text-fog">
            {copy.ctaTitle(stad.naam)}
          </h2>
          <p className="mx-auto mt-4 max-w-[520px] text-stone-subtle">{copy.ctaText}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href={bookingHref}
              className="inline-flex min-h-[52px] items-center gap-2 rounded-md bg-fog px-8 font-display text-base font-medium text-ink transition-transform hover:-translate-y-0.5"
            >
              <Icon name="calendar-check" size={18} />
              {copy.calculateFare}
            </Link>
            <a
              href={`https://wa.me/31634744522?text=${encodeURIComponent(
                copy.whatsappMessage(stad.naam),
              )}`}
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-[52px] items-center gap-2 rounded-md border border-white/20 px-8 font-display text-base font-medium text-fog transition-colors hover:bg-white/10"
            >
              <Icon name="whatsapp" size={18} />
              WhatsApp
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
