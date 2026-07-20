import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";

/**
 * REVIEWS UITGESCHAKELD — Sprint 11, Fase 0 (2026-07-20)
 *
 * De hieronder staande citaten en het aggregaat ("4.9 — 127 beoordelingen") zijn niet
 * te herleiden tot een verifieerbare bron: de bookings-tabel bevat nul records en er is
 * geen koppeling met Google Reviews. Onder de Omnibus-richtlijn is het publiceren van
 * niet-verifieerbare klantbeoordelingen in de EU verboden; de ACM handhaaft daarop.
 *
 * De sectie is daarom uitgeschakeld in plaats van verwijderd, zodat hij in één regel
 * terugkomt zodra er een verifieerbare bron is. Voorwaarden om weer aan te zetten:
 *   1. de citaten komen van echte, herleidbare klanten;
 *   2. het aggregaat komt uit een externe bron (Google Business Profile) en wordt
 *      daarnaar gelinkt;
 *   3. het woord "geverifieerde" wordt alleen gebruikt als er ook echt geverifieerd is.
 */
const REVIEWS_ENABLED = false;

const REVIEWS = [
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
    quote: "Lynk & Co voor onze bruiloft — geweldig! Ruim, luxe en de chauffeur hielp zelfs met de jurk. Stijlvol vervoer dat echt bijdraagt aan je grote dag. Topservice van begin tot eind.",
  },
];

/** Reviewsectie. Rendert niets zolang er geen verifieerbare bron is (zie boven). */
export default function ReviewsSection() {
  if (!REVIEWS_ENABLED) return null;

  return (
    <section className="border-t border-line bg-card/60 py-16 md:py-24" aria-labelledby="reviews-title">
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
          {REVIEWS.map((r, i) => (
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
        <ScrollReveal>
          <div className="mt-12 text-center">
            <a
              href="https://g.page/r/review"
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line-strong bg-white/60 px-6 text-sm font-medium text-ink transition-colors hover:bg-white"
            >
              <Icon name="star" size={17} />
              Laat een Google review achter
            </a>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
