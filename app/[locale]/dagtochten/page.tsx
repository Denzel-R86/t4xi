import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";
import RoutesExplorer, { FeaturedDetailsButton } from "@/components/dagtochten/RoutesExplorer";
import { COUNTRIES, FEATURED } from "@/lib/dagtochten";
import { BEDRIJF } from "@/lib/legal";

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
                    href="#aanvragen"
                    className="flex min-h-11 flex-1 items-center justify-center rounded-md bg-accent text-sm font-medium text-white shadow-cta transition-colors hover:bg-accent-hover"
                  >
                    Dagtocht aanvragen
                  </Link>
                </div>
              </div>
              <div className="relative min-h-56 overflow-hidden bg-[linear-gradient(135deg,#EEEAE5,#DDD7CE)]">
                {FEATURED.modal.image ? (
                  <Image
                    src={FEATURED.modal.image}
                    alt={`${FEATURED.name} — ${FEATURED.title}`}
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover"
                    priority
                  />
                ) : (
                  <div aria-hidden="true" className="flex h-full items-center justify-center text-[120px] lg:text-[160px]">
                    {FEATURED.emoji}
                  </div>
                )}
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
              Alle dagtochten worden persoonlijk bevestigd. De vermelde
              pakketprijzen gelden voor de standaardarrangementen; eventuele
              maatwerkwensen stemmen wij vooraf met u af. Maximaal 4 passagiers
              exclusief chauffeur. Adviesbagage: 2 grote koffers + 2 handbagage
              bij 4 passagiers, of 3 grote koffers bij maximaal 3 passagiers.
            </p>
          </ScrollReveal>
          <RoutesExplorer />
        </div>
      </section>

      {/* ═══ OP MAAT ═══ */}
      <section
        id="aanvragen"
        className="scroll-mt-24 border-t border-line bg-card/60 py-16 md:py-24"
        aria-labelledby="custom-titel"
      >
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
            <DagtochtAanvraag />
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}

/**
 * Aanvraagblok voor dagtochten.
 *
 * Bewust GEEN formulier. Hier stond een `<form>` zonder action en zonder
 * onSubmit: die verzond niets, zette naam en e-mailadres in de query string en
 * liet datum en wensen volledig vallen (velden zonder `name`). Zolang er geen
 * backend achter zit, is een werkend contactkanaal eerlijker dan een invulveld
 * dat een verwerking suggereert die niet plaatsvindt.
 *
 * Een echte online aanvraagflow volgt pas nadat ADR-012 de status `Accepted`
 * heeft en de productdefinitie van een dagtocht vaststaat.
 */
const KANAAL =
  "flex min-h-[52px] items-center gap-3 rounded-md border border-line-strong bg-white/60 px-4 text-[15px] font-medium text-ink transition-colors hover:bg-white";

const WA_TEKST = encodeURIComponent(
  "Hallo T4XI, ik wil graag een dagtocht aanvragen."
);

function DagtochtAanvraag() {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-line bg-card p-6 shadow-hero-card md:p-7">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-accent via-stone to-stone-subtle" />
      <p className="mb-5 text-[11px] uppercase tracking-[3px] text-accent">Vraag een dagtocht aan</p>
      <p className="text-[15px] leading-[1.8] text-secondary">
        Iedere dagtocht stemmen wij persoonlijk met u af. Laat ons weten wat u in
        gedachten heeft:
      </p>
      <ul className="mt-5 flex flex-col gap-2.5">
        {[
          "gewenste datum",
          "vertrekplaats",
          "groepsgrootte",
          "eventuele maatwerkwensen",
        ].map((t) => (
          <li key={t} className="flex items-center gap-3 text-sm text-ink">
            <Icon name="check" size={16} className="shrink-0 text-accent" />
            {t}
          </li>
        ))}
      </ul>
      <div className="mt-7 grid gap-2.5">
        <a
          href={`https://wa.me/31634744522?text=${WA_TEKST}`}
          target="_blank"
          rel="noopener noreferrer"
          className={KANAAL}
        >
          <Icon name="whatsapp" size={18} className="shrink-0 text-whatsapp" />
          WhatsApp
        </a>
        <a href={BEDRIJF.telefoonHref} className={KANAAL}>
          <Icon name="phone" size={17} className="shrink-0 text-accent" />
          {BEDRIJF.telefoon}
        </a>
        <a href={`mailto:${BEDRIJF.email}`} className={KANAAL}>
          <Icon name="mail" size={17} className="shrink-0 text-accent" />
          {BEDRIJF.email}
        </a>
      </div>
      <p className="mt-5 text-xs leading-[1.7] text-stone">
        Wij bevestigen de beschikbaarheid, planning en definitieve pakketprijs
        persoonlijk voordat de rit vaststaat.
      </p>
    </div>
  );
}
