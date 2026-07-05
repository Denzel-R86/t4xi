import Image from "next/image";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";
import HeroBookingCard from "@/components/booking/HeroBookingCard";
import BookingSection from "@/components/booking/BookingSection";
import ServicesSection from "@/components/sections/ServicesSection";
import ReviewsSection from "@/components/sections/ReviewsSection";
import FairBand from "@/components/sections/FairBand";
import PriceTables from "@/components/sections/PriceTables";
import WhySection from "@/components/sections/WhySection";
import ProductsTeaser from "@/components/sections/ProductsTeaser";
import ZakelijkSection from "@/components/sections/ZakelijkSection";
import FaqList from "@/components/sections/FaqList";
import ContactSection from "@/components/sections/ContactSection";

const trustStats = [
  { num: "★★★★★", title: "500+ tevreden klanten", sub: "Google beoordelingen", stars: true },
  { num: "24/7", title: "Altijd bereikbaar", sub: "Boek ook 's nachts" },
  { num: "100%", title: "Vaste prijzen", sub: "Geen verrassingen" },
  { num: "2", title: "Elektrische voertuigen", sub: "Tesla & Lynk & Co" },
  { num: "€0", title: "Annuleringskosten", sub: "Gratis tot 2 uur voor" },
];

const beleving = [
  { icon: "receipt", title: "Vaste prijs vooraf", text: "Geen taxameterstress. U ziet vooraf een duidelijke richtprijs op basis van vertrekpunt, bestemming, postcodegebied en bagage." },
  { icon: "armchair", title: "Ontspannen onderweg", text: "Stil elektrisch vervoer, nette chauffeur, rustige rijstijl en voldoende ruimte voor een representatieve rit naar luchthaven of afspraak." },
  { icon: "plane", title: "Schiphol zonder gedoe", text: "Afspraak, ophaaltijd en bagage worden vooraf afgestemd. Bij luchthavenritten houden we rekening met realistische reistijd." },
  { icon: "message-check", title: "Gemakkelijk boeken", text: "Adres invullen, postcode en stad automatisch herkennen, prijs bekijken en direct bevestigen via WhatsApp of e-mail." },
];

const teslaSpecs = [
  { icon: "leaf", val: "100%", label: "Elektrisch" },
  { icon: "users", val: "4", label: "Passagiers" },
  { icon: "luggage", val: "Ruim", label: "Bagageruim" },
  { icon: "map-pin", val: "2", label: "Regio's" },
];

const bookingFeatures = [
  { icon: "lock", text: "Vaste prijs vooraf — geen taxameter" },
  { icon: "shield-check", text: "VOG-gescreende chauffeurs" },
  { icon: "clock", text: "Bevestiging binnen 5 minuten" },
  { icon: "credit-card", text: "iDEAL, pin of contant" },
  { icon: "plane", text: "Vluchttijden worden gemonitord" },
];

export default function HomePage() {
  return (
    <>
      {/* ═══ HERO ═══ */}
      <section aria-label="Welkomstsectie" className="relative overflow-hidden border-b border-line">
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(135deg,#F5F3F1_0%,#FFFFFF_54%,#E8E4DE_100%)]" />
        <div aria-hidden="true" className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(40,49,59,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(40,49,59,.08)_1px,transparent_1px)] [background-size:64px_64px]" />

        <div className="relative mx-auto grid max-w-site gap-12 px-6 pb-14 pt-16 lg:grid-cols-2 lg:items-center lg:gap-16 lg:pb-24 lg:pt-28">
          <div>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent shadow-[0_0_0_4px_rgba(40,49,59,0.12)]" />
              Executive Airport Mobility
            </p>
            <h1 className="mt-5 font-display text-display-xl font-bold text-ink">
              Van voordeur
              <br />
              <em className="not-italic text-accent">tot vertrekhal.</em>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-secondary">
              Boek eenvoudig uw premium rit met vaste prijs vooraf. Rustig
              elektrisch vervoer, professionele chauffeur en heldere afspraken
              over passagiers en bagage.
            </p>
            <div className="mt-9 hidden flex-wrap gap-4 lg:flex">
              <Button href="#boeken" size="xl">
                <Icon name="calendar-check" size={19} />
                Boek een rit
              </Button>
              <Button href="#vloot" variant="ghost" size="xl">
                <Icon name="car" size={19} />
                Bekijk wagenpark
              </Button>
            </div>

            <div
              className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-card border border-line bg-white/80 px-5 py-4 text-sm text-secondary shadow-card"
              aria-label="Vertrouwensindicatoren"
            >
              <span className="flex items-center gap-2">
                <span className="tracking-[2px] text-accent" aria-label="5 sterren beoordeling">★★★★★</span>
                500+ ritten
              </span>
              <span aria-hidden="true" className="hidden h-5 w-px bg-line-strong sm:block" />
              <span className="flex items-center gap-1.5">
                <Icon name="clock" size={16} className="text-accent" />
                24/7 beschikbaar
              </span>
              <span aria-hidden="true" className="hidden h-5 w-px bg-line-strong sm:block" />
              <span className="flex items-center gap-1.5">
                <Icon name="shield-check" size={16} className="text-accent" />
                VOG-gescreend
              </span>
              <span aria-hidden="true" className="hidden h-5 w-px bg-line-strong sm:block" />
              <span className="flex items-center gap-1.5">
                <Icon name="leaf" size={16} className="text-accent" />
                100% groen
              </span>
            </div>
          </div>

          <HeroBookingCard />
        </div>
      </section>

      {/* ═══ TRUST STRIP ═══ */}
      <div className="border-b border-line bg-card" role="region" aria-label="Klantwaardering en statistieken">
        <div className="mx-auto flex max-w-site flex-wrap items-center justify-between gap-6 px-6 py-9">
          {trustStats.map((s, i) => (
            <div key={s.title} className="flex items-center gap-6">
              {i > 0 && <span aria-hidden="true" className="hidden h-10 w-px bg-line lg:block" />}
              <div className="min-w-[110px] text-center">
                <div className={`font-display font-bold leading-none text-accent ${s.stars ? "text-base tracking-[2px]" : "text-[30px]"}`}>
                  {s.num}
                </div>
                <div className="mt-1.5 text-sm font-medium text-ink">{s.title}</div>
                <div className="mt-0.5 text-xs text-stone">{s.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ RITBELEVING ═══ */}
      <section className="py-16 md:py-24" aria-labelledby="experience-title">
        <div className="mx-auto max-w-site px-6">
          <ScrollReveal>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-px w-4 bg-accent" />
              De T4XI beleving
            </p>
            <h2 id="experience-title" className="mt-4 max-w-3xl font-display text-display-lg font-bold text-ink">
              Rust, overzicht en comfort vanaf het eerste contact.
            </h2>
            <p className="mt-4 max-w-2xl text-secondary">
              Een premium rit begint niet bij instappen, maar bij eenvoudig
              boeken, heldere communicatie en weten waar u aan toe bent.
            </p>
          </ScrollReveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {beleving.map((b, i) => (
              <ScrollReveal key={b.title} delay={i * 100}>
                <article className="h-full rounded-card border border-line bg-card p-6 shadow-card">
                  <Icon name={b.icon} size={24} className="text-accent" />
                  <h3 className="mb-2 mt-3.5 font-display text-lg font-semibold text-ink">{b.title}</h3>
                  <p className="text-sm leading-relaxed text-secondary">{b.text}</p>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ DIENSTEN ═══ */}
      <ServicesSection />

      {/* ═══ VLOOT ═══ */}
      <section id="vloot" className="border-t border-line bg-card/60 py-16 md:py-24" aria-labelledby="vloot-title">
        <div className="mx-auto max-w-site px-6">
          <ScrollReveal>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-px w-4 bg-accent" />
              Ons wagenpark
            </p>
            <h2 id="vloot-title" className="mt-4 font-display text-display-lg font-bold text-ink">
              Premium voertuigen
              <br />
              <span className="italic text-stone">voor elke gelegenheid</span>
            </h2>
          </ScrollReveal>

          <ScrollReveal>
            <div className="relative mt-12 overflow-hidden rounded-fleet border border-line bg-card shadow-card-lg">
              <div className="relative w-full">
                <Image
                  src="/tesla_model_y_black.jpg"
                  alt="Tesla Model Y — volledig elektrisch, premium interieur"
                  fill
                  sizes="(min-width: 1200px) 1200px, 100vw"
                  className="object-cover saturate-[0.92] contrast-[0.95]"
                />
                <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,rgba(245,243,241,.96),rgba(245,243,241,.72),rgba(245,243,241,.10))]" />
                <div className="relative flex min-h-64 flex-col justify-center p-6 md:min-h-[420px] md:p-12">
                  <div className="max-w-[540px]">
                    <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-2 text-xs font-medium text-white">
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-white" />
                      Executive Airport Mobility — actief
                    </span>
                    <h3 className="mt-4 font-display text-3xl font-bold text-ink md:text-4xl">Tesla Model Y</h3>
                    <p className="mt-3 rounded-2xl bg-white/70 p-4 text-sm leading-relaxed text-secondary backdrop-blur-sm md:text-base">
                      Het vlaggenschip van onze vloot. Volledig elektrisch, ruim
                      interieur en een indrukwekkend rijbereik. Zakelijk of
                      particulier — de Tesla Model Y zet de toon.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2.5">
                      {teslaSpecs.map((spec) => (
                        <span key={spec.label} className="flex items-center gap-2 rounded-xl border border-line bg-fog px-3 py-2 text-xs text-ink">
                          <Icon name={spec.icon} size={15} className="text-accent" />
                          <b className="font-semibold">{spec.val}</b> {spec.label}
                        </span>
                      ))}
                    </div>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <Button href="#boeken">
                        <Icon name="calendar-check" size={17} />
                        Direct boeken
                      </Button>
                      <Button href="tel:+31634744522" variant="ghost">
                        <Icon name="phone" size={17} />
                        Bel ons
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal>
            <div className="mt-10 grid overflow-hidden rounded-fleet border border-line bg-card shadow-card-lg md:grid-cols-2">
              <div className="relative h-64 md:h-auto">
                <Image
                  src="/lynk_co_black.jpg"
                  alt="Lynk & Co 01 — plug-in hybrid SUV"
                  fill
                  sizes="(min-width: 768px) 600px, 100vw"
                  className="object-cover saturate-[0.92]"
                />
              </div>
              <div className="p-6 md:p-10">
                <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-2 text-xs font-medium text-white">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-white" />
                  Amsterdam — actief
                </span>
                <h3 className="mt-4 font-display text-2xl font-bold text-ink md:text-3xl">Lynk &amp; Co 01</h3>
                <p className="mt-3 text-sm leading-relaxed text-secondary md:text-base">
                  Plug-in hybride SUV met panoramadak, premium interieur en
                  opvallende uitstraling. Representatief voor elk zakelijk bezoek.
                </p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {[
                    { icon: "bolt", label: "Plug-in Hybrid" },
                    { icon: "users", label: "4 personen" },
                    { icon: "sun", label: "Panoramadak" },
                    { icon: "briefcase", label: "Zakelijk" },
                  ].map((tag) => (
                    <span key={tag.label} className="flex items-center gap-2 rounded-xl border border-line bg-fog px-3 py-2 text-xs text-ink">
                      <Icon name={tag.icon} size={15} className="text-accent" />
                      {tag.label}
                    </span>
                  ))}
                </div>
                <div className="mt-6">
                  <Button href="#boeken" variant="ghost">
                    <Icon name="calendar-check" size={17} />
                    Boek de Lynk &amp; Co
                  </Button>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ═══ BOOKING ═══ */}
      <section id="boeken" className="border-t border-line bg-[linear-gradient(180deg,#F5F3F1,#FFFFFF)] py-16 md:py-24" aria-labelledby="boeken-title">
        <div className="mx-auto grid max-w-site items-start gap-12 px-6 lg:grid-cols-2">
          <ScrollReveal>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-px w-4 bg-accent" />
              Direct reserveren
            </p>
            <h2 id="boeken-title" className="mt-4 font-display text-display-lg font-bold text-ink">
              Plan uw
              <br />
              <span className="italic text-stone">rit nu</span>
            </h2>
            <p className="mt-4 text-secondary">Vaste prijs, bevestiging binnen 5 min. Geen verrassingen.</p>
            <ul className="mt-8 flex flex-col gap-4">
              {bookingFeatures.map((f) => (
                <li key={f.text} className="flex items-center gap-3 text-sm text-ink">
                  <Icon name={f.icon} size={18} className="shrink-0 text-accent" />
                  {f.text}
                </li>
              ))}
            </ul>
          </ScrollReveal>
          <ScrollReveal delay={150}>
            <BookingSection />
          </ScrollReveal>
        </div>
      </section>

      {/* ═══ EERLIJK PLATFORM ═══ */}
      <FairBand />

      {/* ═══ PRIJSOVERZICHT ═══ */}
      <section id="prijzen" className="border-t border-line bg-card/60 py-16 md:py-24" aria-labelledby="prijzen-title">
        <div className="mx-auto max-w-site px-6">
          <ScrollReveal>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-px w-4 bg-accent" />
              Vaste tarieven
            </p>
            <h2 id="prijzen-title" className="mt-4 font-display text-display-lg font-bold text-ink">
              Geen verrassingen,
              <br />
              <span className="italic text-stone">altijd vaste prijs</span>
            </h2>
            <p className="mt-4 max-w-2xl text-secondary">
              Onderstaande prijzen zijn voor enkele rit. Retour = ×1,8.
              Nachttarief (23:00–06:00) = +15%.
            </p>
          </ScrollReveal>
          <ScrollReveal>
            <div className="mt-12">
              <PriceTables />
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ═══ WHY ═══ */}
      <WhySection />

      {/* ═══ REVIEWS ═══ */}
      <ReviewsSection />

      {/* ═══ MOBILITEITSPRODUCTEN ═══ */}
      <ProductsTeaser />

      {/* ═══ ZAKELIJK ═══ */}
      <ZakelijkSection />

      {/* ═══ FAQ ═══ */}
      <section className="border-t border-line py-16 md:py-24" aria-labelledby="faq-title">
        <div className="mx-auto max-w-site px-6">
          <ScrollReveal>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-px w-4 bg-accent" />
              Veelgestelde vragen
            </p>
            <h2 id="faq-title" className="mb-12 mt-4 font-display text-display-lg font-bold text-ink">
              Heeft u <span className="italic text-stone">vragen?</span>
            </h2>
          </ScrollReveal>
          <FaqList />
        </div>
      </section>

      {/* ═══ CONTACT ═══ */}
      <ContactSection />
    </>
  );
}
