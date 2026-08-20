import Image from "next/image";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { localeUrl, pageMetadata, SITE_URL } from "@/lib/seo-locale";
import passengerImage from "@/public/t4xi-campagne-01-passagier-v2.png";
import airportImage from "@/public/t4xi-campagne-02-bagageoverdracht-v4.png";

const CONTACT_HREF = "/contact?audience=business&topic=businessTransport#contact-form";
const BENEFIT_ICONS = ["file-invoice", "user-check", "chart-bar", "briefcase"] as const;

type Benefit = { title: string; text: string };
type UseCase = { title: string; text: string };
type ProcessStep = { title: string; text: string };
type Faq = { question: string; answer: string };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(
    locale,
    "/zakelijk-vervoer",
    "businessTitle",
    "businessDesc"
  );
}

export default async function BusinessTransportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  const locale = hasLocale(routing.locales, localeParam)
    ? localeParam
    : routing.defaultLocale;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "businessPage" });
  const benefits = t.raw("benefits.items") as Benefit[];
  const useCases = t.raw("useCases.items") as UseCase[];
  const process = t.raw("process.items") as ProcessStep[];
  const faqs = t.raw("faq.items") as Faq[];
  const pageUrl = localeUrl(locale, "/zakelijk-vervoer");
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: t("structuredData.pageName"),
        description: t("structuredData.description"),
        inLanguage: locale === "nl" ? "nl-NL" : "en",
        mainEntity: { "@id": `${pageUrl}#service` },
        breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
      },
      {
        "@type": "Service",
        "@id": `${pageUrl}#service`,
        name: t("structuredData.serviceName"),
        serviceType: t("structuredData.serviceType"),
        description: t("structuredData.description"),
        url: pageUrl,
        audience: { "@type": "BusinessAudience" },
        areaServed: (t.raw("structuredData.areas") as string[]).map((name) => ({
          "@type": "City",
          name,
        })),
        provider: {
          "@type": "TaxiService",
          name: "T4XI",
          url: SITE_URL,
          telephone: "+31634744522",
        },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: t("structuredData.home"),
            item: localeUrl(locale, "/"),
          },
          {
            "@type": "ListItem",
            position: 2,
            name: t("structuredData.pageName"),
            item: pageUrl,
          },
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${pageUrl}#faq`,
        mainEntity: faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />

      <section className="relative overflow-hidden border-b border-line" aria-labelledby="business-hero-title">
        <div className="grid min-h-[calc(100svh-68px)] lg:grid-cols-[54%_46%]">
          <div className="relative flex items-center bg-fog px-6 py-16 sm:px-[7vw] lg:py-24 lg:pr-[5vw]">
            <div aria-hidden="true" className="absolute inset-y-0 right-0 hidden w-px bg-line lg:block" />
            <div className="relative max-w-3xl">
              <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
                <span aria-hidden="true" className="h-px w-5 bg-accent" />
                {t("hero.kicker")}
              </p>
              <h1
                id="business-hero-title"
                className="mt-6 font-display text-[clamp(2.8rem,6.6vw,6.6rem)] font-extrabold leading-[0.93] tracking-[-0.045em] text-ink"
              >
                {t("hero.title")}
                <span className="mt-2 block font-light italic text-stone-text">{t("hero.accent")}</span>
              </h1>
              <p className="mt-7 max-w-2xl text-base leading-8 text-secondary md:text-lg">
                {t("hero.intro")}
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link
                  href={CONTACT_HREF}
                  className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-md bg-accent px-7 font-display text-base font-medium text-white shadow-cta transition-all hover:-translate-y-0.5 hover:bg-accent-hover"
                >
                  {t("hero.primaryCta")}
                  <Icon name="arrow-right" size={17} />
                </Link>
                <Link
                  href="/diensten"
                  className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-md border border-line-strong bg-white/60 px-7 font-display text-base font-medium text-ink transition-colors hover:bg-white"
                >
                  {t("hero.secondaryCta")}
                </Link>
              </div>
              <ul className="mt-10 grid gap-3 border-t border-line pt-6 sm:grid-cols-3">
                {(t.raw("hero.proof") as string[]).map((proof) => (
                  <li key={proof} className="flex items-start gap-2 text-xs font-medium leading-5 text-secondary">
                    <Icon name="check" size={14} className="mt-0.5 shrink-0 text-accent" />
                    {proof}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <figure className="relative min-h-[380px] overflow-hidden bg-ink lg:min-h-full">
            <Image
              src={passengerImage}
              alt={t("hero.imageAlt")}
              fill
              priority
              placeholder="blur"
              sizes="(min-width: 1024px) 46vw, 100vw"
              className="object-cover object-[63%_center] saturate-[0.88] contrast-[0.98]"
            />
            <figcaption className="absolute bottom-6 left-6 right-6 border-l border-white/45 bg-ink/75 px-5 py-4 text-[10px] font-medium uppercase tracking-[0.18em] text-white/80 backdrop-blur-md md:bottom-8 md:left-8 md:right-auto md:max-w-xs">
              {t("hero.imageCaption")}
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="bg-ink py-16 text-white md:py-24" aria-labelledby="business-use-cases-title">
        <div className="mx-auto max-w-site px-6">
          <ScrollReveal>
            <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
              <div>
                <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-white/55">
                  <span aria-hidden="true" className="h-px w-5 bg-white/45" />
                  {t("useCases.kicker")}
                </p>
                <h2 id="business-use-cases-title" className="mt-5 font-display text-display-lg font-bold text-white">
                  {t("useCases.title")}
                  <span className="block font-light italic text-white/55">{t("useCases.accent")}</span>
                </h2>
              </div>
              <p className="max-w-2xl text-sm leading-7 text-white/60 lg:justify-self-end">
                {t("useCases.intro")}
              </p>
            </div>
          </ScrollReveal>
          <div className="mt-12 grid gap-px bg-white/15 md:grid-cols-2 lg:grid-cols-4">
            {useCases.map((useCase, index) => (
              <ScrollReveal key={useCase.title} delay={index * 80}>
                <article className="h-full bg-ink px-5 py-8 md:px-7 md:py-10">
                  <span
                    aria-hidden="true"
                    className="text-[11px] font-medium tracking-[0.16em] text-white/65"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-10 font-display text-xl font-semibold text-white">{useCase.title}</h3>
                  <p className="mt-4 text-sm leading-7 text-white/55">{useCase.text}</p>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-line py-16 md:py-24" aria-labelledby="business-benefits-title">
        <div className="mx-auto max-w-site px-6">
          <ScrollReveal>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-px w-5 bg-accent" />
              {t("benefits.kicker")}
            </p>
            <h2 id="business-benefits-title" className="mt-5 max-w-3xl font-display text-display-lg font-bold text-ink">
              {t("benefits.title")}
              <span className="block font-light italic text-stone-text">{t("benefits.accent")}</span>
            </h2>
          </ScrollReveal>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {benefits.map((benefit, index) => (
              <ScrollReveal key={benefit.title} delay={(index % 2) * 100}>
                <article className="group flex h-full gap-5 rounded-card border border-line bg-card p-6 shadow-card transition-transform duration-300 ease-premium hover:-translate-y-1 md:p-8">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line bg-accent/5 text-accent">
                    <Icon name={BENEFIT_ICONS[index] ?? "check"} size={22} />
                  </span>
                  <div>
                    <h3 className="font-display text-xl font-semibold text-ink">{benefit.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-secondary">{benefit.text}</p>
                  </div>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="grid border-b border-line lg:grid-cols-2" aria-labelledby="business-detail-title">
        <figure className="relative min-h-[420px] overflow-hidden bg-ink lg:min-h-[680px]">
          <Image
            src={airportImage}
            alt={t("detail.imageAlt")}
            fill
            placeholder="blur"
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover object-center saturate-[0.88] contrast-[0.98]"
          />
        </figure>
        <div className="flex items-center bg-overlay px-6 py-16 sm:px-[7vw] lg:py-24 lg:pl-[6vw]">
          <ScrollReveal className="max-w-xl">
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-px w-5 bg-accent" />
              {t("detail.kicker")}
            </p>
            <h2 id="business-detail-title" className="mt-5 font-display text-display-lg font-bold text-ink">
              {t("detail.title")}
              <span className="block font-light italic text-stone-text">{t("detail.accent")}</span>
            </h2>
            <p className="mt-6 text-base leading-8 text-secondary">{t("detail.intro")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/boeken"
                className="inline-flex min-h-11 items-center gap-2 border-b border-ink py-2 text-sm font-semibold text-ink transition-colors hover:text-accent"
              >
                {t("detail.bookCta")}
                <Icon name="arrow-right" size={15} />
              </Link>
              <Link
                href="/diensten"
                className="inline-flex min-h-11 items-center gap-2 border-b border-line-strong py-2 text-sm font-semibold text-secondary transition-colors hover:text-ink"
              >
                {t("detail.servicesCta")}
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <section className="py-16 md:py-24" aria-labelledby="business-process-title">
        <div className="mx-auto max-w-site px-6">
          <ScrollReveal>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-px w-5 bg-accent" />
              {t("process.kicker")}
            </p>
            <h2 id="business-process-title" className="mt-5 font-display text-display-lg font-bold text-ink">
              {t("process.title")}
              <span className="block font-light italic text-stone-text">{t("process.accent")}</span>
            </h2>
          </ScrollReveal>
          <ol className="mt-12 grid gap-8 lg:grid-cols-3">
            {process.map((step, index) => (
              <li key={step.title} className="border-t border-ink/30 pt-6">
                <ScrollReveal delay={index * 100}>
                  <span className="text-[11px] font-semibold tracking-[0.16em] text-secondary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-8 font-display text-xl font-semibold text-ink">{step.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-secondary">{step.text}</p>
                </ScrollReveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-y border-line bg-card/60 py-16 md:py-24" aria-labelledby="business-faq-title">
        <div className="mx-auto grid max-w-site gap-10 px-6 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
          <ScrollReveal>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-px w-5 bg-accent" />
              {t("faq.kicker")}
            </p>
            <h2 id="business-faq-title" className="mt-5 font-display text-display-lg font-bold text-ink">
              {t("faq.title")}
              <span className="block font-light italic text-stone-text">{t("faq.accent")}</span>
            </h2>
          </ScrollReveal>
          <div className="divide-y divide-line border-y border-line">
            {faqs.map((faq) => (
              <details key={faq.question} className="group py-5">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-5 font-display text-base font-semibold text-ink marker:content-none">
                  {faq.question}
                  <Icon name="plus" size={18} className="shrink-0 transition-transform group-open:rotate-45" />
                </summary>
                <p className="max-w-2xl pb-2 pr-10 text-sm leading-7 text-secondary">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-fog px-6 py-16 md:py-24" aria-labelledby="business-cta-title">
        <ScrollReveal className="mx-auto max-w-site overflow-hidden rounded-card-lg bg-ink px-6 py-12 text-center text-white shadow-hero-card md:px-12 md:py-16">
          <p className="text-eyebrow font-medium uppercase text-white/50">{t("cta.kicker")}</p>
          <h2 id="business-cta-title" className="mx-auto mt-5 max-w-3xl font-display text-display-lg font-bold">
            {t("cta.title")}
            <span className="block font-light italic text-white/55">{t("cta.accent")}</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-white/60">{t("cta.intro")}</p>
          <Link
            href={CONTACT_HREF}
            className="mt-8 inline-flex min-h-[52px] items-center justify-center gap-2 rounded-md bg-white px-8 font-display text-base font-semibold text-ink transition-transform hover:-translate-y-0.5"
          >
            {t("cta.button")}
            <Icon name="arrow-right" size={17} />
          </Link>
        </ScrollReveal>
      </section>
    </>
  );
}
