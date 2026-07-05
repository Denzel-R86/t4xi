import Link from "next/link";
import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";

const PUNTEN = [
  { icon: "file-invoice", title: "Facturatie op rekening", sub: "Maandelijkse factuur, geen gedoe met declaraties" },
  { icon: "user-check", title: "Vaste chauffeur", sub: "Uw medewerkers kennen hun chauffeur persoonlijk" },
  { icon: "repeat", title: "Maandelijkse ritten", sub: "Volumekorting vanaf 10 ritten per maand" },
  { icon: "building", title: "Zakelijk account", sub: "Dashboard, ritoverzicht en directe support" },
];

const FEATURES = [
  "Maandelijkse factuur",
  "Dedicated chauffeur",
  "Ritregistratie & overzicht",
  "24/7 prioriteitssupport",
  "Volumekorting",
  "Onbeperkte ritten",
];

/** Zakelijke klanten-sectie uit het v14-bronbestand. */
export default function ZakelijkSection() {
  return (
    <section className="border-t border-line py-16 md:py-24" aria-labelledby="zakelijk-title">
      <div className="mx-auto grid max-w-site items-start gap-12 px-6 lg:grid-cols-2 lg:gap-16">
        <ScrollReveal>
          <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
            <span aria-hidden="true" className="h-px w-4 bg-accent" />
            Voor bedrijven
          </p>
          <h2 id="zakelijk-title" className="mt-4 font-display text-display-lg font-bold text-ink">
            T4XI voor
            <br />
            <span className="italic text-stone">zakelijke klanten</span>
          </h2>
          <p className="mt-4 max-w-xl text-secondary">
            Van maandelijkse contracten tot eenmalige boardroomritten. T4XI
            biedt bedrijven een betrouwbare, representatieve
            mobiliteitsoplossing met volledige ontzorging.
          </p>
          <ul className="mt-8 flex flex-col gap-5">
            {PUNTEN.map((p) => (
              <li key={p.title} className="flex items-start gap-4">
                <Icon name={p.icon} size={20} className="mt-0.5 shrink-0 text-accent" />
                <div>
                  <strong className="block font-medium text-ink">{p.title}</strong>
                  <span className="text-sm text-secondary">{p.sub}</span>
                </div>
              </li>
            ))}
          </ul>
          <Link
            href="/contact"
            className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-6 text-sm font-medium text-white shadow-cta transition-colors hover:bg-accent-hover"
          >
            <Icon name="mail" size={16} />
            Neem contact op
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
              Zakelijk account
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <p key={f} className="flex items-center gap-2 text-sm text-ink">
                  <Icon name="check" size={14} className="shrink-0 text-green-600" />
                  {f}
                </p>
              ))}
            </div>
            <div aria-hidden="true" className="my-5 h-px bg-line" />
            <p className="text-xs leading-relaxed text-secondary">
              Meer dan 40 bedrijven vertrouwen op T4XI voor hun dagelijkse
              mobiliteitsbehoeften.
            </p>
            <Link
              href="/contact"
              className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-accent text-sm font-medium text-white shadow-cta transition-colors hover:bg-accent-hover"
            >
              <Icon name="arrow-right" size={16} />
              Vraag zakelijk account aan
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
