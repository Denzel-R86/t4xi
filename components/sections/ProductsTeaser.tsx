import { Link } from "@/i18n/navigation";
import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";
import { useTranslations } from "next-intl";

const PRODUCTS = [
  { icon: "plane", nameKey: "p1Naam", descKey: "p1Desc", fromKey: "p1Van", href: "/producten#membership" },
  { icon: "briefcase", nameKey: "p2Naam", descKey: "p2Desc", fromKey: "p2Van", href: "/producten#zakelijk" },
  { icon: "building", nameKey: "p3Naam", descKey: "p3Desc", fromKey: "p3Van", href: "/producten#hotel" },
  { icon: "confetti", nameKey: "p4Naam", descKey: "p4Desc", fromKey: "p4Van", href: "/producten#event" },
] as const;

/** Mobiliteitsproducten-teaser uit het v14-bronbestand. */
export default function ProductsTeaser() {
  const t = useTranslations("producten.teaser");
  return (
    <section className="border-t border-line bg-card/60 py-16 md:py-24" aria-labelledby="products-title">
      <div className="mx-auto max-w-site px-6">
        <ScrollReveal>
          <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
            <span aria-hidden="true" className="h-px w-4 bg-accent" />
            {t("kicker")}
          </p>
          <h2 id="products-title" className="mt-4 font-display text-display-lg font-bold text-ink">
            {t("kop1")}
            <br />
            <span className="italic text-stone">{t("kop2")}</span>
          </h2>
          <p className="mt-4 max-w-2xl text-secondary">
            {t("intro")}
          </p>
        </ScrollReveal>
        <ScrollReveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PRODUCTS.map((p) => (
              <Link
                key={p.nameKey}
                href={p.href}
                className="group flex h-full flex-col gap-3 rounded-card border border-line bg-card p-6 shadow-card transition-transform duration-300 ease-premium hover:-translate-y-1"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-accent/5 text-accent">
                  <Icon name={p.icon} size={22} />
                </span>
                <span className="font-display text-lg font-semibold text-ink">{t(p.nameKey)}</span>
                <span className="flex-1 text-sm leading-relaxed text-secondary">{t(p.descKey)}</span>
                <span className="text-sm font-semibold text-accent">{t(p.fromKey)}</span>
              </Link>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link
              href="/producten"
              className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-md bg-accent px-10 font-display text-base font-medium text-white shadow-cta transition-all hover:-translate-y-0.5 hover:bg-accent-hover"
            >
              <Icon name="sparkles" size={19} />
              {t("alle")}
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
