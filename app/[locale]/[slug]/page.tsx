import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import schipholAvond from "@/public/schiphol-avond.jpg";
import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";
import FaqList from "@/components/sections/FaqList";
import RateTable from "@/components/seo/RateTable";
import { STEDEN } from "@/lib/seo-steden";
import {
  localeUrl,
  notFoundMetadata,
  OPEN_GRAPH_IMAGE_URL,
  SITE_URL,
  TWITTER_IMAGE_URL,
} from "@/lib/seo-locale";
import { loadRateCard } from "@/lib/pricing/rate-card";

/**
 * SEO-landingspagina's (taxi-<stad>-schiphol).
 *
 * PRIJZEN KOMEN UIT DE ENGINE, NOOIT UIT DE CONTENT. Tot 2026-07-20 stonden hier
 * hardgecodeerde bedragen die niet meer klopten: de Utrecht-pagina beloofde €79
 * terwijl de quote €110 rekende. Deze pagina leest nu `loadRateCard()` — dezelfde
 * bron als /tarieven en /api/pricing/quote.
 *
 * Bewust dynamisch, net als /tarieven: bij statische generatie zou een prijswijziging
 * pas bij de volgende build zichtbaar worden, en dan loopt de landingspagina opnieuw
 * achter op de boekingsprijs.
 */

export const dynamic = "force-dynamic";

// Bewust GEEN generateStaticParams/dynamicParams. In combinatie daarmee prerendert
// Next deze route alsnog (zichtbaar als ● in de build-output) en worden de prijzen
// bij build-tijd ingebakken — precies de veroudering die we hier oplossen.
// Onbekende slugs worden hieronder afgevangen met notFound().

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const stad = STEDEN.find((s) => s.slug === slug);
  if (!stad) return notFoundMetadata();

  // Geen bedrag in de title: twee van de vijf steden hebben geen stadsbrede prijs,
  // en een titel die veroudert is precies het probleem dat we hier oplossen.
  const title = `Taxi ${stad.naam} → Schiphol — vaste prijs vooraf`;
  const description = stad.metaDescription;

  // Open Graph en Twitter EXPLICIET per pagina. Zonder deze blokken erven de
  // landingspagina's de og:title/og:url/og:description van de root-layout (de
  // homepage), waardoor een gedeelde stad-URL als de homepage previewt. og:image
  // en twitter:image krijgen expliciete absolute www-URL's.
  //
  // Bewust NIET via localeMetadata(): die helper voegt hreflang-alternates toe,
  // terwijl deze pagina's Nederlandstalig-only zijn en zonder `languages`
  // consolideren via de canonical. We hergebruiken alleen localeUrl() voor een
  // absolute, locale-loze og:url die de canonical spiegelt.
  const url = localeUrl("nl", `/${stad.slug}`);

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      siteName: "T4XI",
      locale: "nl_NL",
      images: [{ url: OPEN_GRAPH_IMAGE_URL, width: 1200, height: 630, alt: "T4XI — Executive Mobility" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [TWITTER_IMAGE_URL],
    },
  };
}

const USPS = [
  { icon: "lock", title: "Vaste prijs", text: "Vooraf bekend en inclusief btw. Geen taxameter of onverwachte prijsstijgingen bij druk verkeer." },
  { icon: "plane", title: "Wij volgen uw vlucht", text: "Geef uw vluchtnummer op; wij passen het ophaalmoment aan bij vertraging. Na de landing is 60 minuten wachttijd inbegrepen." },
  { icon: "leaf", title: "Volledig elektrisch", text: "De Tesla Model Y is stil, ruim en volledig elektrisch." },
  { icon: "clock", title: "24/7 beschikbaar", text: "Vroege vluchten, late aankomsten en last-minute ritten. Wij rijden dag en nacht." },
];

export default async function SeoLandingPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const stad = STEDEN.find((s) => s.slug === slug);
  if (!stad) notFound();
  if (locale !== "nl") permanentRedirect(`/${stad.slug}`);

  const bookingHref = `/boeken?pickup=${encodeURIComponent(stad.naam)}&dropoff=${encodeURIComponent(
    "Schiphol Airport",
  )}`;

  // Live tarieven voor deze stad. Levert de engine niets, dan tonen we geen enkel
  // bedrag — liever geen prijs dan een verkeerde.
  const rateCard = await loadRateCard();
  const cityRates = rateCard.find((c) => c.citySlug === stad.citySlug) ?? null;
  const schipholRates = cityRates?.toSchiphol ?? [];

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: stad.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden border-b border-line" aria-labelledby="page-h1">
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(135deg,#F5F3F1_0%,#FFFFFF_54%,#E8E4DE_100%)]" />
        <div className="relative mx-auto grid max-w-site items-start gap-12 px-6 pb-14 pt-16 lg:grid-cols-2 lg:pb-20 lg:pt-24">
          <div>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-px w-4 bg-accent" />
              Premium taxivervoer
            </p>
            <h1 id="page-h1" className="mt-5 font-display text-display-xl font-bold text-ink">
              Taxi {stad.naam}
              <br />
              <span className="italic text-stone">naar Schiphol</span>
            </h1>
            <p className="mt-6 max-w-[480px] text-secondary">{stad.intro}</p>
            <ul className="mt-7 flex flex-col gap-2.5">
              {[
                "Ophalen bij uw voordeur",
                "Wij volgen uw vluchtstatus bij vertraging",
                "Tesla Model Y — volledig elektrisch",
                "Maximaal 4 passagiers excl. chauffeur · bagage vooraf afgestemd",
              ].map((t) => (
                <li key={t} className="flex items-center gap-3 text-sm text-ink">
                  <Icon name="check" size={16} className="shrink-0 text-accent" />
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={bookingHref}
                className="inline-flex min-h-[52px] items-center gap-2 rounded-md bg-accent px-8 font-display text-base font-medium text-white shadow-cta transition-colors hover:bg-accent-hover"
              >
                <Icon name="calendar-check" size={18} />
                Direct boeken
              </Link>
              <a
                href="tel:+31634744522"
                className="inline-flex min-h-[52px] items-center gap-2 rounded-md border border-line-strong bg-white/60 px-8 font-display text-base font-medium text-ink transition-colors hover:bg-white"
              >
                <Icon name="phone" size={18} />
                Bel ons
              </a>
            </div>
            <p className="mt-6 text-xs text-secondary">
              Vertrekpunten: {stad.vertrekpunten.join(", ")}
            </p>
          </div>

          <RateTable stad={stad} rates={schipholRates} bookingHref={bookingHref} />
        </div>
      </section>

      {/* ═══ USPS ═══ */}
      <div className="border-b border-line bg-card">
        <div className="mx-auto grid max-w-site gap-6 px-6 py-10 sm:grid-cols-2 lg:grid-cols-4">
          {USPS.map((u) => (
            <div key={u.title}>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-accent/5 text-accent">
                <Icon name={u.icon} size={20} />
              </span>
              <h2 className="mt-3 font-display text-base font-semibold text-ink">{u.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-secondary">{u.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ SEO CONTENT ═══ */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-site px-6">
          <ScrollReveal>
            <div className="max-w-[720px]">
              <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
                <span aria-hidden="true" className="h-px w-4 bg-accent" />
                Waarom T4XI voor {stad.naam} → Schiphol
              </p>
              <h2 className="mt-4 font-display text-display-lg font-bold text-ink">
                Comfortabel naar Schiphol
                <br />
                <span className="italic text-stone">voor uw Schiphol-transfer</span>
              </h2>
              <p className="mt-5 text-secondary">
                Voor een rit vanuit {stad.naam} naar Schiphol wilt u vooraf weten
                waar u aan toe bent. Daarom bevestigen we een vaste prijs en maken
                we duidelijke afspraken over de ophaaltijd en uw bagage.
              </p>
              <p className="mt-4 text-secondary">
                Onze chauffeurs rijden regelmatig tussen {stad.naam} en Schiphol.
                We plannen voldoende reistijd in en kiezen op de dag zelf de route
                die het beste past bij de verkeerssituatie.
              </p>
              <p className="mt-4 text-secondary">
                Geef bij uw boeking het vluchtnummer op. We volgen de vluchtstatus
                en stemmen het ophaalmoment daarop af als uw vlucht vertraagd is.
              </p>

              <h3 className="mt-10 font-display text-xl font-bold text-ink">
                Vertrekpunten in en om {stad.naam}
              </h3>
              <p className="mt-3 text-secondary">
                T4XI haalt u op bij uw voordeur. We rijden vanuit de wijken en
                omliggende plaatsen waarvoor op deze pagina een route staat:
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {stad.vertrekpunten.map((v) => (
                  <span key={v} className="rounded-full border border-line bg-card px-3.5 py-1.5 text-xs text-secondary">
                    {v}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-[13px] text-secondary">
                Staat uw plaatsnaam er niet bij? Bel of WhatsApp ons. We kijken
                graag of we de rit kunnen uitvoeren en maken een offerte op maat.
              </p>
              <p className="mt-6 text-secondary">
                Benieuwd naar het exacte bedrag voor uw rit?{" "}
                <Link href="/tarieven" className="font-medium text-ink underline underline-offset-4 hover:opacity-80">
                  Bereken uw vaste ritprijs
                </Link>{" "}
                — kies uw ophaaladres, eventuele tussenstops en bestemming en zie
                direct de vaste prijs.
              </p>
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
              Veelgestelde vragen
            </p>
            <h2 className="mb-12 mt-4 font-display text-display-lg font-bold text-ink">
              {stad.naam} → <span className="italic text-stone">Schiphol FAQ</span>
            </h2>
          </ScrollReveal>
          <FaqList items={stad.faq} />
        </div>
      </section>

      {/* ═══ CTA BAND ═══ */}
      <div className="relative overflow-hidden border-t border-line bg-ink py-16 text-center md:py-20">
        {/* Schiphol-platform bij avond (gecureerd, T4XI). De navy-avondtinten
            sluiten aan op bg-ink; de overlay houdt de fog-tekst leesbaar. */}
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
          <p className="text-eyebrow font-medium uppercase text-stone">Klaar om te boeken?</p>
          <h2 className="mt-4 font-display text-display-lg font-bold text-fog">
            <span className="italic text-stone-subtle">{stad.naam} → Schiphol</span> met vaste prijs
          </h2>
          <p className="mx-auto mt-4 max-w-[480px] text-stone-subtle">
            Vul uw adres in en u ziet direct wat de rit kost. Die prijs staat vast bij
            bevestiging — ook als het verkeer tegenzit.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href={bookingHref}
              className="inline-flex min-h-[52px] items-center gap-2 rounded-md bg-fog px-8 font-display text-base font-medium text-ink transition-transform hover:-translate-y-0.5"
            >
              <Icon name="calendar-check" size={18} />
              Bereken uw prijs
            </Link>
            <a
              href={`https://wa.me/31634744522?text=${encodeURIComponent(`Hallo T4XI, ik wil een taxi van ${stad.naam} naar Schiphol boeken.`)}`}
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
