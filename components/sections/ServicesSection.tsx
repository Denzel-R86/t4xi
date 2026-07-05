import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";

const DIENSTEN = [
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
    href: "/contact",
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
    href: "/contact",
  },
];

/** Dienstengrid uit het v14-bronbestand (#diensten). */
export default function ServicesSection({ id = "diensten" }: { id?: string }) {
  return (
    <section id={id} className="border-t border-line py-16 md:py-24" aria-labelledby="diensten-title">
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
          {DIENSTEN.map((d, i) => (
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
  );
}
