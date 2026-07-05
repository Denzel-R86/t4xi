import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";
import FaqList from "@/components/sections/FaqList";
import QuickBookCard from "@/components/seo/QuickBookCard";
import { STEDEN } from "@/lib/seo-steden";

/** SEO-landingspagina's (taxi-<stad>-schiphol) — template uit de v14-bron. */

export const dynamicParams = false;

export function generateStaticParams() {
  return STEDEN.map((s) => ({ slug: s.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const stad = STEDEN.find((s) => s.slug === params.slug);
  if (!stad) return {};
  return {
    title: `Taxi ${stad.naam} Schiphol — Vaste Prijs ${stad.prijs}`,
    description: stad.metaDescription,
    alternates: { canonical: `/${stad.slug}` },
  };
}

const USPS = [
  { icon: "lock", title: "Vaste prijs", text: "Geen taxameter, geen surge pricing, ook niet bij files of nacht." },
  { icon: "plane", title: "Vluchtmonitoring", text: "Geef je vluchtnummer op — wij passen de ophaaltijd automatisch aan bij vertraging." },
  { icon: "leaf", title: "Volledig elektrisch", text: "Tesla Model Y — 0 uitstoot, ruim bagageruim, premium interieur." },
  { icon: "clock", title: "24/7 beschikbaar", text: "Vroege vluchten, late aankomsten, last-minute boekingen — wij rijden altijd." },
];

export default function SeoLandingPage({ params }: { params: { slug: string } }) {
  const stad = STEDEN.find((s) => s.slug === params.slug);
  if (!stad) notFound();

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
            <p className="mt-6 max-w-[480px] text-secondary">
              {stad.intro.split(stad.prijs)[0]}
              <strong className="text-ink">{stad.prijs}</strong>
              {stad.intro.split(stad.prijs)[1]}
            </p>
            <ul className="mt-7 flex flex-col gap-2.5">
              {[
                "Ophaal bij jouw voordeur",
                "Vluchttijden worden gemonitord",
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
                href="/boeken"
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

          <QuickBookCard stad={stad} />
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
              <p className="mt-1.5 text-sm leading-relaxed text-secondary">
                {u.title === "Vaste prijs" ? `Altijd ${stad.prijs} — geen taxameter, geen surge pricing, ook niet bij files of nacht.` : u.text}
              </p>
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
                De slimste keuze
                <br />
                <span className="italic text-stone">voor uw Schiphol-transfer</span>
              </h2>
              <p className="mt-5 text-secondary">
                Een Schiphol-transfer vanuit {stad.naam} vraagt om een betrouwbare
                partner. T4XI is gespecialiseerd in vaste-prijs transferritten —
                geen taxameter die oploopt, geen onduidelijkheid over de
                eindprijs en geen stress als het verkeer tegenzit.
              </p>
              <p className="mt-4 text-secondary">
                Onze chauffeurs kennen de route vanuit {stad.naam} naar Schiphol
                op hun duimpje. Ze weten wanneer ze moeten vertrekken om op tijd
                te zijn, welke route het beste werkt op welk moment van de dag,
                en hoe ze discreet en professioneel met zakelijke reizigers
                omgaan.
              </p>
              <p className="mt-4 text-secondary">
                Geef bij de boeking je vluchtnummer op. Wij monitoren de
                vertrektijden en staan voor de deur op het moment dat jij moet
                vertrekken — niet eerder, niet later.
              </p>

              <h3 className="mt-10 font-display text-xl font-bold text-ink">
                Vertrekpunten in en om {stad.naam}
              </h3>
              <p className="mt-3 text-secondary">
                T4XI haalt je op bij jouw voordeur, ongeacht het exacte adres.
                Wij rijden vanuit alle wijken en omliggende plaatsen:
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {stad.vertrekpunten.map((v) => (
                  <span key={v} className="rounded-full border border-line bg-card px-3.5 py-1.5 text-xs text-secondary">
                    {v}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-[13px] text-secondary">
                Staat jouw plaatsnaam er niet bij? Bel of WhatsApp ons — wij
                rijden ook vanuit omliggende gemeenten voor een offerte op maat.
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
      <div className="border-t border-line bg-ink py-16 text-center md:py-20">
        <div className="mx-auto max-w-site px-6">
          <p className="text-eyebrow font-medium uppercase text-stone">Klaar om te boeken?</p>
          <h2 className="mt-4 font-display text-display-lg font-bold text-fog">
            <span className="italic text-stone-subtle">{stad.naam} → Schiphol</span> voor {stad.prijs}
          </h2>
          <p className="mx-auto mt-4 max-w-[480px] text-stone-subtle">
            Reserveer nu en rijd zonder stress naar Schiphol. Bevestiging binnen
            5 minuten.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/boeken"
              className="inline-flex min-h-[52px] items-center gap-2 rounded-md bg-fog px-8 font-display text-base font-medium text-ink transition-transform hover:-translate-y-0.5"
            >
              <Icon name="calendar-check" size={18} />
              Nu boeken — {stad.prijs}
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
