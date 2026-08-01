import { pageMetadata } from "@/lib/seo-locale";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import renders from "@/public/renders.jpg";
import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";
import { EarningsCalculator, PartnerSignupForm } from "@/components/partner/PartnerInteractive";

export function generateMetadata({ params }: { params: { locale: string } }) {
  return pageMetadata(params.locale, "/partner", "partnerTitle", "partnerDesc");
}

/** Vaste, taalneutrale structuur (icons, cijfers, booleans). Tekst komt uit i18n. */
const HERO_STAT_NUMS = ["90%+", "5", "24/7", "€0"];
const STAP_META = [
  { nr: "01", icon: "file-invoice" },
  { nr: "02", icon: "shield-check" },
  { nr: "03", icon: "bell" },
  { nr: "04", icon: "coin" },
];
const PLAN_META = [
  { name: "Starter", price: "€0", features: [true, true, true, true, false, false, false] },
  { name: "Pro", price: "€99", features: [true, true, true, true, true, true, false], popular: true },
  { name: "Elite", price: "€199", features: [true, true, true, true, true, true, false] },
  { name: "Fleet", price: "€299", fleet: true },
] as const;
const TOOL_ICONS = [
  "layout-dashboard", "bell", "coin", "users", "receipt", "chart-bar", "star", "headset",
];
const VEREIST_ICONS = ["id-badge", "shield-check", "car", "file-invoice", "building", "device-mobile"];

type StapCopy = { titel: string; text?: string; tekst: string };
type NameDesc = { name: string; desc: string };
type TitleText = { title: string; text: string };

async function SectionHead({
  eyebrow, line1, line2, sub, id,
}: { eyebrow: string; line1: string; line2: string; sub?: string; id?: string }) {
  return (
    <ScrollReveal>
      <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
        <span aria-hidden="true" className="h-px w-4 bg-accent" />
        {eyebrow}
      </p>
      <h2 id={id} className="mt-4 font-display text-display-lg font-bold text-ink">
        {line1}
        <br />
        <span className="italic text-stone">{line2}</span>
      </h2>
      {sub && <p className="mt-4 max-w-2xl text-secondary">{sub}</p>}
    </ScrollReveal>
  );
}

export default async function PartnerPage() {
  const t = await getTranslations("partner");
  const heroStats = t.raw("heroStats") as string[];
  const stappen = t.raw("stappen") as StapCopy[];
  const commissies = t.raw("commissies") as string[];
  const earns = t.raw("earns") as string[];
  const fleetFeatures = t.raw("fleetFeatures") as string[];
  const planFeatures = t.raw("planFeatures") as string[];
  const tools = t.raw("tools") as NameDesc[];
  const vereisten = t.raw("vereisten") as TitleText[];
  const tableRows = t.raw("tableRows") as string[][];
  const checklist = t.raw("formChecklist") as string[];
  const earnRows = t.raw("earnRows") as { val: string; label: string }[];

  return (
    <>
      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden border-b border-line" aria-labelledby="hero-title">
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(135deg,#F5F3F1_0%,#FFFFFF_54%,#E8E4DE_100%)]" />
        <div className="relative mx-auto grid max-w-site items-center gap-12 px-6 pb-14 pt-16 lg:grid-cols-2 lg:pb-20 lg:pt-24">
          <div>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-px w-4 bg-accent" />
              {t("heroKicker")}
            </p>
            <h1 id="hero-title" className="mt-5 font-display text-display-xl font-bold text-ink">
              {t("heroKop1")}
              <br />
              {t("heroKop2pre")} <span className="italic text-stone">{t("heroKop2em")}</span>
            </h1>
            <p className="mt-6 max-w-xl text-secondary">
              {t("heroIntro")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#pakketten" className="inline-flex min-h-[52px] items-center gap-2 rounded-md bg-accent px-8 font-display text-base font-medium text-white shadow-cta transition-colors hover:bg-accent-hover">
                <Icon name="rocket" size={18} />
                {t("ctaPakketten")}
              </a>
              <a href="#calculator" className="inline-flex min-h-[52px] items-center gap-2 rounded-md border border-line-strong bg-white/60 px-8 font-display text-base font-medium text-ink transition-colors hover:bg-white">
                <Icon name="calculator" size={18} />
                {t("ctaBereken")}
              </a>
            </div>
            <div className="mt-10 flex flex-wrap gap-8 rounded-card border border-line bg-white/80 px-6 py-5 shadow-card">
              {heroStats.map((label, i) => (
                <div key={label}>
                  <div className="font-display text-[26px] font-bold leading-none text-accent">{HERO_STAT_NUMS[i]}</div>
                  <div className="mt-1.5 text-xs text-secondary">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="overflow-hidden rounded-card border border-line shadow-card-lg">
              <Image
                src={renders}
                alt="T4XI vloot — Tesla Model Y en Lynk & Co 01"
                width={1200}
                height={675}
                priority
                placeholder="blur"
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="h-auto w-full object-cover"
              />
            </div>
            {/* Verdienst-vergelijking */}
            <div className="mt-4 rounded-card border border-line bg-white/85 p-5 shadow-card" aria-label={t("compareLabel")}>
              <p className="flex items-center gap-2 text-sm font-bold text-ink">
                <Icon name="x" size={15} className="text-red-500" />
                {t("compareAnder")}
              </p>
              <div className="mt-2 h-9 overflow-hidden rounded-full border border-line bg-fog">
                <div className="flex h-full w-full text-[11px] font-bold">
                  <span className="flex w-[65%] items-center justify-center bg-stone-subtle text-ink">{t("compareChauffeur")} €51,35</span>
                  <span className="flex w-[35%] items-center justify-center bg-red-400/70 text-white">{t("comparePlatform")} €27,65</span>
                </div>
              </div>
              <p className="mt-1.5 text-xs text-secondary">{t("compareAnderSub")}</p>

              <p className="mt-4 flex items-center gap-2 text-sm font-bold text-ink">
                <Icon name="check" size={15} className="text-accent" />
                {t("compareT4xi")}
              </p>
              <div className="mt-2 h-9 overflow-hidden rounded-full border border-line bg-fog">
                <div className="flex h-full w-full text-[11px] font-bold">
                  <span className="flex w-[88%] items-center justify-center bg-accent text-white">{t("compareChauffeur")} €69,52</span>
                  <span className="flex w-[12%] items-center justify-center bg-stone-subtle text-ink">€9,48</span>
                </div>
              </div>
              <p className="mt-1.5 text-xs text-secondary">
                <strong className="text-ink">{t("compareMeer")}</strong>{t("compareMeerNa")}
              </p>
              <p className="mt-4 rounded-xl border border-line bg-fog px-4 py-3 text-center">
                <span className="font-display text-[26px] font-bold text-accent">{t("compareBadge")}</span>
                <span className="ml-2 text-[13px] text-secondary">{t("compareBadgeNa")}</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ HOE HET WERKT ═══ */}
      <section className="border-b border-line bg-card/60 py-16 md:py-24">
        <div className="mx-auto max-w-site px-6">
          <SectionHead eyebrow={t("hoeEyebrow")} line1={t("hoeKop1")} line2={t("hoeKop2")} />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stappen.map((s, i) => (
              <ScrollReveal key={STAP_META[i].nr} delay={i * 100}>
                <article className="relative h-full overflow-hidden rounded-card border border-line bg-card p-6 shadow-card">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-accent/5 text-accent">
                    <Icon name={STAP_META[i].icon} size={22} />
                  </span>
                  <h3 className="mb-2 mt-4 font-display text-base font-semibold text-ink">{s.titel}</h3>
                  <p className="text-sm leading-relaxed text-secondary">{s.tekst}</p>
                  <span aria-hidden="true" className="pointer-events-none absolute bottom-3 right-4 font-display text-[56px] font-extrabold leading-none text-ink/[0.04]">
                    {STAP_META[i].nr}
                  </span>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PAKKETTEN ═══ */}
      <section id="pakketten" className="scroll-mt-20 py-16 md:py-24" aria-labelledby="plan-title">
        <div className="mx-auto max-w-site px-6">
          <SectionHead
            id="plan-title" eyebrow={t("pakEyebrow")} line1={t("pakKop1")} line2={t("pakKop2")}
            sub={t("pakSub")}
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLAN_META.map((p, pi) => {
              const popular = "popular" in p && p.popular;
              return (
              <ScrollReveal key={p.name}>
                <article className={`relative flex h-full flex-col rounded-card border bg-card p-6 shadow-card ${popular ? "border-accent" : "border-line"}`}>
                  {popular && (
                    <span className="absolute -top-3 left-6 rounded-full bg-accent px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                      {t("meestGekozen")}
                    </span>
                  )}
                  <p className="text-xs font-semibold uppercase tracking-[2px] text-stone">{p.name}</p>
                  <p className="mt-2 font-display text-3xl font-bold text-ink">
                    {p.price}
                    <span className="text-sm font-normal text-secondary">/{t("perMaand")}</span>
                  </p>
                  <p className="mt-1 text-xs font-semibold text-accent">{commissies[pi]}</p>
                  <p className="mt-2 text-xs text-secondary">
                    {("fleet" in p && p.fleet ? t("fleetEarn") : t("ritten75"))} × €79 → <strong className="text-ink">{earns[pi]}</strong>
                  </p>
                  <ul className="mt-4 flex flex-1 flex-col gap-2">
                    {("fleet" in p && p.fleet ? fleetFeatures : planFeatures).map((f, fi) => {
                      const on = "fleet" in p && p.fleet ? true : ("features" in p ? p.features[fi] : false);
                      return (
                        <li key={f} className={`flex items-center gap-2 text-xs ${on ? "text-secondary" : "text-stone/60"}`}>
                          <Icon name={on ? "check" : "minus"} size={13} className={`shrink-0 ${on ? "text-accent" : "text-stone/50"}`} />
                          {f}
                        </li>
                      );
                    })}
                  </ul>
                  <a
                    href="#aanmelden"
                    className={`mt-5 flex min-h-11 items-center justify-center rounded-md text-sm font-medium transition-colors ${
                      popular
                        ? "bg-accent text-white shadow-cta hover:bg-accent-hover"
                        : "border border-line-strong bg-white/60 text-ink hover:bg-white"
                    }`}
                  >
                    {t("kies")} {p.name}
                  </a>
                </article>
              </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ CALCULATOR ═══ */}
      <section id="calculator" className="scroll-mt-20 border-t border-line bg-card/60 py-16 md:py-24" aria-labelledby="calc-title">
        <div className="mx-auto max-w-site px-6">
          <SectionHead id="calc-title" eyebrow={t("calcEyebrow")} line1={t("calcKop1")} line2={t("calcKop2")} />
          <ScrollReveal>
            <div className="mt-12">
              <EarningsCalculator />
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ═══ CHAUFFEURSTOOL ═══ */}
      <section id="chauffeurstool" className="py-16 md:py-24" aria-labelledby="ct-title">
        <div className="mx-auto max-w-site px-6">
          <SectionHead
            id="ct-title" eyebrow={t("ctEyebrow")} line1={t("ctKop1")} line2={t("ctKop2")}
            sub={t("ctSub")}
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tools.map((tool, i) => (
              <ScrollReveal key={tool.name} delay={i * 60}>
                <article className="h-full rounded-card border border-line bg-card p-5 shadow-card">
                  <Icon name={TOOL_ICONS[i]} size={22} className="text-accent" />
                  <h3 className="mb-1.5 mt-3 font-display text-[15px] font-semibold text-ink">{tool.name}</h3>
                  <p className="text-[13px] leading-relaxed text-secondary">{tool.desc}</p>
                </article>
              </ScrollReveal>
            ))}
          </div>

          {/* Pakket-vergelijkingstabel */}
          <ScrollReveal>
            <div className="mt-14 overflow-hidden rounded-card border border-line bg-card shadow-card">
              <p className="border-b border-line px-6 py-4 text-[11px] uppercase tracking-[3px] text-accent">
                {t("tableTitel")}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-stone">
                      <th className="px-5 py-3 font-medium">{t("tableFeature")}</th>
                      <th className="px-5 py-3 font-medium">Starter<br /><span className="font-light">€0 + 20%</span></th>
                      <th className="px-5 py-3 font-semibold text-accent">Pro<br /><span className="font-light">€99 + 12%</span></th>
                      <th className="px-5 py-3 font-medium">Elite<br /><span className="font-light">€199 + 8%</span></th>
                      <th className="px-5 py-3 font-medium">Fleet<br /><span className="font-light">€299 + 5%</span></th>
                    </tr>
                  </thead>
                  <tbody className="text-secondary">
                    {tableRows.map((row) => (
                      <tr key={row[0]} className="border-b border-line/60 last:border-0">
                        {row.map((cell, ci) => (
                          <td
                            key={ci}
                            className={`px-5 py-2.5 ${ci === 2 ? "bg-accent/[0.04] font-medium text-ink" : ""} ${cell === "✓" ? "text-green-600" : ""}`}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-line px-6 py-5 text-center">
                <a href="#aanmelden" className="inline-flex min-h-[48px] items-center gap-2 rounded-md bg-accent px-8 font-display text-sm font-medium text-white shadow-cta transition-colors hover:bg-accent-hover">
                  <Icon name="send" size={16} />
                  {t("tableCta")}
                </a>
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ═══ VEREISTEN ═══ */}
      <section className="border-t border-line bg-card/60 py-16 md:py-24" aria-labelledby="req-title">
        <div className="mx-auto max-w-site px-6">
          <SectionHead
            id="req-title" eyebrow={t("reqEyebrow")} line1={t("reqKop1")} line2={t("reqKop2")}
            sub={t("reqSub")}
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vereisten.map((v, i) => (
              <ScrollReveal key={v.title} delay={i * 60}>
                <div className="flex h-full items-start gap-4 rounded-card border border-line bg-card p-5 shadow-card">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-accent/5 text-accent">
                    <Icon name={VEREIST_ICONS[i]} size={20} />
                  </span>
                  <div>
                    <h3 className="font-display text-[15px] font-semibold text-ink">{v.title}</h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-secondary">{v.text}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ AANMELDEN ═══ */}
      <section id="aanmelden" className="scroll-mt-20 border-t border-line py-16 md:py-24" aria-labelledby="form-title">
        <div className="mx-auto grid max-w-site items-start gap-12 px-6 lg:grid-cols-2">
          <ScrollReveal>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-px w-4 bg-accent" />
              {t("formEyebrow")}
            </p>
            <h2 id="form-title" className="mt-4 font-display text-display-lg font-bold text-ink">
              {t("formKop1")}
              <br />
              <span className="italic text-stone">{t("formKop2")}</span>
            </h2>
            <p className="mt-4 max-w-xl text-secondary">
              {t("formIntro")}
            </p>
            <ul className="mt-7 flex flex-col gap-3">
              {checklist.map((text, i) => (
                <li key={text} className="flex items-center gap-3 text-sm text-ink">
                  <Icon name={["clock", "coin", "shield-check", "car", "x"][i]} size={16} className="shrink-0 text-accent" />
                  {text}
                </li>
              ))}
            </ul>
            <div className="mt-8 rounded-card border border-line bg-card p-5 shadow-card">
              <p className="mb-4 text-[10px] uppercase tracking-[3px] text-accent">{t("earnBlokLabel")}</p>
              <div className="grid grid-cols-2 gap-4">
                {earnRows.map((r, i) => (
                  <div key={r.label}>
                    <div className={`font-display text-[22px] font-bold ${i === 1 ? "text-accent" : "text-ink"}`}>{r.val}</div>
                    <div className="text-[11px] text-secondary">{r.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={150}>
            <PartnerSignupForm />
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
