import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";
import { useTranslations } from "next-intl";

const DIENSTEN = [
  { icon: "plane", n: 1, href: "/boeken", featured: true },
  { icon: "briefcase", n: 2, href: "/contact", featured: false },
  { icon: "user", n: 3, href: "/boeken", featured: false },
  { icon: "confetti", n: 4, href: "/contact", featured: false },
] as const;

/** Dienstengrid uit het v14-bronbestand (#diensten). */
export default function ServicesSection({ id = "diensten" }: { id?: string }) {
  const t = useTranslations("diensten");
  return (
    <section id={id} className="border-t border-line py-16 md:py-24" aria-labelledby="diensten-title">
      <div className="mx-auto max-w-site px-6">
        <ScrollReveal>
          <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
            <span aria-hidden="true" className="h-px w-4 bg-accent" />
            {t("kicker")}
          </p>
          <h1 id="diensten-title" className="mt-4 font-display text-display-lg font-bold text-ink">
            {t("kop1")}
            <br />
            <span className="italic text-stone">{t("kop2")}</span>
          </h1>
        </ScrollReveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DIENSTEN.map((d, i) => (
            <ScrollReveal key={d.n} delay={i * 100}>
              <article
                className={`flex h-full flex-col gap-3 overflow-hidden rounded-card border bg-card p-6 shadow-card transition-transform duration-300 ease-premium hover:-translate-y-1 ${
                  d.featured ? "border-stone-subtle" : "border-line"
                }`}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-accent/5 text-accent">
                  <Icon name={d.icon} size={22} />
                </div>
                <h3 className="font-display text-lg font-semibold text-ink">{t(`d${d.n}Titel`)}</h3>
                <p className="flex-1 text-sm leading-relaxed text-secondary">{t(`d${d.n}Tekst`)}</p>
                <ul className="flex flex-col gap-1.5">
                  {([1, 2, 3] as const).map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-secondary">
                      <Icon name="check" size={13} className="shrink-0 text-accent" />
                      {t(`d${d.n}F${f}`)}
                    </li>
                  ))}
                </ul>
                <a
                  href={d.href}
                  className="mt-auto flex items-center gap-1.5 pt-2 text-xs font-medium uppercase tracking-wider text-accent transition-all hover:gap-2.5"
                >
                  {t(`d${d.n}Cta`)}
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
