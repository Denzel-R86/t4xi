import Link from "next/link";
import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";

const FAIR_POINTS = [
  { icon: "coin", text: "Transparante vaste prijs — geen surge pricing" },
  { icon: "heart", text: "Gemotiveerde chauffeur die eerlijk verdient" },
  { icon: "map-pin", text: "Lokaal bedrijf — geld blijft in Nederland" },
  { icon: "award", text: "Kwaliteitsservice, geen anoniem platform" },
];

/** "Eerlijk platform"-banner uit het v14-bronbestand (fair-band). */
export default function FairBand() {
  return (
    <section
      className="border-y border-line bg-[linear-gradient(180deg,#FFFFFF_0%,#F5F3F1_100%)] py-16 md:py-24"
      aria-labelledby="fair-title"
    >
      <div className="mx-auto grid max-w-site items-center gap-8 px-6 lg:grid-cols-[1.1fr_.9fr]">
        <ScrollReveal>
          <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
            <span aria-hidden="true" className="h-px w-4 bg-accent" />
            Onze belofte
          </p>
          <h2 id="fair-title" className="mt-4 font-display text-display-lg font-bold text-ink">
            Jij betaalt eerlijk.
            <br />
            <span className="italic text-stone">De chauffeur verdient eerlijk.</span>
          </h2>
          <p className="mt-4 max-w-[680px] text-[17px] leading-[1.75] text-secondary">
            Bij veel grote platformen gaat een aanzienlijk deel van de ritprijs
            naar commissie en platformkosten. T4XI kiest voor een eerlijker
            model: transparante prijzen, lokale service en een chauffeur die
            normaal kan verdienen.
          </p>

          <div className="mt-7 grid gap-4 md:grid-cols-2">
            <div className="rounded-card border border-[rgba(31,39,48,0.12)] bg-white p-5 shadow-card">
              <p className="mb-3.5 flex items-center gap-2 font-bold text-ink">
                <Icon name="x" size={17} className="text-stone" /> Andere platforms
              </p>
              <div className="h-12 overflow-hidden rounded-full border border-line bg-fog">
                <div className="flex h-full w-full">
                  <span className="flex w-[65%] items-center justify-center bg-stone-subtle text-[13px] font-extrabold text-ink">65%</span>
                  <span className="flex w-[35%] items-center justify-center bg-accent text-[13px] font-extrabold text-white">35%</span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-secondary">
                <span><span aria-hidden="true" className="mr-1.5 inline-block h-[9px] w-[9px] rounded-full bg-stone-subtle" />Chauffeur</span>
                <span><span aria-hidden="true" className="mr-1.5 inline-block h-[9px] w-[9px] rounded-full bg-accent" />Platform afdracht</span>
              </div>
            </div>
            <div className="rounded-card border border-[rgba(31,39,48,0.12)] bg-white p-5 shadow-card">
              <p className="mb-3.5 flex items-center gap-2 font-bold text-ink">
                <Icon name="check" size={17} className="text-accent" /> T4XI.nl
              </p>
              <div className="h-12 overflow-hidden rounded-full border border-line bg-fog">
                <div className="flex h-full w-full">
                  <span className="flex w-[90%] items-center justify-center bg-accent text-[13px] font-extrabold text-white">90%+</span>
                  <span className="flex w-[10%] min-w-16 items-center justify-center bg-stone-subtle text-[13px] font-extrabold text-ink">≤10%</span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-secondary">
                <span><span aria-hidden="true" className="mr-1.5 inline-block h-[9px] w-[9px] rounded-full bg-stone-subtle" />Chauffeur</span>
                <span><span aria-hidden="true" className="mr-1.5 inline-block h-[9px] w-[9px] rounded-full bg-accent" />T4XI (operationele kosten)</span>
              </div>
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={150}>
          <div className="rounded-card border border-[rgba(31,39,48,0.12)] bg-white p-6 shadow-card md:p-7">
            <Icon name="quote" size={32} className="text-accent opacity-40" />
            <p className="mt-3 text-lg leading-[1.7] text-ink">
              &ldquo;Wij bouwen T4XI rond de ritervaring: een nette auto,
              duidelijke communicatie, vaste prijzen en een chauffeur die met
              aandacht rijdt. Eerlijk voor de klant én eerlijk voor de
              chauffeur.&rdquo;
            </p>
            <div className="mt-6 border-t border-line pt-5">
              <p className="mb-4 text-eyebrow font-medium uppercase text-accent">
                Wat dit betekent voor jou
              </p>
              <ul className="grid gap-3">
                {FAIR_POINTS.map((p) => (
                  <li key={p.text} className="flex items-start gap-2.5 text-sm text-secondary">
                    <Icon name={p.icon} size={17} className="mt-0.5 shrink-0 text-accent" />
                    {p.text}
                  </li>
                ))}
              </ul>
            </div>
            <Link
              href="/boeken"
              className="mt-6 flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-accent text-sm font-medium text-white shadow-cta transition-colors hover:bg-accent-hover"
            >
              <Icon name="calendar-check" size={16} />
              Boek eerlijk vervoer
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
