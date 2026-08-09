import { Link } from "@/i18n/navigation";
import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";
import { cleanCmsOptionalText, safeCmsInternalHref } from "@/lib/cms/safe-content";
import { useTranslations } from "next-intl";
import type { CmsServicesPage } from "@/sanity/types";

const PUNTEN = [
  { icon: "file-invoice", n: 1 },
  { icon: "user-check", n: 2 },
  { icon: "repeat", n: 3 },
  { icon: "building", n: 4 },
] as const;

const FEATURES = ["f1", "f2", "f3", "f4", "f5", "f6"] as const;

/** Zakelijke klanten-sectie uit het v14-bronbestand. */
export default function ZakelijkSection({ content }: { content?: CmsServicesPage | null }) {
  const t = useTranslations("zakelijk");
  const business = content?.business;
  const intro = business?.intro;
  const benefits = business
    ? business.benefits.map((benefit, index) => ({
        _key: benefit._key,
        icon: PUNTEN[index]?.icon ?? "briefcase",
        title: benefit.title,
        explanation: benefit.explanation,
      }))
    : PUNTEN.map((benefit) => ({
        _key: `fallback-${benefit.n}`,
        icon: benefit.icon,
        title: t(`p${benefit.n}Titel`),
        explanation: t(`p${benefit.n}Sub`),
      }));
  const accountFeatures = business
    ? business.accountFeatures.map((feature, index) => ({
        key: `cms-${index}`,
        label: feature,
      }))
    : FEATURES.map((feature) => ({ key: feature, label: t(feature) }));
  const primaryAction = business
    ? {
        label: business.primaryAction.label,
        href: safeCmsInternalHref(business.primaryAction.href),
        accessibleLabel: cleanCmsOptionalText(business.primaryAction.accessibleLabel),
      }
    : { label: t("contactCta"), href: "/contact", accessibleLabel: undefined };
  const accountAction = business
    ? {
        label: business.accountAction.label,
        href: safeCmsInternalHref(business.accountAction.href),
        accessibleLabel: cleanCmsOptionalText(business.accountAction.accessibleLabel),
      }
    : { label: t("aanvragen"), href: "/contact", accessibleLabel: undefined };

  return (
    <section className="border-t border-line py-16 md:py-24" aria-labelledby="zakelijk-title">
      <div className="mx-auto grid max-w-site items-start gap-12 px-6 lg:grid-cols-2 lg:gap-16">
        <ScrollReveal>
          <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
            <span aria-hidden="true" className="h-px w-4 bg-accent" />
            {intro?.eyebrow ?? t("kicker")}
          </p>
          <h2 id="zakelijk-title" className="mt-4 font-display text-display-lg font-bold text-ink">
            {intro?.headline ?? t("kop1")}
            <br />
            <span className="italic text-stone">{intro?.headlineConclusion ?? t("kop2")}</span>
          </h2>
          <p className="mt-4 max-w-xl text-secondary">
            {intro?.introduction ?? t("intro")}
          </p>
          <ul className="mt-8 flex flex-col gap-5">
            {benefits.map((benefit) => (
              <li key={benefit._key} className="flex items-start gap-4">
                <Icon name={benefit.icon} size={20} className="mt-0.5 shrink-0 text-accent" />
                <div>
                  <strong className="block font-medium text-ink">{benefit.title}</strong>
                  <span className="text-sm text-secondary">{benefit.explanation}</span>
                </div>
              </li>
            ))}
          </ul>
          <Link
            href={primaryAction.href}
            aria-label={primaryAction.accessibleLabel}
            className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-6 text-sm font-medium text-white shadow-cta transition-colors hover:bg-accent-hover"
          >
            <Icon name="mail" size={16} />
            {primaryAction.label}
          </Link>
        </ScrollReveal>

        <ScrollReveal delay={150}>
          <div className="relative overflow-hidden rounded-card border border-stone-subtle bg-card p-6 shadow-card md:p-7">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent opacity-50"
            />
            <p className="mb-5 flex items-center gap-2.5 text-xs uppercase tracking-[2px] text-accent">
              <Icon name="trending-up" size={16} />
              {business?.accountTitle ?? t("accountKop")}
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {accountFeatures.map((feature) => (
                <p key={feature.key} className="flex items-center gap-2 text-sm text-ink">
                  <Icon name="check" size={14} className="shrink-0 text-green-600" />
                  {feature.label}
                </p>
              ))}
            </div>
            <div aria-hidden="true" className="my-5 h-px bg-line" />
            {!business && (
              <p className="text-xs leading-relaxed text-secondary">
                {t("vertrouwen")}
              </p>
            )}
            <Link
              href={accountAction.href}
              aria-label={accountAction.accessibleLabel}
              className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-accent text-sm font-medium text-white shadow-cta transition-colors hover:bg-accent-hover"
            >
              <Icon name="arrow-right" size={16} />
              {accountAction.label}
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
