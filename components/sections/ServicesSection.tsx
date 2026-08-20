import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";
import { Link } from "@/i18n/navigation";
import { cleanCmsOptionalText, safeCmsInternalHref } from "@/lib/cms/safe-content";
import { useTranslations } from "next-intl";
import { stegaClean } from "next-sanity";
import type { CmsServicesPage } from "@/sanity/types";

const DIENSTEN = [
  { icon: "plane", n: 1, href: "/boeken", featured: true },
  { icon: "briefcase", n: 2, href: "/zakelijk-vervoer", featured: false },
  { icon: "user", n: 3, href: "/boeken", featured: false },
  { icon: "confetti", n: 4, href: "/contact", featured: false },
] as const;

const SERVICE_PRESENTATION = {
  airport: { icon: "plane", href: "/boeken", featured: true },
  business: { icon: "briefcase", href: "/zakelijk-vervoer", featured: false },
  private: { icon: "user", href: "/boeken", featured: false },
  event: { icon: "confetti", href: "/contact", featured: false },
} as const;

function servicePresentation(value: string) {
  const serviceType = stegaClean(value) as keyof typeof SERVICE_PRESENTATION;
  return SERVICE_PRESENTATION[serviceType] ?? {
    icon: "car",
    href: "/contact",
    featured: false,
  };
}

/** Dienstengrid uit het v14-bronbestand (#diensten). */
export default function ServicesSection({
  id = "diensten",
  content,
}: {
  id?: string;
  content?: CmsServicesPage | null;
}) {
  const t = useTranslations("diensten");
  const services = content
    ? content.services.map((service) => {
        const presentation = servicePresentation(service.serviceType);
        const serviceType = stegaClean(service.serviceType);
        return {
          _key: service._key,
          title: service.title,
          description: service.summary,
          features: service.benefits,
          ctaLabel: service.action.label,
          // De zakelijke route is onderdeel van de applicatie-architectuur, niet
          // redactionele copy. Oude Sanity-documenten wijzen nog naar /contact;
          // houd deze ene bestemming daarom autoritatief in de presentation map.
          ctaHref: serviceType === "business"
            ? presentation.href
            : safeCmsInternalHref(service.action.href, presentation.href),
          ctaAccessibleLabel: cleanCmsOptionalText(service.action.accessibleLabel),
          icon: presentation.icon,
          featured: presentation.featured,
        };
      })
    : DIENSTEN.map((service) => ({
        _key: `fallback-${service.n}`,
        title: t(`d${service.n}Titel`),
        description: t(`d${service.n}Tekst`),
        features: ([1, 2, 3] as const).map((feature) => t(`d${service.n}F${feature}`)),
        ctaLabel: t(`d${service.n}Cta`),
        ctaHref: service.href,
        ctaAccessibleLabel: undefined,
        icon: service.icon,
        featured: service.featured,
      }));

  const intro = content?.intro;

  return (
    <section id={id} className="border-t border-line py-16 md:py-24" aria-labelledby="diensten-title">
      <div className="mx-auto max-w-site px-6">
        <ScrollReveal>
          <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
            <span aria-hidden="true" className="h-px w-4 bg-accent" />
            {intro?.eyebrow ?? t("kicker")}
          </p>
          <h1 id="diensten-title" className="mt-4 font-display text-display-lg font-bold text-ink">
            {intro?.headline ?? t("kop1")}
            <br />
            <span className="italic text-stone">{intro?.headlineConclusion ?? t("kop2")}</span>
          </h1>
          {intro && (
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-secondary md:text-base">
              {intro.introduction}
            </p>
          )}
        </ScrollReveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service, i) => (
            <ScrollReveal key={service._key} delay={i * 100}>
              <article
                className={`flex h-full flex-col gap-3 overflow-hidden rounded-card border bg-card p-6 shadow-card transition-transform duration-300 ease-premium hover:-translate-y-1 ${
                  service.featured ? "border-stone-subtle" : "border-line"
                }`}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-accent/5 text-accent">
                  <Icon name={service.icon} size={22} />
                </div>
                <h3 className="font-display text-lg font-semibold text-ink">{service.title}</h3>
                <p className="flex-1 text-sm leading-relaxed text-secondary">{service.description}</p>
                <ul className="flex flex-col gap-1.5">
                  {service.features.map((feature) => (
                    <li key={stegaClean(feature)} className="flex items-center gap-2 text-xs text-secondary">
                      <Icon name="check" size={13} className="shrink-0 text-accent" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href={service.ctaHref}
                  aria-label={service.ctaAccessibleLabel}
                  className="mt-auto flex items-center gap-1.5 pt-2 text-xs font-medium uppercase tracking-wider text-accent transition-all hover:gap-2.5"
                >
                  {service.ctaLabel}
                  <Icon name="arrow-right" size={14} />
                </Link>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
