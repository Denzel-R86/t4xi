import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";
import { useTranslations } from "next-intl";

const USPS = [
  { icon: "clock", nr: "01", n: 1 },
  { icon: "car", nr: "02", n: 2 },
  { icon: "shield-check", nr: "03", n: 3 },
  { icon: "coin", nr: "04", n: 4 },
] as const;

/** "Waarom T4XI" USP-grid uit het v14-bronbestand (why-section). */
export default function WhySection() {
  const t = useTranslations("waarom");
  return (
    <section className="py-16 md:py-24" aria-labelledby="why-title">
      <div className="mx-auto max-w-site px-6">
        <ScrollReveal>
          <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
            <span aria-hidden="true" className="h-px w-4 bg-accent" />
            {t("kicker")}
          </p>
          <h2 id="why-title" className="mt-4 font-display text-display-lg font-bold text-ink">
            {t("kop1")}
            <br />
            <span className="italic text-stone">{t("kop2")}</span>
          </h2>
        </ScrollReveal>
        <div className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {USPS.map((u, i) => (
            <ScrollReveal key={u.nr} delay={i * 100}>
              <article className="relative h-full overflow-hidden rounded-card border border-line bg-card p-5 shadow-card transition-transform duration-300 ease-premium hover:-translate-y-1 md:p-6">
                <div className="mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-xl border border-line bg-fog text-ink">
                  <Icon name={u.icon} size={24} />
                </div>
                <h3 className="mb-2 font-display text-base font-semibold text-ink">{t(`u${u.n}Titel`)}</h3>
                <p className="text-sm leading-relaxed text-secondary">{t(`u${u.n}Tekst`)}</p>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-3 right-4 font-display text-[56px] font-extrabold leading-none text-ink/[0.04]"
                >
                  {u.nr}
                </span>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
