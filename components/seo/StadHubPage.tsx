import Image from "next/image";
import { Link } from "@/i18n/navigation";
import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";
import FaqList from "@/components/sections/FaqList";
import schipholAvond from "@/public/schiphol-avond.jpg";
import type { StadHub } from "@/lib/seo-stad-hubs";
import type { AirportLandingLocale } from "@/lib/seo-steden";
import { localeUrl, SITE_URL } from "@/lib/seo-locale";

/**
 * Template voor de lokale stadshubs (/taxi-almere, /taxi-spijkenisse).
 *
 * BEWUST GEEN PRIJZEN EN GEEN TARIEFTABEL. De hub bedient brede stadsintentie
 * en stuurt door naar /tarieven (berekening) en /boeken (conversie). De
 * Schiphol-route houdt zijn eigen pagina; deze template linkt daarheen maar
 * herhaalt die inhoud niet, zodat de twee elkaar niet kannibaliseren.
 */

const COPY = {
  nl: {
    bookNow: "Boek een rit",
    callUs: "Bel ons",
    calcFare: "Bereken uw prijs",
    routeCardKicker: "Naar de luchthaven",
    routeCardTitle: (stad: string) => `Taxi ${stad} → Schiphol`,
    routeCardText:
      "Voor de rit naar Schiphol hebben wij een aparte pagina met reistijd, vertrekpunten en de vaste routeprijs.",
    routeCardLink: "Bekijk de Schiphol-route",
    priceKicker: "Prijs vooraf",
    priceTitle: "Wat kost uw rit?",
    priceText:
      "Vul uw ophaaladres en bestemming in en u ziet direct de vaste prijs, inclusief btw. Geen taxameter, geen dynamische prijsverhogingen.",
    priceLink: "Naar de prijsberekening",
    businessLink: "Zakelijk vervoer",
    servicesLink: "Alle diensten",
    faqTitle: (stad: string) => `Veelgestelde vragen over taxi ${stad}`,
    faqEyebrow: "Goed om te weten",
    ctaEyebrow: "Klaar om te boeken",
    ctaTitle: (stad: string) => `Uw taxi in ${stad}`,
    ctaText: "Bereken uw vaste prijs en leg uw rit in een paar stappen vast.",
    whatsapp: (stad: string) => `Hallo T4XI, ik wil graag een taxi in ${stad} boeken.`,
    breadcrumbHome: "Home",
  },
  en: {
    bookNow: "Book a ride",
    callUs: "Call us",
    calcFare: "Calculate your fare",
    routeCardKicker: "To the airport",
    routeCardTitle: (stad: string) => `Taxi ${stad} → Schiphol`,
    routeCardText:
      "For the ride to Schiphol we have a dedicated page with travel time, pickup points and the fixed route fare.",
    routeCardLink: "View the Schiphol route",
    priceKicker: "Fare in advance",
    priceTitle: "What will your ride cost?",
    priceText:
      "Enter your pickup address and destination and you will see the fixed fare immediately, including VAT. No taximeter, no surge pricing.",
    priceLink: "Go to the fare calculator",
    businessLink: "Business travel",
    servicesLink: "All services",
    faqTitle: (stad: string) => `Frequently asked questions about taxi ${stad}`,
    faqEyebrow: "Good to know",
    ctaEyebrow: "Ready to book",
    ctaTitle: (stad: string) => `Your taxi in ${stad}`,
    ctaText: "Calculate your fixed fare and confirm your ride in a few steps.",
    whatsapp: (stad: string) => `Hello T4XI, I would like to book a taxi in ${stad}.`,
    breadcrumbHome: "Home",
  },
} as const;

export default function StadHubPage({
  hub,
  locale,
}: {
  hub: StadHub;
  locale: AirportLandingLocale;
}) {
  const copy = COPY[locale];
  const canonical = localeUrl(locale, `/${hub.slug}`);
  const bookingHref = "/boeken";

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: copy.breadcrumbHome, item: localeUrl(locale, "/") },
      { "@type": "ListItem", position: 2, name: hub.metaTitle, item: canonical },
    ],
  };

  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${canonical}#service`,
    name: `Taxi ${hub.naam}`,
    serviceType: `Taxi ${hub.naam}`,
    description: hub.metaDescription,
    url: canonical,
    provider: {
      "@type": "Organization",
      name: "T4XI",
      url: SITE_URL,
      telephone: "+31634744522",
    },
    areaServed: { "@type": "City", name: hub.naam },
    availableChannel: {
      "@type": "ServiceChannel",
      serviceUrl: localeUrl(locale, bookingHref),
      servicePhone: { "@type": "ContactPoint", telephone: "+31634744522" },
    },
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: hub.faq.map((faq) => ({
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

      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden border-b border-line" aria-labelledby="page-h1">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(135deg,#F5F3F1_0%,#FFFFFF_54%,#E8E4DE_100%)]"
        />
        <div className="relative mx-auto grid max-w-site items-start gap-12 px-6 pb-14 pt-16 lg:grid-cols-2 lg:pb-20 lg:pt-24">
          <div>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-px w-4 bg-accent" />
              {hub.eyebrow}
            </p>
            <h1 id="page-h1" className="mt-5 font-display text-display-xl font-bold text-ink">
              Taxi {hub.naam}
            </h1>
            <p className="mt-6 max-w-[520px] text-secondary">{hub.intro}</p>
            <div className="mt-8 flex flex-wrap gap-3">
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
          </div>

          {/* Twee doorverwijskaarten: route-intentie en prijsintentie krijgen elk
              hun eigen bestemming, zodat deze hub geen van beide kannibaliseert. */}
          <div className="flex flex-col gap-4">
            <Link
              href={`/${hub.routeSlug}`}
              className="group rounded-card border border-line bg-card p-6 transition-colors hover:border-line-strong"
            >
              <p className="text-eyebrow font-medium uppercase text-accent">{copy.routeCardKicker}</p>
              <h2 className="mt-3 font-display text-lg font-semibold text-ink">
                {copy.routeCardTitle(hub.naam)}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-secondary">{copy.routeCardText}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                {copy.routeCardLink}
                <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span>
              </span>
            </Link>

            <Link
              href="/tarieven"
              className="group rounded-card border border-line bg-card p-6 transition-colors hover:border-line-strong"
            >
              <p className="text-eyebrow font-medium uppercase text-accent">{copy.priceKicker}</p>
              <h2 className="mt-3 font-display text-lg font-semibold text-ink">{copy.priceTitle}</h2>
              <p className="mt-2 text-sm leading-relaxed text-secondary">{copy.priceText}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                {copy.priceLink}
                <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span>
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ INHOUDELIJKE SECTIES ═══ */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-site px-6">
          <ScrollReveal>
            <div className="max-w-[720px]">
              {hub.secties.map((sectie, index) => (
                <div key={sectie.kop} className={index === 0 ? "" : "mt-10"}>
                  <h2 className="font-display text-xl font-bold text-ink">{sectie.kop}</h2>
                  <p className="mt-3 text-secondary">{sectie.tekst}</p>
                </div>
              ))}

              <h2 className="mt-12 font-display text-xl font-bold text-ink">{hub.gebiedenKop}</h2>
              <p className="mt-3 text-secondary">{hub.gebiedenIntro}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {hub.gebieden.map((gebied) => (
                  <span
                    key={gebied}
                    className="rounded-full border border-line bg-card px-3.5 py-1.5 text-xs text-secondary"
                  >
                    {gebied}
                  </span>
                ))}
              </div>

              <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-6 text-sm">
                <Link href="/zakelijk-vervoer" className="font-medium text-ink underline underline-offset-4 hover:opacity-80">
                  {copy.businessLink}
                </Link>
                <Link href="/diensten" className="font-medium text-ink underline underline-offset-4 hover:opacity-80">
                  {copy.servicesLink}
                </Link>
                <Link href="/tarieven" className="font-medium text-ink underline underline-offset-4 hover:opacity-80">
                  {copy.priceLink}
                </Link>
                <Link href={`/${hub.routeSlug}`} className="font-medium text-ink underline underline-offset-4 hover:opacity-80">
                  {copy.routeCardTitle(hub.naam)}
                </Link>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section className="border-t border-line bg-card/60 py-16 md:py-24">
        <div className="mx-auto max-w-site px-6">
          <ScrollReveal>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-px w-4 bg-accent" />
              {copy.faqEyebrow}
            </p>
            <h2 className="mb-12 mt-4 font-display text-display-lg font-bold text-ink">
              {copy.faqTitle(hub.naam)}
            </h2>
          </ScrollReveal>
          <FaqList items={hub.faq} />
        </div>
      </section>

      {/* ═══ CTA ═══ */}
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
          <h2 className="mt-4 font-display text-display-lg font-bold text-fog">{copy.ctaTitle(hub.naam)}</h2>
          <p className="mx-auto mt-4 max-w-[520px] text-stone-subtle">{copy.ctaText}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href={bookingHref}
              className="inline-flex min-h-[52px] items-center gap-2 rounded-md bg-fog px-8 font-display text-base font-medium text-ink transition-transform hover:-translate-y-0.5"
            >
              <Icon name="calendar-check" size={18} />
              {copy.calcFare}
            </Link>
            <a
              href={`https://wa.me/31634744522?text=${encodeURIComponent(copy.whatsapp(hub.naam))}`}
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
