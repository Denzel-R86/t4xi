import { pageMetadata } from "@/lib/seo-locale";
import { getTranslations } from "next-intl/server";
import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";
import { MembershipForm, StrippenkaartForm, HotelForm } from "@/components/producten/ProductForms";

export function generateMetadata({ params }: { params: { locale: string } }) {
  return pageMetadata(params.locale, "/producten", "productenTitle", "productenDesc");
}

/** Taalneutrale cijfers/iconen; alle tekst komt uit i18n. */
const HERO_STAT_NUMS = ["€279", "€899", "24/7", "4"];
const EVENT_ICONS = ["heart", "building", "plane", "star", "map-pin"];
const EVENT_DETAIL_ICONS = [
  ["clock", "user", "camera"],
  ["users", "receipt", "layout-dashboard"],
  ["plane", "id-badge", "globe"],
  ["user-check", "shield-check", "clock"],
  ["map-pin", "users", "coin"],
];
const MEMBERSHIP_PERK_ICONS = ["check", "clock", "map-pin", "rotate", "x"];
const ZAKELIJK_PERK_ICONS = ["receipt", "users", "chart-bar", "clock", "star"];
const HOTEL_PERK_ICONS = ["building", "layout-dashboard", "receipt", "clock", "star", "chart-bar"];

type Tier = { name: string; price: string; per: string; desc: string; highlight?: boolean };
type EventCopy = { name: string; desc: string; details: string[]; price: string };

function Eyebrow({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 rounded-full border border-line bg-accent/5 px-4 py-2 text-xs font-medium uppercase tracking-[2px] text-accent">
      <Icon name={icon} size={15} />
      {children}
    </p>
  );
}

function Tiers({ tiers, highlightIndex }: { tiers: Tier[]; highlightIndex: number }) {
  return (
    <div className="mt-7 grid gap-3 sm:grid-cols-3">
      {tiers.map((t, i) => (
        <div
          key={t.name}
          className={`rounded-card border bg-card p-4 shadow-card ${i === highlightIndex ? "border-accent" : "border-line"}`}
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-stone">{t.name}</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-accent">
            {t.price}
            <span className="text-xs font-normal text-secondary">{t.per}</span>
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-secondary">{t.desc}</p>
        </div>
      ))}
    </div>
  );
}

function Perks({ perks, icons }: { perks: string[]; icons: string[] }) {
  return (
    <ul className="mt-7 flex flex-col gap-3">
      {perks.map((text, i) => (
        <li key={text} className="flex items-start gap-3 text-sm text-ink">
          <Icon name={icons[i]} size={17} className="mt-0.5 shrink-0 text-accent" />
          {text}
        </li>
      ))}
    </ul>
  );
}

export default async function ProductenPage() {
  const t = await getTranslations("producten");
  const heroStats = t.raw("heroStats") as string[];
  const mTiers = t.raw("mTiers") as Tier[];
  const mPerks = t.raw("mPerks") as string[];
  const mTblHead = t.raw("mTblHead") as string[];
  const mTblRows = t.raw("mTblRows") as string[][];
  const zTiers = t.raw("zTiers") as Tier[];
  const zPerks = t.raw("zPerks") as string[];
  const zTags = t.raw("zTags") as string[];
  const hPerks = t.raw("hPerks") as string[];
  const hSteps = t.raw("hSteps") as string[];
  const events = t.raw("events") as EventCopy[];

  return (
    <>
      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden border-b border-line" aria-labelledby="hero-title">
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(135deg,#F5F3F1_0%,#FFFFFF_54%,#E8E4DE_100%)]" />
        <div className="relative mx-auto max-w-site px-6 pb-14 pt-16 lg:pb-20 lg:pt-24">
          <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
            <span aria-hidden="true" className="h-px w-4 bg-accent" />
            {t("heroKicker")}
          </p>
          <h1 id="hero-title" className="mt-5 max-w-3xl font-display text-display-xl font-bold text-ink">
            {t("heroKop1")}
            <br />
            <span className="italic text-stone">{t("heroKop2")}</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-secondary">
            {t("heroIntro")}
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <a href="#membership" className="inline-flex min-h-[52px] items-center gap-2 rounded-md bg-accent px-8 font-display text-base font-medium text-white shadow-cta transition-colors hover:bg-accent-hover">
              <Icon name="plane" size={18} />
              Airport Membership
            </a>
            <a href="#zakelijk" className="inline-flex min-h-[52px] items-center gap-2 rounded-md border border-line-strong bg-white/60 px-8 font-display text-base font-medium text-ink transition-colors hover:bg-white">
              <Icon name="briefcase" size={18} />
              {t("ctaZakelijk")}
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
      </section>

      {/* ═══ 1. AIRPORT MEMBERSHIP ═══ */}
      <section id="membership" className="scroll-mt-20 border-b border-line bg-card/60 py-16 md:py-24" aria-labelledby="m-title">
        <div className="mx-auto grid max-w-site items-start gap-12 px-6 lg:grid-cols-2">
          <ScrollReveal>
            <Eyebrow icon="plane">Airport Membership</Eyebrow>
            <h2 id="m-title" className="mt-5 font-display text-display-lg font-bold text-ink">
              {t("mKop1")}
              <br />
              <span className="italic text-stone">{t("mKop2")}</span>
            </h2>
            <p className="mt-4 text-secondary">
              {t("mIntro")}
            </p>
            <Tiers tiers={mTiers} highlightIndex={1} />
            <Perks perks={mPerks} icons={MEMBERSHIP_PERK_ICONS} />
            <div className="mt-7 overflow-hidden rounded-card border border-line bg-card shadow-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-stone">
                    <th className="px-4 py-3 font-medium">{mTblHead[0]}</th>
                    <th className="px-4 py-3 font-medium">{mTblHead[1]}</th>
                    <th className="px-4 py-3 font-semibold text-accent">{mTblHead[2]}</th>
                  </tr>
                </thead>
                <tbody className="text-secondary">
                  {mTblRows.map((row, ri) => (
                    <tr key={row[0]} className={ri < mTblRows.length - 1 ? "border-b border-line/60" : ""}>
                      <td className="px-4 py-2.5">{row[0]}</td>
                      <td className="px-4 py-2.5">{row[1]}</td>
                      <td className={`px-4 py-2.5 bg-accent/[0.04] ${row[2] === "✓" ? "text-green-600" : ri >= 2 ? "font-semibold " + (ri === 3 ? "text-accent" : "text-ink") : "text-ink"}`}>
                        {row[2]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={150}>
            <MembershipForm />
          </ScrollReveal>
        </div>
      </section>

      {/* ═══ 2. ZAKELIJKE STRIPPENKAART ═══ */}
      <section id="zakelijk" className="scroll-mt-20 border-b border-line py-16 md:py-24" aria-labelledby="z-title">
        <div className="mx-auto grid max-w-site items-start gap-12 px-6 lg:grid-cols-2">
          <ScrollReveal className="lg:order-2">
            <Eyebrow icon="briefcase">{t("zEyebrow")}</Eyebrow>
            <h2 id="z-title" className="mt-5 font-display text-display-lg font-bold text-ink">
              {t("zKop1")}
              <br />
              <span className="italic text-stone">{t("zKop2")}</span>
            </h2>
            <p className="mt-4 text-secondary">
              {t("zIntro")}
            </p>
            <Tiers tiers={zTiers} highlightIndex={1} />
            <Perks perks={zPerks} icons={ZAKELIJK_PERK_ICONS} />
            <div className="mt-7 rounded-card border border-line bg-card p-5 shadow-card">
              <p className="mb-3 text-[11px] uppercase tracking-[3px] text-accent">{t("zIdeaal")}</p>
              <div className="flex flex-wrap gap-2">
                {zTags.map((tag) => (
                  <span key={tag} className="rounded-full border border-line bg-fog px-3 py-1.5 text-xs text-secondary">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={150} className="lg:order-1">
            <StrippenkaartForm />
          </ScrollReveal>
        </div>
      </section>

      {/* ═══ 3. HOTELCONTRACT ═══ */}
      <section id="hotel" className="scroll-mt-20 border-b border-line bg-card/60 py-16 md:py-24" aria-labelledby="h-title">
        <div className="mx-auto grid max-w-site items-start gap-12 px-6 lg:grid-cols-2">
          <ScrollReveal>
            <Eyebrow icon="building">{t("hEyebrow")}</Eyebrow>
            <h2 id="h-title" className="mt-5 font-display text-display-lg font-bold text-ink">
              {t("hKop1")}
              <br />
              <span className="italic text-stone">{t("hKop2")}</span>
            </h2>
            <p className="mt-4 text-secondary">
              {t("hIntro")}
            </p>
            <Perks perks={hPerks} icons={HOTEL_PERK_ICONS} />
            <div className="mt-7 rounded-card border border-line bg-card p-5 shadow-card">
              <p className="mb-4 text-[11px] uppercase tracking-[2px] text-accent">{t("hHoe")}</p>
              <ol className="flex flex-col gap-3">
                {hSteps.map((s, i) => (
                  <li key={s} className="flex items-start gap-3.5 text-[13px] text-secondary">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line bg-accent/10 text-[11px] font-bold text-accent">
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={150}>
            <HotelForm />
          </ScrollReveal>
        </div>
      </section>

      {/* ═══ 4. EVENT SHUTTLES ═══ */}
      <section id="event" className="scroll-mt-20 py-16 md:py-24" aria-labelledby="e-title">
        <div className="mx-auto max-w-site px-6">
          <ScrollReveal>
            <Eyebrow icon="confetti">{t("eEyebrow")}</Eyebrow>
            <h2 id="e-title" className="mt-5 font-display text-display-lg font-bold text-ink">
              {t("eKop1")}
              <br />
              <span className="italic text-stone">{t("eKop2")}</span>
            </h2>
            <p className="mt-4 max-w-2xl text-secondary">
              {t("eIntro")}
            </p>
          </ScrollReveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((ev, i) => (
              <ScrollReveal key={ev.name} delay={i * 80}>
                <article className="flex h-full flex-col gap-3 rounded-card border border-line bg-card p-6 shadow-card">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-accent/5 text-accent">
                    <Icon name={EVENT_ICONS[i]} size={22} />
                  </span>
                  <h3 className="font-display text-lg font-semibold text-ink">{ev.name}</h3>
                  <p className="flex-1 text-sm leading-relaxed text-secondary">{ev.desc}</p>
                  <ul className="flex flex-col gap-1.5">
                    {ev.details.map((text, di) => (
                      <li key={text} className="flex items-center gap-2 text-xs text-secondary">
                        <Icon name={EVENT_DETAIL_ICONS[i][di]} size={13} className="shrink-0 text-accent" />
                        {text}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 border-t border-line pt-3 text-sm font-semibold text-accent">{ev.price}</p>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
