import Image from "next/image";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";
import HeroBookingCard from "@/components/booking/HeroBookingCard";

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

const diensten = [
  {
    icon: "plane",
    title: "Schiphol transfer",
    text: "Vaste prijs, vluchtmonitoring en ophalen bij aankomst. Nooit meer stress op de luchthaven.",
    features: ["Vluchtmonitoring", "Vaste prijs", "24/7"],
    cta: "Boek transfer",
    href: "/boeken",
    featured: true,
  },
  {
    icon: "briefcase",
    title: "Zakelijk vervoer",
    text: "Facturering, vaste chauffeur en maandelijkse contracten. Professioneel van deur tot deur.",
    features: ["Factuur op rekening", "Vaste chauffeur", "Maandcontract"],
    cta: "Meer info",
    href: "/diensten",
  },
  {
    icon: "user",
    title: "Privéritten",
    text: "Naar een diner, evenement of afspraak. Stijlvol vervoer voor elke gelegenheid.",
    features: ["Directe boeking", "Binnen 60 min.", "Transparante prijs"],
    cta: "Nu boeken",
    href: "/boeken",
  },
  {
    icon: "confetti",
    title: "Evenementen",
    text: "Bruiloften, gala's en bedrijfsevents. Meerdere voertuigen, één aanspreekpunt.",
    features: ["Meerdere voertuigen", "Persoonlijk contact", "Maatwerk"],
    cta: "Offerte aanvragen",
    href: "/diensten",
  },
];

const teslaSpecs = [
  { icon: "leaf", val: "100%", label: "Elektrisch" },
  { icon: "users", val: "4", label: "Passagiers" },
  { icon: "luggage", val: "Ruim", label: "Bagageruim" },
  { icon: "map-pin", val: "2", label: "Regio's" },
];

const reviews = [
  {
    initials: "MH",
    name: "Mark H.",
    trip: "Amsterdam → Schiphol",
    tripIcon: "map-pin",
    date: "14 maart 2026",
    dateTime: "2026-03-14",
    quote: "Prachtige Tesla, op de minuut stipt op Schiphol. Chauffeur was vriendelijk en stil — precies wat je wil vroeg in de ochtend. Nooit meer met een andere taxi.",
  },
  {
    initials: "SR",
    name: "Sandra R.",
    trip: "Zakelijk abonnement — Rotterdam",
    tripIcon: "briefcase",
    date: "28 februari 2026",
    dateTime: "2026-02-28",
    quote: "Zakelijk gebruik, maandelijks. Altijd netjes, altijd op tijd en de factuur klopt feilloos. De chauffeur kent de routes perfect en communiceert proactief. Absolute aanrader voor bedrijven.",
    featured: true,
  },
  {
    initials: "LT",
    name: "Laura & Tom",
    trip: "Bruiloft — Amsterdam",
    tripIcon: "confetti",
    date: "10 januari 2026",
    dateTime: "2026-01-10",
    quote: "Voor onze bruiloft twee wagens geboekt. Alles tot in de puntjes geregeld, chauffeurs in pak en de auto's blonken. Gasten hadden het er nog dagen over.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* ═══ HERO ═══ */}
      <section aria-label="Welkomstsectie" className="relative overflow-hidden border-b border-line">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(135deg,#F5F3F1_0%,#FFFFFF_54%,#E8E4DE_100%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(40,49,59,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(40,49,59,.08)_1px,transparent_1px)] [background-size:64px_64px]"
        />

        <div className="relative mx-auto grid max-w-site gap-12 px-6 pb-14 pt-16 lg:grid-cols-2 lg:items-center lg:gap-16 lg:pb-24 lg:pt-28">
          {/* Copy */}
          <div>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-accent shadow-[0_0_0_4px_rgba(40,49,59,0.12)]"
              />
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
              <Button href="/boeken" size="xl">
                <Icon name="calendar-check" size={19} />
                Boek een rit
              </Button>
              <Button href="/#vloot" variant="ghost" size="xl">
                <Icon name="car" size={19} />
                Bekijk wagenpark
              </Button>
            </div>

            {/* Trust bar */}
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

          {/* Booking-first kaart */}
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
      <section className="border-t border-line py-16 md:py-24" aria-labelledby="diensten-title">
        <div className="mx-auto max-w-site px-6">
          <ScrollReveal>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-px w-4 bg-accent" />
              Onze diensten
            </p>
            <h2 id="diensten-title" className="mt-4 font-display text-display-lg font-bold text-ink">
              Voor elke rit
              <br />
              <span className="italic text-stone">de juiste service</span>
            </h2>
          </ScrollReveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {diensten.map((d, i) => (
              <ScrollReveal key={d.title} delay={i * 100}>
                <article
                  className={`flex h-full flex-col gap-3 overflow-hidden rounded-card border bg-card p-6 shadow-card transition-transform duration-300 ease-premium hover:-translate-y-1 ${
                    d.featured ? "border-stone-subtle" : "border-line"
                  }`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-accent/5 text-accent">
                    <Icon name={d.icon} size={22} />
                  </div>
                  <h3 className="font-display text-lg font-semibold text-ink">{d.title}</h3>
                  <p className="flex-1 text-sm leading-relaxed text-secondary">{d.text}</p>
                  <ul className="flex flex-col gap-1.5">
                    {d.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-xs text-secondary">
                        <Icon name="check" size={13} className="shrink-0 text-accent" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <a
                    href={d.href}
                    className="mt-auto flex items-center gap-1.5 pt-2 text-xs font-medium uppercase tracking-wider text-accent transition-all hover:gap-2.5"
                  >
                    {d.cta}
                    <Icon name="arrow-right" size={14} />
                  </a>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

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

          {/* Tesla Model Y — vlaggenschip */}
          <ScrollReveal>
            <div className="relative mt-12 overflow-hidden rounded-fleet border border-line bg-card shadow-card-lg">
              <div className="relative w-full">
                <Image
                  src="/tesla_model_y_black.jpg"
                  alt="Tesla Model Y — volledig elektrisch, premium interieur"
                  fill
                  priority={false}
                  sizes="(min-width: 1200px) 1200px, 100vw"
                  className="object-cover saturate-[0.92] contrast-[0.95]"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-[linear-gradient(90deg,rgba(245,243,241,.96),rgba(245,243,241,.72),rgba(245,243,241,.10))]"
                />
                <div className="relative flex min-h-64 flex-col justify-center p-6 md:min-h-[420px] md:p-12">
                  <div className="max-w-[540px]">
                    <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-2 text-xs font-medium text-white">
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-white" />
                      Executive Airport Mobility — actief
                    </span>
                    <h3 className="mt-4 font-display text-3xl font-bold text-ink md:text-4xl">
                      Tesla Model Y
                    </h3>
                    <p className="mt-3 rounded-2xl bg-white/70 p-4 text-sm leading-relaxed text-secondary backdrop-blur-sm md:text-base">
                      Het vlaggenschip van onze vloot. Volledig elektrisch, ruim
                      interieur en een indrukwekkend rijbereik. Zakelijk of
                      particulier — de Tesla Model Y zet de toon.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2.5">
                      {teslaSpecs.map((spec) => (
                        <span
                          key={spec.label}
                          className="flex items-center gap-2 rounded-xl border border-line bg-fog px-3 py-2 text-xs text-ink"
                        >
                          <Icon name={spec.icon} size={15} className="text-accent" />
                          <b className="font-semibold">{spec.val}</b> {spec.label}
                        </span>
                      ))}
                    </div>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <Button href="/boeken">
                        <Icon name="calendar-check" size={17} />
                        Direct boeken
                      </Button>
                      <Button href="/tarieven" variant="ghost">
                        Bekijk tarieven
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ScrollReveal>

          {/* Lynk & Co 01 — secundair */}
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
                <h3 className="mt-4 font-display text-2xl font-bold text-ink md:text-3xl">
                  Lynk &amp; Co 01
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-secondary md:text-base">
                  Plug-in hybride SUV met panoramadak, premium interieur en
                  opvallende uitstraling. Representatief voor elk zakelijk
                  bezoek.
                </p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {[
                    { icon: "bolt", label: "Plug-in Hybrid" },
                    { icon: "users", label: "4 personen" },
                    { icon: "sun", label: "Panoramadak" },
                    { icon: "briefcase", label: "Zakelijk" },
                  ].map((tag) => (
                    <span
                      key={tag.label}
                      className="flex items-center gap-2 rounded-xl border border-line bg-fog px-3 py-2 text-xs text-ink"
                    >
                      <Icon name={tag.icon} size={15} className="text-accent" />
                      {tag.label}
                    </span>
                  ))}
                </div>
                <div className="mt-6">
                  <Button href="/boeken" variant="ghost">
                    <Icon name="calendar-check" size={17} />
                    Boek de Lynk &amp; Co
                  </Button>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ═══ REVIEWS ═══ */}
      <section className="border-t border-line py-16 md:py-24" aria-labelledby="reviews-title">
        <div className="mx-auto max-w-site px-6">
          <ScrollReveal>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-px w-4 bg-accent" />
              Klantbeoordelingen
            </p>
            <h2 id="reviews-title" className="mt-4 font-display text-display-lg font-bold text-ink">
              Wat onze klanten
              <br />
              <span className="italic text-stone">over ons zeggen</span>
            </h2>
            <p className="mt-4 flex items-center gap-2.5 text-sm text-secondary" aria-label="Gemiddelde beoordeling">
              <span className="tracking-[2px] text-accent" aria-label="5 sterren">★★★★★</span>
              <span className="font-display text-xl font-bold text-ink">4.9</span>
              — gebaseerd op 127 beoordelingen
            </p>
          </ScrollReveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {reviews.map((r, i) => (
              <ScrollReveal key={r.name} delay={i * 100}>
                <article
                  className={`flex h-full flex-col gap-3.5 rounded-card border bg-card p-6 shadow-card ${
                    r.featured ? "border-stone-subtle" : "border-line"
                  }`}
                >
                  <header className="flex items-center justify-between">
                    <span className="text-sm tracking-[2px] text-accent" aria-label="5 van 5 sterren">★★★★★</span>
                    <time className="text-xs text-stone" dateTime={r.dateTime}>{r.date}</time>
                  </header>
                  <blockquote className="flex-1 border-l-2 border-accent pl-3.5 text-sm italic leading-relaxed text-ink">
                    &ldquo;{r.quote}&rdquo;
                  </blockquote>
                  <footer className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-fog text-xs font-semibold text-ink"
                    >
                      {r.initials}
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-ink">{r.name}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-stone">
                        <Icon name={r.tripIcon} size={12} />
                        {r.trip}
                      </span>
                    </span>
                    <Icon name="circle-check" size={18} className="ml-auto shrink-0 text-green-600" />
                  </footer>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="border-t border-line bg-[linear-gradient(180deg,#F5F3F1,#FFFFFF)]">
        <div className="mx-auto max-w-site px-6 py-16 text-center md:py-24">
          <ScrollReveal>
            <h2 className="font-display text-display-lg font-bold text-ink">
              Klaar om te vertrekken?
            </h2>
            <p className="mx-auto mt-4 max-w-md text-secondary">
              Vul uw adres in en zie direct uw vaste prijs — transparant en
              binnen de wettelijke maximumtarieven.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Button href="/boeken" size="xl">
                <Icon name="calendar-check" size={19} />
                Boek een rit
              </Button>
              <Button href="https://wa.me/31634744522" variant="ghost" size="xl">
                <Icon name="whatsapp" size={19} />
                WhatsApp ons
              </Button>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
