import type { Metadata } from "next";
import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";
import { MembershipForm, StrippenkaartForm, HotelForm } from "@/components/producten/ProductForms";

export const metadata: Metadata = {
  title: "Mobiliteitsproducten",
  description:
    "Airport Memberships, zakelijke strippenkaarten, hotelcontracten en event shuttles. Vaste mobiliteit met voorspelbare kosten.",
  alternates: { canonical: "/producten" },
};

const HERO_STATS = [
  { num: "€279", label: "Membership vanaf" },
  { num: "€899", label: "Strippenkaart 10 ritten" },
  { num: "24/7", label: "Beschikbaar" },
  { num: "4", label: "Diensten" },
];

const MEMBERSHIP_TIERS = [
  { name: "Frequent", price: "€279", per: "/maand", desc: "4 Schiphol-ritten · Vaste vertrekregio, daluren mogelijk" },
  { name: "Business", price: "€549", per: "/maand", desc: "8 Schiphol-ritten · 2 vaste adressen, prioriteit", highlight: true },
  { name: "First Class", price: "Maatwerk", per: "/maand", desc: "Voor directie en teams · Maandfactuur, SLA en vaste afspraken" },
];

const MEMBERSHIP_PERKS = [
  { icon: "check", text: "Vaste maandprijs — ook bij vertraging, files of vroeg vertrek" },
  { icon: "clock", text: "Vluchttijden worden automatisch gemonitord" },
  { icon: "map-pin", text: "Ophaal bij jouw adres — geen looproute" },
  { icon: "rotate", text: "Ongebruikte ritten rollen 1 maand door" },
  { icon: "x", text: "Altijd opzegbaar — geen jaarcontract" },
];

const ZAKELIJK_TIERS = [
  { name: "Starter", price: "€499", per: " incl.", desc: "10 ritten · 1 gebruiker" },
  { name: "Team", price: "€899", per: " incl.", desc: "20 ritten · 5 gebruikers, €45/rit", highlight: true },
  { name: "Corporate", price: "€1.599", per: " incl.", desc: "40 ritten · Onbeperkte gebruikers, €40/rit" },
];

const ZAKELIJK_PERKS = [
  { icon: "receipt", text: "Één maandfactuur op bedrijfsnaam — BTW-vriendelijk" },
  { icon: "users", text: "Meerdere medewerkers boeken op één account" },
  { icon: "chart-bar", text: "Dashboard met ritoverzicht per medewerker" },
  { icon: "clock", text: "Credits geldig 6 maanden" },
  { icon: "star", text: "Prioriteitsboeking — altijd beschikbaarheid" },
];

const HOTEL_PERKS = [
  { icon: "building", text: "Branded service — uw hotel, ons vervoer" },
  { icon: "layout-dashboard", text: "Eigen hotelportal voor reserveringen" },
  { icon: "receipt", text: "Maandfactuur of per rit — uw keuze" },
  { icon: "clock", text: "24/7 beschikbaar voor late check-outs en vroege vluchten" },
  { icon: "star", text: "Vaste chauffeur voor uw hotel mogelijk" },
  { icon: "chart-bar", text: "Maandrapportage voor uw administratie" },
];

const HOTEL_STEPS = [
  "Concierge logt in op het T4XI hotelportaal",
  "Rit invoeren: naam gast, vlucht, ophaaltijd",
  "Gast ontvangt bevestiging + chauffeursnaam",
  "Maandfactuur automatisch naar uw boekhouding",
];

const EVENTS = [
  {
    icon: "heart", name: "Bruiloft",
    desc: "Van ophalen van de bruid tot het vervoer van gasten naar de receptie. Lynk & Co 01 of Tesla — allebei geschikt voor het grote moment.",
    details: [
      { icon: "clock", text: "Dagdeel of volledige dag" },
      { icon: "user", text: "Vaste chauffeur voor bruidspaar" },
      { icon: "camera", text: "Geduldige wachttijd voor fotografie" },
    ],
    price: "Vanaf €299 per dag",
  },
  {
    icon: "building", name: "Bedrijfsevent",
    desc: "Meerdere ritten voor directie, sprekers of VIP-gasten. Wij coördineren de planning — u concentreert zich op het event.",
    details: [
      { icon: "users", text: "Meerdere ritten tegelijk mogelijk" },
      { icon: "receipt", text: "Één factuur achteraf" },
      { icon: "layout-dashboard", text: "Live ritoverzicht voor organisator" },
    ],
    price: "Op aanvraag — ritpakket",
  },
  {
    icon: "plane", name: "Congres & Conference",
    desc: "Sprekers en internationale gasten ophalen van Schiphol en brengen naar de locatie. Naambordje bij aankomst en wij volgen de vluchtstatus.",
    details: [
      { icon: "plane", text: "Vluchtmonitoring inbegrepen" },
      { icon: "id-badge", text: "Naambordje ophaal op Schiphol" },
      { icon: "globe", text: "Engelstalige service beschikbaar" },
    ],
    price: "Per rit of dagpakket",
  },
  {
    icon: "star", name: "VIP & Gala",
    desc: "Galabals, award ceremonies, VIP-ontvangsten. Stijlvol vervoer dat past bij de gelegenheid — chauffeur in formeel pak op aanvraag.",
    details: [
      { icon: "user-check", text: "Formele kledingscode op aanvraag" },
      { icon: "shield-check", text: "Discrete, stille service" },
      { icon: "clock", text: "Wachten inbegrepen" },
    ],
    price: "Op aanvraag",
  },
  {
    icon: "map-pin", name: "Toeristische Dagtocht",
    desc: "Brugge, Brussel, Antwerpen, Keulen — T4XI rijdt u naar de mooiste bestemmingen in de Benelux en Duitsland. Alles in één dag, vaste prijs.",
    details: [
      { icon: "map-pin", text: "Deur-tot-deur, geen tussenstops" },
      { icon: "users", text: "Max. 4 passagiers" },
      { icon: "coin", text: "All-in dagtarief" },
    ],
    price: "Vanaf €349 all-in",
  },
];

function Eyebrow({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 rounded-full border border-line bg-accent/5 px-4 py-2 text-xs font-medium uppercase tracking-[2px] text-accent">
      <Icon name={icon} size={15} />
      {children}
    </p>
  );
}

function Tiers({ tiers }: { tiers: typeof MEMBERSHIP_TIERS }) {
  return (
    <div className="mt-7 grid gap-3 sm:grid-cols-3">
      {tiers.map((t) => (
        <div
          key={t.name}
          className={`rounded-card border bg-card p-4 shadow-card ${t.highlight ? "border-accent" : "border-line"}`}
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

function Perks({ perks }: { perks: { icon: string; text: string }[] }) {
  return (
    <ul className="mt-7 flex flex-col gap-3">
      {perks.map((p) => (
        <li key={p.text} className="flex items-start gap-3 text-sm text-ink">
          <Icon name={p.icon} size={17} className="mt-0.5 shrink-0 text-accent" />
          {p.text}
        </li>
      ))}
    </ul>
  );
}

export default function ProductenPage() {
  return (
    <>
      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden border-b border-line" aria-labelledby="hero-title">
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(135deg,#F5F3F1_0%,#FFFFFF_54%,#E8E4DE_100%)]" />
        <div className="relative mx-auto max-w-site px-6 pb-14 pt-16 lg:pb-20 lg:pt-24">
          <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
            <span aria-hidden="true" className="h-px w-4 bg-accent" />
            Meer dan een rit
          </p>
          <h1 id="hero-title" className="mt-5 max-w-3xl font-display text-display-xl font-bold text-ink">
            Vaste mobiliteit,
            <br />
            <span className="italic text-stone">voorspelbare kosten</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-secondary">
            T4XI maakt regelmatig luchthaven- en zakelijk vervoer voorspelbaar.
            U boekt sneller, betaalt een vaste prijs en krijgt duidelijke
            afspraken over chauffeur, voertuig, passagiers en bagage.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <a href="#membership" className="inline-flex min-h-[52px] items-center gap-2 rounded-md bg-accent px-8 font-display text-base font-medium text-white shadow-cta transition-colors hover:bg-accent-hover">
              <Icon name="plane" size={18} />
              Airport Membership
            </a>
            <a href="#zakelijk" className="inline-flex min-h-[52px] items-center gap-2 rounded-md border border-line-strong bg-white/60 px-8 font-display text-base font-medium text-ink transition-colors hover:bg-white">
              <Icon name="briefcase" size={18} />
              Zakelijk
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
      </section>

      {/* ═══ 1. AIRPORT MEMBERSHIP ═══ */}
      <section id="membership" className="scroll-mt-20 border-b border-line bg-card/60 py-16 md:py-24" aria-labelledby="m-title">
        <div className="mx-auto grid max-w-site items-start gap-12 px-6 lg:grid-cols-2">
          <ScrollReveal>
            <Eyebrow icon="plane">Airport Membership</Eyebrow>
            <h2 id="m-title" className="mt-5 font-display text-display-lg font-bold text-ink">
              Nooit meer
              <br />
              <span className="italic text-stone">nadenken over Schiphol</span>
            </h2>
            <p className="mt-4 text-secondary">
              Vlieg je regelmatig? Met een T4XI Airport Membership staat er
              altijd een auto voor je klaar — voor een vast maandbedrag. Geen
              last-minute boeken, geen prijsstijging bij grote files, geen gedoe.
            </p>
            <Tiers tiers={MEMBERSHIP_TIERS} />
            <Perks perks={MEMBERSHIP_PERKS} />
            <div className="mt-7 overflow-hidden rounded-card border border-line bg-card shadow-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-stone">
                    <th className="px-4 py-3 font-medium">Per maand: 8 Schiphol-ritten</th>
                    <th className="px-4 py-3 font-medium">Los boeken</th>
                    <th className="px-4 py-3 font-semibold text-accent">T4XI Business</th>
                  </tr>
                </thead>
                <tbody className="text-secondary">
                  <tr className="border-b border-line/60">
                    <td className="px-4 py-2.5">Vaste maandprijs</td>
                    <td className="px-4 py-2.5">✕</td>
                    <td className="px-4 py-2.5 bg-accent/[0.04] text-green-600">✓</td>
                  </tr>
                  <tr className="border-b border-line/60">
                    <td className="px-4 py-2.5">Prijs vooraf vastgelegd</td>
                    <td className="px-4 py-2.5">Per rit opnieuw</td>
                    <td className="px-4 py-2.5 bg-accent/[0.04] text-ink">Ja</td>
                  </tr>
                  <tr className="border-b border-line/60">
                    <td className="px-4 py-2.5">Indicatie losse kosten (8 × €79)</td>
                    <td className="px-4 py-2.5">± €632</td>
                    <td className="px-4 py-2.5 bg-accent/[0.04] font-semibold text-ink">€549</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5">Voordeel per maand</td>
                    <td className="px-4 py-2.5">—</td>
                    <td className="px-4 py-2.5 bg-accent/[0.04] font-semibold text-accent">± €83 + prioriteit</td>
                  </tr>
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
            <Eyebrow icon="briefcase">Zakelijk</Eyebrow>
            <h2 id="z-title" className="mt-5 font-display text-display-lg font-bold text-ink">
              Ritcredits voor
              <br />
              <span className="italic text-stone">uw hele team</span>
            </h2>
            <p className="mt-4 text-secondary">
              Koop een blok ritcredits voor uw bedrijf. Medewerkers boeken zelf
              hun rit via T4XI — u ontvangt één overzichtelijke factuur per
              maand. Geen declaraties, geen bonnetjes, geen gedoe.
            </p>
            <Tiers tiers={ZAKELIJK_TIERS} />
            <Perks perks={ZAKELIJK_PERKS} />
            <div className="mt-7 rounded-card border border-line bg-card p-5 shadow-card">
              <p className="mb-3 text-[11px] uppercase tracking-[3px] text-accent">Ideaal voor</p>
              <div className="flex flex-wrap gap-2">
                {["Consultancy bureaus", "Advocatenkantoren", "Internationale bedrijven", "Recruiters", "Accountantskantoren"].map((t) => (
                  <span key={t} className="rounded-full border border-line bg-fog px-3 py-1.5 text-xs text-secondary">
                    {t}
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
            <Eyebrow icon="building">Hotelcontract</Eyebrow>
            <h2 id="h-title" className="mt-5 font-display text-display-lg font-bold text-ink">
              Uw gasten verdienen
              <br />
              <span className="italic text-stone">premium vervoer</span>
            </h2>
            <p className="mt-4 text-secondary">
              T4XI wordt vaste transferpartner van uw hotel, boutique hotel of
              aparthotel. Uw concierge boekt direct via ons dashboard — uw
              gasten stappen in een schone Tesla of Lynk &amp; Co 01.
            </p>
            <Perks perks={HOTEL_PERKS} />
            <div className="mt-7 rounded-card border border-line bg-card p-5 shadow-card">
              <p className="mb-4 text-[11px] uppercase tracking-[2px] text-accent">Hoe het werkt</p>
              <ol className="flex flex-col gap-3">
                {HOTEL_STEPS.map((s, i) => (
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
            <Eyebrow icon="confetti">Event Shuttles</Eyebrow>
            <h2 id="e-title" className="mt-5 font-display text-display-lg font-bold text-ink">
              Eén aanspreekpunt
              <br />
              <span className="italic text-stone">voor uw hele event</span>
            </h2>
            <p className="mt-4 max-w-2xl text-secondary">
              Van bruiloften tot bedrijfsevents — T4XI regelt het vervoer. U
              heeft één aanspreekpunt, één factuur en de zekerheid dat uw gasten
              op tijd aankomen.
            </p>
          </ScrollReveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {EVENTS.map((ev, i) => (
              <ScrollReveal key={ev.name} delay={i * 80}>
                <article className="flex h-full flex-col gap-3 rounded-card border border-line bg-card p-6 shadow-card">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-accent/5 text-accent">
                    <Icon name={ev.icon} size={22} />
                  </span>
                  <h3 className="font-display text-lg font-semibold text-ink">{ev.name}</h3>
                  <p className="flex-1 text-sm leading-relaxed text-secondary">{ev.desc}</p>
                  <ul className="flex flex-col gap-1.5">
                    {ev.details.map((d) => (
                      <li key={d.text} className="flex items-center gap-2 text-xs text-secondary">
                        <Icon name={d.icon} size={13} className="shrink-0 text-accent" />
                        {d.text}
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
