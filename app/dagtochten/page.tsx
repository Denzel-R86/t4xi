import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";
import RoutesExplorer, { FeaturedDetailsButton } from "@/components/dagtochten/RoutesExplorer";
import { COUNTRIES, FEATURED } from "@/lib/dagtochten";

export const metadata: Metadata = {
  title: "Dagtochten",
  description:
    "Toeristische dagtochten vanuit Amsterdam, Almere en Rotterdam naar België, Nederland, Duitsland en Luxemburg. Deur-tot-deur, vaste all-in prijs.",
  alternates: { canonical: "/dagtochten" },
};

const FLAGS = [
  { flag: "🇳🇱", name: "Nederland" },
  { flag: "🇧🇪", name: "België" },
  { flag: "🇱🇺", name: "Luxemburg" },
  { flag: "🇩🇪", name: "Duitsland" },
];

export default function DagtochtenPage() {
  return (
    <>
      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden border-b border-line" aria-label="Dagtochten introductie">
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(135deg,#F5F3F1_0%,#FFFFFF_54%,#E8E4DE_100%)]" />
        <div className="relative mx-auto max-w-4xl px-6 pb-14 pt-16 text-center lg:pb-20 lg:pt-24">
          <p className="flex items-center justify-center gap-3 text-eyebrow font-medium uppercase text-accent">
            <span aria-hidden="true" className="h-px w-8 bg-accent/40" />
            Vanuit Amsterdam, Almere &amp; Rotterdam
            <span aria-hidden="true" className="h-px w-8 bg-accent/40" />
          </p>
          <h1 className="mt-5 font-display text-display-xl font-bold text-ink">
            Ontdek Europa
            <br />
            <em className="font-playfair italic text-accent">op uw eigen tempo</em>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-secondary">
            Laat T4XI u comfortabel brengen naar de mooiste bestemmingen in de
            Benelux en Duitsland. Culinaire steden, historische kernen en
            verborgen parels — allemaal in één dag.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-2.5">
            {FLAGS.map((f) => (
              <span key={f.name} className="flex items-center gap-2 rounded-full border border-line bg-white/70 px-4 py-2 text-sm text-ink">
                <span aria-hidden="true">{f.flag}</span>
                {f.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FEATURED: BRUGGE ═══ */}
      <section className="py-14 md:py-20" aria-labelledby="featured-titel">
        <div className="mx-auto max-w-site px-6">
          <ScrollReveal>
            <div className="grid overflow-hidden rounded-fleet border border-line bg-card shadow-card-lg lg:grid-cols-2">
              <div className="p-7 md:p-10">
                <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-2 text-xs font-medium text-white">
                  <Icon name="star" size={13} />
                  Meest geboekt
                </span>
                <p className="mb-3 mt-4 text-[11px] uppercase tracking-[3px] text-accent">
                  {FEATURED.flag} {FEATURED.countryName}
                </p>
                <h2 id="featured-titel" className="font-playfair text-[34px] font-bold leading-tight text-ink md:text-[40px]">
                  {FEATURED.name} —{" "}
                  <em className="italic text-accent">{FEATURED.title}</em>
                </h2>
                <p className="mt-3 text-sm leading-[1.8] text-secondary">{FEATURED.desc}</p>
                <ul className="mb-8 mt-7 flex flex-col gap-2.5">
                  {FEATURED.points.map((p) => (
                    <li key={p.text} className="flex items-center gap-3 text-sm text-ink">
                      <Icon name={p.icon} size={17} className="shrink-0 text-accent" />
                      {p.text}
                    </li>
                  ))}
                </ul>
                <div className="flex gap-4">
                  <FeaturedDetailsButton />
                  <Link
                    href="/boeken"
                    className="flex min-h-11 flex-1 items-center justify-center rounded-md bg-accent text-sm font-medium text-white shadow-cta transition-colors hover:bg-accent-hover"
                  >
                    Boek nu
                  </Link>
                </div>
              </div>
              <div aria-hidden="true" className="flex min-h-56 items-center justify-center bg-[linear-gradient(135deg,#EEEAE5,#DDD7CE)] text-[120px] lg:text-[160px]">
                {FEATURED.emoji}
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ═══ REISGEBIEDEN ═══ */}
      <section className="border-y border-line bg-card/60 py-14 md:py-16" aria-label="Onze reisgebieden">
        <div className="mx-auto max-w-site px-6">
          <ScrollReveal>
            <div className="mb-12 text-center">
              <p className="flex items-center justify-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
                Onze reisgebieden
              </p>
              <h2 className="mt-4 font-display text-display-lg font-bold text-ink">
                Vier landen,
                <br />
                <em className="font-playfair italic text-stone">eindeloos veel mooie plekken</em>
              </h2>
            </div>
          </ScrollReveal>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {COUNTRIES.map((c, i) => (
              <ScrollReveal key={c.name} delay={i * 100}>
                <div className="h-full rounded-card border border-line bg-card p-6 shadow-card">
                  <div aria-hidden="true" className="text-4xl">{c.flag}</div>
                  <h3 className="mt-3 font-display text-lg font-semibold text-ink">{c.name}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-secondary">{c.desc}</p>
                  <p className="mt-3 text-xs font-semibold text-accent">{c.count}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ ROUTES ═══ */}
      <section id="routes" className="py-16 md:py-24" aria-labelledby="routes-titel">
        <div className="mx-auto max-w-site px-6">
          <ScrollReveal>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-px w-4 bg-accent" />
              Alle dagtochten
            </p>
            <h2 id="routes-titel" className="mt-4 font-display text-display-lg font-bold text-ink">
              Kies uw <em className="font-playfair italic text-stone">droombestemming</em>
            </h2>
            <p className="mt-4 max-w-3xl text-[15px] leading-[1.8] text-secondary">
              Alle routes vertrekken vanuit Amsterdam, Almere of Rotterdam en
              kunnen worden gecombineerd met een retourrit of meerdaagse trip.
            </p>
            <p className="mb-10 mt-4 max-w-3xl rounded-xl border border-line bg-card px-4 py-3.5 text-sm font-medium leading-[1.7] text-ink">
              Tarieven zijn opnieuw berekend als realistische all-in dagtarieven
              op basis van retourkilometers, wachttijd, dagdeel-inzet van de
              chauffeur, voertuigkosten, planning en beschikbaarheid. Maximaal 4
              passagiers exclusief chauffeur. Adviesbagage: 2 grote koffers + 2
              handbagage bij 4 passagiers, of 3 grote koffers bij maximaal 3
              passagiers.
            </p>
          </ScrollReveal>
          <RoutesExplorer />
        </div>
      </section>

      {/* ═══ OP MAAT ═══ */}
      <section className="border-t border-line bg-card/60 py-16 md:py-24" aria-labelledby="custom-titel">
        <div className="mx-auto grid max-w-site items-start gap-12 px-6 lg:grid-cols-2">
          <ScrollReveal>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-px w-4 bg-accent" />
              Op maat gemaakte tour
            </p>
            <h2 id="custom-titel" className="mt-4 font-display text-display-lg font-bold text-ink">
              Uw eigen <em className="font-playfair italic text-stone">droomroute</em>
            </h2>
            <p className="mt-4 max-w-xl text-[15px] leading-[1.8] text-secondary">
              Heeft u een specifieke bestemming of combinatie in gedachten die
              niet in ons standaard aanbod staat? Wij stellen graag een route op
              maat samen — inclusief gids, lunchtips en verborgen pareltjes.
            </p>
            <ul className="mt-7 flex flex-col gap-3">
              {[
                "Multi-dag trips mogelijk",
                "Meerdere stops op één dag",
                "Gidsinformatie en routeadvies inbegrepen",
                "Zakelijk & groepsarrangement op aanvraag",
              ].map((t) => (
                <li key={t} className="flex items-center gap-3 text-sm text-ink">
                  <Icon name="check" size={16} className="shrink-0 text-accent" />
                  {t}
                </li>
              ))}
            </ul>
          </ScrollReveal>
          <ScrollReveal delay={150}>
            <CustomTourForm />
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}

const inputCls =
  "min-h-[52px] w-full rounded-field border border-[rgba(31,39,48,0.14)] bg-field px-4 text-[15px] font-medium text-ink placeholder:font-normal placeholder:text-stone focus:border-accent focus:bg-white focus:shadow-[0_0_0_4px_rgba(40,49,59,0.10)] focus:outline-none";
const labelCls = "mb-1.5 block text-xs font-bold text-secondary";

function CustomTourForm() {
  return (
    <form
      className="relative overflow-hidden rounded-[28px] border border-line bg-card p-6 shadow-hero-card md:p-7"
      aria-label="Offerte aanvragen"
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-accent via-stone to-stone-subtle" />
      <p className="mb-6 text-[11px] uppercase tracking-[3px] text-accent">Vraag een offerte aan</p>
      <div className="grid gap-4">
        <div>
          <label htmlFor="ct-naam" className={labelCls}>Naam</label>
          <input id="ct-naam" name="naam" placeholder="Uw naam" autoComplete="name" required className={inputCls} />
        </div>
        <div>
          <label htmlFor="ct-contact" className={labelCls}>E-mail / WhatsApp</label>
          <input id="ct-contact" name="contact" placeholder="E-mail of WhatsApp" className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="ct-vertrek" className={labelCls}>Vertrekpunt</label>
            <select id="ct-vertrek" name="vertrekpunt" className={inputCls}>
              <option>Amsterdam</option>
              <option>Almere</option>
              <option>Rotterdam</option>
            </select>
          </div>
          <div>
            <label htmlFor="ct-pass" className={labelCls}>Aantal passagiers</label>
            <input id="ct-pass" name="passagiers" type="number" min={1} max={4} defaultValue={2} className={inputCls} />
          </div>
        </div>
        <div>
          <label htmlFor="ct-bagage" className={labelCls}>Bagage</label>
          <select id="ct-bagage" name="bagage" className={inputCls}>
            <option>Handbagage</option>
            <option>1-2 koffers</option>
            <option>3 koffers — alleen bij max. 3 passagiers</option>
            <option>Meer bagage / grotere koffers — eerst afstemmen</option>
          </select>
        </div>
        <div>
          <label htmlFor="ct-best" className={labelCls}>Gewenste bestemming(en)</label>
          <input id="ct-best" name="bestemming" placeholder="Bijv. Brugge + Gent op één dag" className={inputCls} />
        </div>
        <div>
          <label htmlFor="ct-datum" className={labelCls}>Voorkeursdatum</label>
          <input id="ct-datum" type="date" className={inputCls} />
        </div>
        <div>
          <label htmlFor="ct-wensen" className={labelCls}>Extra wensen</label>
          <textarea
            id="ct-wensen"
            placeholder="Lunch reservering, specifieke bezienswaardigheden, etc."
            className={`${inputCls} min-h-24 resize-y py-3`}
          />
        </div>
      </div>
      <button
        type="submit"
        className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-md bg-accent px-8 font-display text-base font-medium text-white shadow-cta transition-all hover:-translate-y-0.5 hover:bg-accent-hover"
      >
        <Icon name="send" size={17} />
        Offerte aanvragen
      </button>
    </form>
  );
}
