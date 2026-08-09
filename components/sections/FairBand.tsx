import { Link } from "@/i18n/navigation";
import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";
import { useTranslations } from "next-intl";

const FAIR_POINTS = [
  { icon: "coin", key: "punt1" },
  { icon: "heart", key: "punt2" },
  { icon: "map-pin", key: "punt3" },
  { icon: "award", key: "punt4" },
] as const;

/** "Eerlijk platform"-banner uit het v14-bronbestand (fair-band). */
export default function FairBand() {
  const t = useTranslations("fair");
  return (
    <section
      className="border-y border-line bg-[linear-gradient(180deg,#FFFFFF_0%,#F5F3F1_100%)] py-16 md:py-24"
      aria-labelledby="fair-title"
    >
      <div className="mx-auto grid max-w-site items-center gap-8 px-6 lg:grid-cols-[1.1fr_.9fr]">
        <ScrollReveal>
          <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
            <span aria-hidden="true" className="h-px w-4 bg-accent" />
            {t("kicker")}
          </p>
          <h2 id="fair-title" className="mt-4 font-display text-display-lg font-bold text-ink">
            {t("kop1")}
            <br />
            <span className="italic text-stone">{t("kop2")}</span>
          </h2>
          <p className="mt-4 max-w-[680px] text-[17px] leading-[1.75] text-secondary">
            {t("intro")}
          </p>

          <div className="mt-7 grid gap-4 md:grid-cols-2">
            <div className="rounded-card border border-[rgba(31,39,48,0.12)] bg-white p-5 shadow-card">
              <p className="mb-3.5 flex items-center gap-2 font-bold text-ink">
                <Icon name="x" size={17} className="text-stone" /> {t("anderePlatforms")}
              </p>
              <div className="h-12 overflow-hidden rounded-full border border-line bg-fog">
                <div className="flex h-full w-full">
                  <span className="flex w-[65%] items-center justify-center bg-stone-subtle text-[13px] font-extrabold text-ink">65%</span>
                  <span className="flex w-[35%] items-center justify-center bg-accent text-[13px] font-extrabold text-white">35%</span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-secondary">
                <span><span aria-hidden="true" className="mr-1.5 inline-block h-[9px] w-[9px] rounded-full bg-stone-subtle" />{t("chauffeur")}</span>
                <span><span aria-hidden="true" className="mr-1.5 inline-block h-[9px] w-[9px] rounded-full bg-accent" />{t("platformAfdracht")}</span>
              </div>
            </div>
            <div className="rounded-card border border-[rgba(31,39,48,0.12)] bg-white p-5 shadow-card">
              <p className="mb-3.5 flex items-center gap-2 font-bold text-ink">
                <Icon name="check" size={17} className="text-accent" /> T4XI Starter
              </p>
              <div className="h-12 overflow-hidden rounded-full border border-line bg-fog">
                <div className="flex h-full w-full">
                  <span className="flex w-[80%] items-center justify-center bg-accent text-[13px] font-extrabold text-white">80%</span>
                  <span className="flex w-[20%] min-w-16 items-center justify-center bg-stone-subtle text-[13px] font-extrabold text-ink">20%</span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-secondary">
                <span><span aria-hidden="true" className="mr-1.5 inline-block h-[9px] w-[9px] rounded-full bg-accent" />{t("chauffeur")}</span>
                <span><span aria-hidden="true" className="mr-1.5 inline-block h-[9px] w-[9px] rounded-full bg-stone-subtle" />{t("t4xiKosten")}</span>
              </div>
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={150}>
          <div className="rounded-card border border-[rgba(31,39,48,0.12)] bg-white p-6 shadow-card md:p-7">
            <Icon name="quote" size={32} className="text-accent opacity-40" />
            <p className="mt-3 text-lg leading-[1.7] text-ink">
              {t("citaat")}
            </p>
            <div className="mt-6 border-t border-line pt-5">
              <p className="mb-4 text-eyebrow font-medium uppercase text-accent">
                {t("watBetekent")}
              </p>
              <ul className="grid gap-3">
                {FAIR_POINTS.map((p) => (
                  <li key={p.key} className="flex items-start gap-2.5 text-sm text-secondary">
                    <Icon name={p.icon} size={17} className="mt-0.5 shrink-0 text-accent" />
                    {t(p.key)}
                  </li>
                ))}
              </ul>
            </div>
            <Link
              href="/boeken"
              className="mt-6 flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-accent text-sm font-medium text-white shadow-cta transition-colors hover:bg-accent-hover"
            >
              <Icon name="calendar-check" size={16} />
              {t("cta")}
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
