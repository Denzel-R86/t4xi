import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";
import { useTranslations } from "next-intl";
import { stegaClean } from "next-sanity";
import type { CmsServicesPage } from "@/sanity/types";

const USPS = [
  { assuranceType: "flight", icon: "clock", nr: "01", n: 1 },
  { assuranceType: "fleet", icon: "car", nr: "02", n: 2 },
  { assuranceType: "drivers", icon: "shield-check", nr: "03", n: 3 },
  { assuranceType: "pricing", icon: "coin", nr: "04", n: 4 },
] as const;

const ASSURANCE_ICONS = {
  flight: "clock",
  fleet: "car",
  drivers: "shield-check",
  pricing: "coin",
} as const;

function assuranceIcon(value: string): string {
  const assuranceType = stegaClean(value) as keyof typeof ASSURANCE_ICONS;
  return ASSURANCE_ICONS[assuranceType] ?? "shield-check";
}

/** "Waarom T4XI" USP-grid uit het v14-bronbestand (why-section). */
export default function WhySection({ content }: { content?: CmsServicesPage | null }) {
  const t = useTranslations("waarom");
  const assurances = content
    ? content.assurances.map((assurance, index) => ({
        _key: assurance._key,
        icon: assuranceIcon(assurance.assuranceType),
        nr: String(index + 1).padStart(2, "0"),
        title: assurance.title,
        explanation: assurance.explanation,
      }))
    : USPS.map((assurance) => ({
        _key: `fallback-${assurance.assuranceType}`,
        icon: assurance.icon,
        nr: assurance.nr,
        title: t(`u${assurance.n}Titel`),
        explanation: t(`u${assurance.n}Tekst`),
      }));
  const intro = content?.assurancesIntro;

  return (
    <section className="py-16 md:py-24" aria-labelledby="why-title">
      <div className="mx-auto max-w-site px-6">
        <ScrollReveal>
          <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
            <span aria-hidden="true" className="h-px w-4 bg-accent" />
            {intro?.eyebrow ?? t("kicker")}
          </p>
          <h2 id="why-title" className="mt-4 font-display text-display-lg font-bold text-ink">
            {intro?.headline ?? t("kop1")}
            <br />
            <span className="italic text-stone">{intro?.headlineConclusion ?? t("kop2")}</span>
          </h2>
          {intro && (
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-secondary md:text-base">
              {intro.introduction}
            </p>
          )}
        </ScrollReveal>
        <div className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {assurances.map((assurance, i) => (
            <ScrollReveal key={assurance._key} delay={i * 100}>
              <article className="relative h-full overflow-hidden rounded-card border border-line bg-card p-5 shadow-card transition-transform duration-300 ease-premium hover:-translate-y-1 md:p-6">
                <div className="mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-xl border border-line bg-fog text-ink">
                  <Icon name={assurance.icon} size={24} />
                </div>
                <h3 className="mb-2 font-display text-base font-semibold text-ink">{assurance.title}</h3>
                <p className="text-sm leading-relaxed text-secondary">{assurance.explanation}</p>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-3 right-4 font-display text-[56px] font-extrabold leading-none text-ink/[0.04]"
                >
                  {assurance.nr}
                </span>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
