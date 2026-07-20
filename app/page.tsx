import Link from "next/link";
import { Reveal } from "@/components/horizon/motion";
import {
  HorizonSpine,
  Viewport,
  Breath,
  NarrativePattern,
  SentencePattern,
  LedgerPattern,
  EditorialFigure,
  VowsPattern,
  ProofPattern,
  Stamp,
  Dash,
  type LedgerEntry,
} from "@/components/horizon/patterns";
import { loadRateCard, type CityRates } from "@/lib/pricing/rate-card";

/**
 * Homepage — eerste uitspraak in de Horizon Design Language (v1).
 *
 * Geen secties maar betekenis-viewports in een verticaal ritme
 * (Stilte → Statement → Adem → Bewijs → Adem → Handeling):
 *
 *   Arrival → Recognition → Certainty → Journey → Proof → Invitation
 *
 * De horizonlijn draagt de pagina; de handeling (de boekingszin, gekoppeld aan
 * de echte Pricing Engine) ligt óp de lijn. Volledige boekingsflow: /boeken.
 */

const VOWS = [
  {
    title: "Vaste prijs vooraf.",
    text: "Geen taxameterstress. U ziet vooraf de prijs op basis van vertrekpunt, bestemming, postcodegebied en bagage.",
  },
  {
    title: "Ontspannen onderweg.",
    text: "Stil elektrisch vervoer, nette chauffeur, rustige rijstijl en ruimte voor een representatieve rit.",
  },
  {
    title: "Schiphol zonder gedoe.",
    text: "Afspraak, ophaaltijd en bagage vooraf afgestemd. Bij luchthavenritten rekenen we met realistische reistijd.",
  },
  {
    title: "Gemakkelijk boeken.",
    text: "Adres invullen, prijs bekijken en boeken. Wij bevestigen uw rit via WhatsApp of e-mail.",
  },
];

/**
 * Welke routes het grootboek toont — een redactionele keuze, één per vertrekstad.
 *
 * Alleen de SELECTIE staat hier vast. Prijs en afstand komen uit `loadRateCard()`,
 * dezelfde bron als /tarieven, de landingspagina's en de quote-engine. Verdwijnt een
 * route uit de catalogus, dan valt hij hier vanzelf weg.
 *
 * Vóór 2026-07-20 stonden hier hardgecodeerde bedragen én afstanden. De prijzen
 * klopten toevallig nog, maar de afstanden niet meer: Amsterdam Centrum stond op
 * 14 km waar het er 26 zijn, Rotterdam op 80 waar het er 61 zijn. Precies dezelfde
 * veroudering als op de landingspagina's, alleen op de drukst bezochte pagina.
 */
const LEDGER_SELECTIE: { citySlug: string; from: string }[] = [
  { citySlug: "amsterdam", from: "Amsterdam Zuidas" },
  { citySlug: "amsterdam", from: "Amsterdam Centrum" },
  { citySlug: "almere", from: "Almere Poort" },
  { citySlug: "den-haag", from: "Den Haag" },
  { citySlug: "utrecht", from: "Utrecht Centrum" },
  { citySlug: "rotterdam", from: "Rotterdam" },
];

function buildLedger(cities: CityRates[]): LedgerEntry[] {
  return LEDGER_SELECTIE.flatMap(({ citySlug, from }) => {
    const stad = cities.find((c) => c.citySlug === citySlug);
    const route = stad?.toSchiphol.find((r) => r.from === from);
    if (!route) return [];
    return [
      {
        phrase: `${route.from} naar ${route.to}`,
        detail: `${route.distanceKm} km`,
        fact: route.single,
        factNote: "vast",
        href: "/boeken",
      },
    ];
  });
}

const PATHS = [
  { label: "Diensten", href: "/diensten" },
  { label: "Dagtochten", href: "/dagtochten" },
  { label: "Zakelijk", href: "/diensten" },
  { label: "Memberships", href: "/producten" },
  { label: "Tarieven", href: "/tarieven" },
  { label: "Partner worden", href: "/partner" },
];

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Live tarieven — één bron van waarheid met /tarieven en de quote-engine.
  const ledger = buildLedger(await loadRateCard());

  return (
    <>
      <HorizonSpine />

      {/* ═══ ARRIVAL — stilte, dan het statement; de handeling ligt op de lijn ═══ */}
      <Viewport
        meaning="arrival"
        label="Aankomst"
        first
        above={
          <NarrativePattern
            as="h1"
            kicker="Executive Airport Mobility — Nederland"
            voice="Van voordeur"
            echo="tot vertrekhal."
            note="Premium rit met vaste prijs vooraf. Rustig elektrisch vervoer, professionele chauffeur en heldere afspraken over passagiers en bagage."
          />
        }
        onLine={
          <Reveal delay={2}>
            <SentencePattern />
          </Reveal>
        }
        below={
          <Reveal delay={3}>
            <Stamp>
              24/7 beschikbaar<Dash />geldige taxichauffeurskaart<Dash />100% elektrisch<Dash />
              <b className="font-semibold text-ink">vaste prijs vooraf</b>
            </Stamp>
          </Reveal>
        }
      />

      <Breath />

      {/* ═══ RECOGNITION — de beleving, als beloftes in volle regels ═══ */}
      <Viewport
        meaning="recognition"
        label="Herkenning — de T4XI beleving"
        above={
          <NarrativePattern
            kicker="De T4XI beleving"
            voice="Rust, overzicht en comfort"
            echo="vanaf het eerste contact."
            note="Een premium rit begint niet bij instappen, maar bij eenvoudig boeken, heldere communicatie en weten waar u aan toe bent."
          />
        }
        below={<VowsPattern vows={VOWS} />}
      />

      <Breath />

      {/* ═══ CERTAINTY — het grootboek van vaste prijzen ═══ */}
      <Viewport
        meaning="certainty"
        label="Zekerheid — vaste tarieven"
        id="prijzen"
        above={
          <NarrativePattern
            kicker="Vaste tarieven — geen taxameter, geen verrassing"
            voice="Elke rit heeft zijn prijs."
            echo="Vooraf. Zwart op wit."
            note="Enkele rit; retour ×1,8 · nachttarief (23:00–06:00) +15%. Eerlijk voor u én voor de chauffeur — zonder platformcommissies."
          />
        }
        below={
          <Reveal>
            <LedgerPattern
              entries={ledger}
              closing={
                <Stamp>
                  <Link href="/tarieven" className="hz-guide-line text-ink no-underline">
                    Alle vaste tarieven en routes
                  </Link>
                  <Dash />
                  onbekende route? Offerte op aanvraag
                </Stamp>
              }
            />
          </Reveal>
        }
      />

      <Breath />

      {/* ═══ JOURNEY — de rit zelf: de vloot als technische tekening ═══ */}
      <Viewport
        meaning="journey"
        label="De rit — ons wagenpark"
        id="vloot"
        above={
          <NarrativePattern
            kicker="Ons wagenpark — 100% elektrisch onderweg"
            voice="Tesla Model Y."
            echo="Stil als de afspraak zelf."
            note="Het vlaggenschip van de vloot: volledig elektrisch, ruim interieur en indrukwekkend rijbereik. Zakelijk of particulier — de Model Y zet de toon."
          />
        }
        below={
          <Reveal>
            <EditorialFigure
              src="/tesla_model_y_black.jpg"
              alt="Tesla Model Y — volledig elektrisch, premium interieur"
              annotations={[
                { text: "Bagage: 2 grote koffers + 2 handbagage", side: "left", top: "16%" },
                { text: "4 passagiers, excl. chauffeur", side: "right", top: "38%" },
              ]}
              specs={[
                { k: "Aandrijving", v: "100% EV" },
                { k: "Beschikbaar", v: "24 / 7" },
                { k: "Chauffeurs", v: "Taxichauffeurskaart" },
                { k: "Regio's", v: "AMS · RTM" },
              ]}
            />
            <Stamp className="mt-5">
              Ook actief<Dash />
              <b className="font-semibold text-ink">Lynk &amp; Co 01</b> · plug-in hybrid · panoramadak · zakelijk &amp;
              bruiloften
            </Stamp>
          </Reveal>
        }
      />

      <Breath />

      {/* ═══ PROOF — uitsluitend wat aantoonbaar is ═══ */}
      {/*
        Klantcitaten en beoordelingscijfers zijn hier bewust verwijderd: er is geen
        verifieerbare bron. Zie components/sections/ReviewsSection.tsx. Wat hier staat
        is controleerbaar — de prijsbelofte, het luchthavenbeleid en het KvK-nummer.
      */}
      <Viewport
        meaning="proof"
        label="Bewijs — onze belofte"
        above={
          <ProofPattern
            quote="De prijs die u ziet,"
            accent="is de prijs die u betaalt."
            stamp={
              <Stamp>
                Vaste prijs vooraf<Dash />file en wachttijd zijn ons risico<Dash />
                <b className="font-semibold text-ink">geen taxameter, geen surge pricing</b>
              </Stamp>
            }
          />
        }
        below={
          <Reveal>
            <Stamp>
              Geldige Nederlandse taxichauffeurskaart<Dash />100% elektrisch<Dash />KVK 80673813<Dash />
              vluchtstatus wordt gevolgd bij luchthavenritten
            </Stamp>
          </Reveal>
        }
      />

      <Breath />

      {/* ═══ INVITATION — de uitnodiging ═══ */}
      <Viewport
        meaning="invitation"
        label="Uitnodiging — boek uw rit"
        id="boeken"
        above={
          <NarrativePattern
            kicker="Nu — uw rit"
            voice="Waar moet u zijn?"
          />
        }
        onLine={
          <Reveal delay={1}>
            <div className="flex flex-wrap items-center gap-6 border-t border-ink/30 pt-6">
              <Link
                href="/boeken"
                className="hz-confirm-btn px-10 py-4 text-[13px] font-medium uppercase tracking-[0.14em] text-ink no-underline"
              >
                <span>Boek uw rit — vaste prijs</span>
              </Link>
              <a href="tel:+31634744522" className="hz-guide-line text-sm text-secondary no-underline">
                of bel +31 6 34 74 45 22
              </a>
            </div>
          </Reveal>
        }
        below={
          <Reveal delay={2}>
            <p className="flex flex-wrap gap-x-7 gap-y-2">
              {PATHS.map((p) => (
                <Link
                  key={p.label}
                  href={p.href}
                  className="hz-guide-line text-[13px] uppercase tracking-[0.1em] text-secondary no-underline"
                >
                  {p.label}
                </Link>
              ))}
            </p>
            <Stamp className="mt-8">
              Bevestiging via WhatsApp of e-mail<Dash />iDEAL, pin of contant<Dash />
              <b className="font-semibold text-ink">vaste prijs, geen taxameter</b>
            </Stamp>
          </Reveal>
        }
      />
    </>
  );
}
