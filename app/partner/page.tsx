import type { Metadata } from "next";
import Image from "next/image";
import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";
import { EarningsCalculator, PartnerSignupForm } from "@/components/partner/PartnerInteractive";

export const metadata: Metadata = {
  title: "Partner worden",
  description:
    "Word chauffeurspartner van T4XI. 90%+ van elke rit naar jou, onboarding in 5 dagen, wekelijkse uitbetaling. Kies je pakket vanaf €0/maand.",
  alternates: { canonical: "/partner" },
};

const HERO_STATS = [
  { num: "90%+", label: "Naar chauffeur" },
  { num: "5", label: "Dagen onboarding" },
  { num: "24/7", label: "Support" },
  { num: "€0", label: "Instap mogelijk" },
];

const STAPPEN = [
  { nr: "01", icon: "file-invoice", title: "Aanmelden", text: "Vul het formulier in met je gegevens, voertuig en gewenste pakket. Wij nemen binnen 24 uur contact op." },
  { nr: "02", icon: "shield-check", title: "Screening & onboarding", text: "VOG-check, voertuigkeuring en een korte introductie. In 3–5 werkdagen ben je volledig operationeel." },
  { nr: "03", icon: "bell", title: "Ritaanbiedingen ontvangen", text: "Via het dashboard ontvang je directe ritaanbiedingen in jouw regio. Accepteren met één tik." },
  { nr: "04", icon: "coin", title: "Wekelijks uitbetaald", text: "Elke week automatische uitbetaling. Transparant overzicht per rit, geen verborgen inhoudingen." },
];

const PLANNEN = [
  {
    name: "Starter", price: "€0", commission: "20% commissie per rit", earn: "€4.661/maand",
    features: [true, true, true, true, false, false, false],
  },
  {
    name: "Pro", price: "€99", commission: "12% commissie per rit", earn: "€5.134/maand",
    features: [true, true, true, true, true, true, false], popular: true,
  },
  {
    name: "Elite", price: "€199", commission: "8% commissie per rit", earn: "€5.424/maand",
    features: [true, true, true, true, true, true, false],
  },
  {
    name: "Fleet", price: "€299", commission: "5% commissie · meerdere auto's", earn: "€16.726/maand", fleetEarn: "225 ritten",
    features: null,
    fleetFeatures: ["Alles van Elite", "Meerdere voertuigen", "Fleet dashboard", "Dedicated account manager", "B2B contracten toegang", "Maandfactuur klanten", "Co-branded marketing"],
  },
];

const PLAN_FEATURES = [
  "Directe ritaanbiedingen", "Eigen dashboard", "Wekelijkse uitbetaling",
  "Gratis onboarding", "Prioriteitsritten", "Zakelijke klanten", "Fleet dashboard",
];

const TOOLS = [
  { icon: "layout-dashboard", name: "Eigen Dashboard", desc: "Ritten beheren, klanten bijhouden, beschikbaarheid instellen. Alles via mobiel of desktop." },
  { icon: "bell", name: "Ritaanbiedingen", desc: "Ontvang directe ritaanbiedingen in uw regio. Accepteer met één tik, weiger zonder gevolgen." },
  { icon: "coin", name: "Wekelijkse Uitbetaling", desc: "Elke week automatisch uitbetaald. Transparant overzicht per rit, geen verrassingen." },
  { icon: "users", name: "Eigen Klanten", desc: "Vaste klanten die via T4XI boeken worden aan u gekoppeld. Uw relatie, ons platform." },
  { icon: "receipt", name: "Facturen & Admin", desc: "Automatische ritfacturen, maandoverzicht voor uw boekhouder en BTW-rapportage." },
  { icon: "chart-bar", name: "Omzetinzicht", desc: "Zie hoeveel u verdient per dag, week en maand. Vergelijk met vorige periodes." },
  { icon: "star", name: "Klantbeoordelingen", desc: "Bouw een reputatie op via verified reviews. Hogere score = meer prioriteitsritten." },
  { icon: "headset", name: "Support", desc: "Directe support via WhatsApp. Geen ticketsysteem, geen wachttijden — een echte persoon." },
];

const VEREISTEN = [
  { icon: "id-badge", title: "Chauffeurskaart (CCV)", text: "Verplicht in Nederland voor betaald personenvervoer." },
  { icon: "shield-check", title: "VOG-verklaring", text: "Verklaring Omtrent Gedrag — wij helpen bij aanvragen." },
  { icon: "car", title: "Goedgekeurd voertuig", text: "Max. 4 jaar oud, schoon en gekeurd. Eigen auto of lease." },
  { icon: "file-invoice", title: "Taxivergunning (TCA)", text: "Verplicht voor openbaar taxivervoer. Wij ondersteunen bij aanvraag." },
  { icon: "building", title: "KVK-inschrijving", text: "Als zzp'er of via eigen bv. Helpen wij bij indien nodig." },
  { icon: "device-mobile", title: "Smartphone", text: "Android of iPhone voor het T4XI chauffeursdashboard." },
];

function SectionHead({ eyebrow, line1, line2, sub, id }: { eyebrow: string; line1: string; line2: string; sub?: string; id?: string }) {
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

export default function PartnerPage() {
  return (
    <>
      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden border-b border-line" aria-labelledby="hero-title">
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(135deg,#F5F3F1_0%,#FFFFFF_54%,#E8E4DE_100%)]" />
        <div className="relative mx-auto grid max-w-site items-center gap-12 px-6 pb-14 pt-16 lg:grid-cols-2 lg:pb-20 lg:pt-24">
          <div>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-px w-4 bg-accent" />
              Word partner van T4XI
            </p>
            <h1 id="hero-title" className="mt-5 font-display text-display-xl font-bold text-ink">
              Rij meer.
              <br />
              Verdien <span className="italic text-stone">eerlijk.</span>
            </h1>
            <p className="mt-6 max-w-xl text-secondary">
              Bij andere taxiplatforms verdwijnt tot 35% van elke rit naar het
              platform. Bij T4XI rijdt het geld direct naar jou. Kies je pakket,
              meld je aan, en rij al binnen 5 werkdagen.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#pakketten" className="inline-flex min-h-[52px] items-center gap-2 rounded-md bg-accent px-8 font-display text-base font-medium text-white shadow-cta transition-colors hover:bg-accent-hover">
                <Icon name="rocket" size={18} />
                Bekijk pakketten
              </a>
              <a href="#calculator" className="inline-flex min-h-[52px] items-center gap-2 rounded-md border border-line-strong bg-white/60 px-8 font-display text-base font-medium text-ink transition-colors hover:bg-white">
                <Icon name="calculator" size={18} />
                Bereken je verdienst
              </a>
            </div>
            <div className="mt-10 flex flex-wrap gap-8 rounded-card border border-line bg-white/80 px-6 py-5 shadow-card">
              {HERO_STATS.map((s) => (
                <div key={s.label}>
                  <div className="font-display text-[26px] font-bold leading-none text-accent">{s.num}</div>
                  <div className="mt-1.5 text-xs text-secondary">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="overflow-hidden rounded-card border border-line shadow-card-lg">
              <Image
                src="/renders.jpg"
                alt="T4XI vloot — Tesla Model Y en Lynk & Co 01"
                width={1200}
                height={675}
                className="h-auto w-full object-cover"
              />
            </div>
            {/* Verdienst-vergelijking */}
            <div className="mt-4 rounded-card border border-line bg-white/85 p-5 shadow-card" aria-label="Vergelijking verdienst chauffeur">
              <p className="flex items-center gap-2 text-sm font-bold text-ink">
                <Icon name="x" size={15} className="text-red-500" />
                Andere platforms — rit van €79
              </p>
              <div className="mt-2 h-9 overflow-hidden rounded-full border border-line bg-fog">
                <div className="flex h-full w-full text-[11px] font-bold">
                  <span className="flex w-[65%] items-center justify-center bg-stone-subtle text-ink">Chauffeur €51,35</span>
                  <span className="flex w-[35%] items-center justify-center bg-red-400/70 text-white">Platform €27,65</span>
                </div>
              </div>
              <p className="mt-1.5 text-xs text-secondary">35% verdwijnt naar een buitenlands platform</p>

              <p className="mt-4 flex items-center gap-2 text-sm font-bold text-ink">
                <Icon name="check" size={15} className="text-accent" />
                T4XI Pro — zelfde rit van €79
              </p>
              <div className="mt-2 h-9 overflow-hidden rounded-full border border-line bg-fog">
                <div className="flex h-full w-full text-[11px] font-bold">
                  <span className="flex w-[88%] items-center justify-center bg-accent text-white">Chauffeur €69,52</span>
                  <span className="flex w-[12%] items-center justify-center bg-stone-subtle text-ink">€9,48</span>
                </div>
              </div>
              <p className="mt-1.5 text-xs text-secondary">
                <strong className="text-ink">€18,17 meer per rit</strong> — bij 75 ritten/maand = +€1.363
              </p>
              <p className="mt-4 rounded-xl border border-line bg-fog px-4 py-3 text-center">
                <span className="font-display text-[26px] font-bold text-accent">+€1.363</span>
                <span className="ml-2 text-[13px] text-secondary">extra per maand met T4XI Pro</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ HOE HET WERKT ═══ */}
      <section className="border-b border-line bg-card/60 py-16 md:py-24">
        <div className="mx-auto max-w-site px-6">
          <SectionHead eyebrow="Zo simpel werkt het" line1="Van aanmelding" line2="tot eerste rit" />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STAPPEN.map((s, i) => (
              <ScrollReveal key={s.nr} delay={i * 100}>
                <article className="relative h-full overflow-hidden rounded-card border border-line bg-card p-6 shadow-card">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-accent/5 text-accent">
                    <Icon name={s.icon} size={22} />
                  </span>
                  <h3 className="mb-2 mt-4 font-display text-base font-semibold text-ink">{s.title}</h3>
                  <p className="text-sm leading-relaxed text-secondary">{s.text}</p>
                  <span aria-hidden="true" className="pointer-events-none absolute bottom-3 right-4 font-display text-[56px] font-extrabold leading-none text-ink/[0.04]">
                    {s.nr}
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
            id="plan-title" eyebrow="Kies je pakket" line1="Verdien eerlijk," line2="kies wat past"
            sub="Geen instapkosten als je klein wilt beginnen. Schaal op zodra je meer ritten maakt — lagere commissie = meer in jouw zak."
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLANNEN.map((p) => (
              <ScrollReveal key={p.name}>
                <article className={`relative flex h-full flex-col rounded-card border bg-card p-6 shadow-card ${p.popular ? "border-accent" : "border-line"}`}>
                  {p.popular && (
                    <span className="absolute -top-3 left-6 rounded-full bg-accent px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                      Meest gekozen
                    </span>
                  )}
                  <p className="text-xs font-semibold uppercase tracking-[2px] text-stone">{p.name}</p>
                  <p className="mt-2 font-display text-3xl font-bold text-ink">
                    {p.price}
                    <span className="text-sm font-normal text-secondary">/maand</span>
                  </p>
                  <p className="mt-1 text-xs font-semibold text-accent">{p.commission}</p>
                  <p className="mt-2 text-xs text-secondary">
                    {p.fleetEarn ?? "75 ritten"} × €79 → <strong className="text-ink">{p.earn}</strong>
                  </p>
                  <ul className="mt-4 flex flex-1 flex-col gap-2">
                    {(p.fleetFeatures ?? PLAN_FEATURES).map((f, fi) => {
                      const on = p.fleetFeatures ? true : p.features?.[fi];
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
                      p.popular
                        ? "bg-accent text-white shadow-cta hover:bg-accent-hover"
                        : "border border-line-strong bg-white/60 text-ink hover:bg-white"
                    }`}
                  >
                    Kies {p.name}
                  </a>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CALCULATOR ═══ */}
      <section id="calculator" className="scroll-mt-20 border-t border-line bg-card/60 py-16 md:py-24" aria-labelledby="calc-title">
        <div className="mx-auto max-w-site px-6">
          <SectionHead id="calc-title" eyebrow="Bereken jouw verdienst" line1="Hoeveel kun jij" line2="verdienen?" />
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
            id="ct-title" eyebrow="Chauffeurstool" line1="Uw platform," line2="uw gereedschap"
            sub="T4XI is ook een betaalde tool voor professionele chauffeurs. Geen hoge commissie, wel een volledig digitaal platform om uw taxibedrijf te runnen — boekingen, betalingen, klanten en rapporten op één plek."
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TOOLS.map((t, i) => (
              <ScrollReveal key={t.name} delay={i * 60}>
                <article className="h-full rounded-card border border-line bg-card p-5 shadow-card">
                  <Icon name={t.icon} size={22} className="text-accent" />
                  <h3 className="mb-1.5 mt-3 font-display text-[15px] font-semibold text-ink">{t.name}</h3>
                  <p className="text-[13px] leading-relaxed text-secondary">{t.desc}</p>
                </article>
              </ScrollReveal>
            ))}
          </div>

          {/* Pakket-vergelijkingstabel */}
          <ScrollReveal>
            <div className="mt-14 overflow-hidden rounded-card border border-line bg-card shadow-card">
              <p className="border-b border-line px-6 py-4 text-[11px] uppercase tracking-[3px] text-accent">
                Kies uw abonnement
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-stone">
                      <th className="px-5 py-3 font-medium">Feature</th>
                      <th className="px-5 py-3 font-medium">Starter<br /><span className="font-light">€0 + 20%</span></th>
                      <th className="px-5 py-3 font-semibold text-accent">Pro<br /><span className="font-light">€99 + 12%</span></th>
                      <th className="px-5 py-3 font-medium">Elite<br /><span className="font-light">€199 + 8%</span></th>
                      <th className="px-5 py-3 font-medium">Fleet<br /><span className="font-light">€299 + 5%</span></th>
                    </tr>
                  </thead>
                  <tbody className="text-secondary">
                    {[
                      ["Ritaanbiedingen", "✓", "✓", "✓", "✓"],
                      ["Eigen dashboard", "✓", "✓", "✓", "✓"],
                      ["Wekelijkse uitbetaling", "✓", "✓", "✓", "✓"],
                      ["Prioriteitsritten", "✕", "✓", "✓", "✓"],
                      ["Zakelijke klanten", "✕", "✓", "✓", "✓"],
                      ["Fleet dashboard", "✕", "✕", "✕", "✓"],
                      ["Account manager", "✕", "✕", "✕", "✓"],
                      ["Verdienst bij 75 ritten (€79)", "€4.661", "€5.134", "€5.424", "€5.576"],
                    ].map((row) => (
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
                  Nu aanmelden als chauffeur
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
            id="req-title" eyebrow="Wat heb je nodig" line1="Vereisten om" line2="te rijden"
            sub="T4XI werkt alleen met gecertificeerde, gescreende chauffeurs. Dat beschermt jou én onze klanten."
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {VEREISTEN.map((v, i) => (
              <ScrollReveal key={v.title} delay={i * 60}>
                <div className="flex h-full items-start gap-4 rounded-card border border-line bg-card p-5 shadow-card">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-accent/5 text-accent">
                    <Icon name={v.icon} size={20} />
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
              Direct aanmelden
            </p>
            <h2 id="form-title" className="mt-4 font-display text-display-lg font-bold text-ink">
              Klaar om
              <br />
              <span className="italic text-stone">te starten?</span>
            </h2>
            <p className="mt-4 max-w-xl text-secondary">
              Vul het formulier in — wij nemen binnen 24 uur contact op voor een
              kennismakingsgesprek en lopen de onboarding met je door.
            </p>
            <ul className="mt-7 flex flex-col gap-3">
              {[
                { icon: "clock", text: "Onboarding in 3–5 werkdagen" },
                { icon: "coin", text: "Wekelijkse uitbetaling, geen wachttijd" },
                { icon: "shield-check", text: "VOG-screening verplicht — kwaliteitsborging" },
                { icon: "car", text: "Eigen voertuig of vloot — beide welkom" },
                { icon: "x", text: "Altijd opzegbaar — geen jaarcontract" },
              ].map((li) => (
                <li key={li.text} className="flex items-center gap-3 text-sm text-ink">
                  <Icon name={li.icon} size={16} className="shrink-0 text-accent" />
                  {li.text}
                </li>
              ))}
            </ul>
            <div className="mt-8 rounded-card border border-line bg-card p-5 shadow-card">
              <p className="mb-4 text-[10px] uppercase tracking-[3px] text-accent">Bij 75 ritten × €79</p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { val: "€4.661", label: "Starter" },
                  { val: "€5.134", label: "Pro ✓ aanbevolen", accent: true },
                  { val: "€5.424", label: "Elite" },
                  { val: "€5.576", label: "Fleet" },
                ].map((r) => (
                  <div key={r.label}>
                    <div className={`font-display text-[22px] font-bold ${r.accent ? "text-accent" : "text-ink"}`}>{r.val}</div>
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
