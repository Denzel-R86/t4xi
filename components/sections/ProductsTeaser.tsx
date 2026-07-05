import Link from "next/link";
import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";

const PRODUCTS = [
  {
    icon: "plane",
    name: "Airport Membership",
    desc: "Onbeperkte Schiphol-transfers voor een vast maandbedrag. Nooit meer nadenken over boeken.",
    from: "Vanaf €149/maand",
    href: "/producten#membership",
  },
  {
    icon: "briefcase",
    name: "Zakelijke Strippenkaart",
    desc: "Prepaid ritcredits voor uw bedrijf. Altijd een rit beschikbaar, één factuur per maand.",
    from: "Vanaf €499 (10 ritten)",
    href: "/producten#zakelijk",
  },
  {
    icon: "building",
    name: "Hotelcontract",
    desc: "Vaste transferpartner voor uw hotel of aparthotel. Gasten boeken direct via uw concierge.",
    from: "Op maat — bel ons",
    href: "/producten#hotel",
  },
  {
    icon: "confetti",
    name: "Event Shuttle",
    desc: "Bruiloften, congressen, bedrijfsevents. Meerdere ritten, één aanspreekpunt, één factuur.",
    from: "Offerte op aanvraag",
    href: "/producten#event",
  },
];

/** Mobiliteitsproducten-teaser uit het v14-bronbestand. */
export default function ProductsTeaser() {
  return (
    <section className="border-t border-line bg-card/60 py-16 md:py-24" aria-labelledby="products-title">
      <div className="mx-auto max-w-site px-6">
        <ScrollReveal>
          <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
            <span aria-hidden="true" className="h-px w-4 bg-accent" />
            Meer dan losse ritten
          </p>
          <h2 id="products-title" className="mt-4 font-display text-display-lg font-bold text-ink">
            Vaste mobiliteit,
            <br />
            <span className="italic text-stone">voorspelbare kosten</span>
          </h2>
          <p className="mt-4 max-w-2xl text-secondary">
            T4XI verkoopt niet alleen losse ritten — wij bouwen vaste
            mobiliteitsproducten voor reizigers, bedrijven en hotels.
          </p>
        </ScrollReveal>
        <ScrollReveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PRODUCTS.map((p) => (
              <Link
                key={p.name}
                href={p.href}
                className="group flex h-full flex-col gap-3 rounded-card border border-line bg-card p-6 shadow-card transition-transform duration-300 ease-premium hover:-translate-y-1"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-accent/5 text-accent">
                  <Icon name={p.icon} size={22} />
                </span>
                <span className="font-display text-lg font-semibold text-ink">{p.name}</span>
                <span className="flex-1 text-sm leading-relaxed text-secondary">{p.desc}</span>
                <span className="text-sm font-semibold text-accent">{p.from}</span>
              </Link>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link
              href="/producten"
              className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-md bg-accent px-10 font-display text-base font-medium text-white shadow-cta transition-all hover:-translate-y-0.5 hover:bg-accent-hover"
            >
              <Icon name="sparkles" size={19} />
              Bekijk alle mobiliteitsproducten
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
