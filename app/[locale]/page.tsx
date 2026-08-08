import { Link } from "@/i18n/navigation";
import { Reveal } from "@/components/horizon/motion";
import {
  HorizonSpine,
  Viewport,
  Breath,
  NarrativePattern,
  SentencePattern,
  LedgerPattern,
  EditorialFigure,
  ProofPattern,
  Stamp,
  Dash,
  type LedgerEntry,
} from "@/components/horizon/patterns";
import { loadRateCard, type CityRates } from "@/lib/pricing/rate-card";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
// Static import → Next genereert een blurDataURL bij build (geen dependency,
// asset zelf ongewijzigd). Gebruikt als blur-placeholder in de EditorialFigure.
import teslaFleet from "@/public/tesla_model_y_black.jpg";
import passagierRust from "@/public/t4xi-campagne-01-passagier-v2.png";
import bagageOverdracht from "@/public/t4xi-campagne-02-bagageoverdracht-v4.png";
import comfortAanBoord from "@/public/t4xi-campagne-03-comfort.png";

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

function buildLedger(cities: CityRates[], naar: string, vast: string): LedgerEntry[] {
  return LEDGER_SELECTIE.flatMap(({ citySlug, from }) => {
    const stad = cities.find((c) => c.citySlug === citySlug);
    const route = stad?.toSchiphol.find((r) => r.from === from);
    if (!route) return [];
    return [
      {
        phrase: `${route.from} ${naar} ${route.to}`,
        detail: `${route.distanceKm} km`,
        fact: route.single,
        factNote: vast,
        href: "/boeken",
      },
    ];
  });
}



export const dynamic = "force-dynamic";

export default async function HomePage() {
  const t = await getTranslations("home");
  const VOWS = [
    { title: t("vow1Titel"), text: t("vow1Tekst") },
    { title: t("vow2Titel"), text: t("vow2Tekst") },
    { title: t("vow3Titel"), text: t("vow3Tekst") },
    { title: t("vow4Titel"), text: t("vow4Tekst") },
  ];
  const PATHS = [
    { label: t("padDiensten"), href: "/diensten" },
    { label: t("padDagtochten"), href: "/dagtochten" },
    { label: t("padZakelijk"), href: "/diensten" },
    { label: t("padMemberships"), href: "/producten" },
    { label: t("padTarieven"), href: "/tarieven" },
    { label: t("padPartner"), href: "/partner" },
  ];
  // Live tarieven — één bron van waarheid met /tarieven en de quote-engine.
  const ledger = buildLedger(await loadRateCard(), t("ledgerNaar"), t("ledgerVast"));

  return (
    <>
      <HorizonSpine />

      {/* ═══ ARRIVAL — tekst en boeking links, de reisbeleving rechts ═══ */}
      <section
        data-viewport="arrival"
        aria-label={t("arrivalLabel")}
        className="grid min-h-[calc(100svh-68px)] md:grid-cols-[48%_52%]"
      >
        <div className="flex min-w-0 flex-col justify-center px-[5vw] pb-10 pt-20 md:py-14 md:pr-[4vw]">
          <NarrativePattern
            as="h1"
            kicker={t("arrivalKicker")}
            voice={t("arrivalVoice")}
            echo={t("arrivalEcho")}
            note={t("arrivalNote")}
          />
          <Reveal delay={2}>
            <div className="mt-9">
              <SentencePattern />
            </div>
          </Reveal>
          <Reveal delay={3}>
            <Stamp className="mt-7 leading-relaxed">
              {t("arrivalStamp1")}<Dash />{t("arrivalStamp2")}<Dash />{t("arrivalStamp3")}<Dash />
              <b className="font-semibold text-ink">{t("arrivalStamp4")}</b>
            </Stamp>
          </Reveal>
        </div>
        <figure className="relative min-h-[42svh] overflow-hidden bg-ink md:min-h-full">
          <Image
            src={passagierRust}
            alt={t("recogFiguurAlt")}
            fill
            priority
            sizes="(min-width: 768px) 52vw, 100vw"
            placeholder="blur"
            className="object-cover object-[57%_center] saturate-[0.9] contrast-[0.96]"
          />
        </figure>
      </section>

      {/* ═══ RECOGNITION — vier ruime, redactionele voordelen ═══ */}
      <section aria-label={t("recogLabel")} className="bg-ink px-[5vw] py-16 text-white md:py-24">
        <div className="grid gap-x-10 gap-y-12 md:grid-cols-2 xl:grid-cols-4">
          {VOWS.map((vow, index) => (
            <Reveal key={vow.title} delay={(Math.min(index, 3) as 0 | 1 | 2 | 3) || 0}>
              <article className="border-t border-white/25 pt-6">
                <span className="text-[11px] font-medium tracking-[0.16em] text-white/50">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h2 className="mt-10 font-display text-[clamp(24px,2.4vw,34px)] font-bold leading-[1.08] tracking-[-0.02em]">
                  {vow.title}
                </h2>
                <p className="mt-5 max-w-sm text-[14px] leading-7 text-white/65">{vow.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <Breath />

      {/* ═══ CERTAINTY — het grootboek van vaste prijzen ═══ */}
      <Viewport
        meaning="certainty"
        label={t("certLabel")}
        id="prijzen"
        above={
          <NarrativePattern
            kicker={t("certKicker")}
            voice={t("certVoice")}
            echo={t("certEcho")}
            note={t("certNote")}
          />
        }
        below={
          <>
            <Reveal>
              <LedgerPattern
                entries={ledger}
                closing={
                  <Stamp>
                    <Link href="/tarieven" className="hz-guide-line text-ink no-underline">
                      {t("ledgerAlle")}
                    </Link>
                    <Dash />
                    {t("ledgerOnbekend")}
                  </Stamp>
                }
              />
            </Reveal>
            <Reveal delay={1}>
              <div className="mt-20 grid gap-5 md:grid-cols-[1.12fr_0.88fr]">
                <figure className="overflow-hidden bg-ink text-white">
                  <div className="relative aspect-[4/3]">
                    <Image
                      src={bagageOverdracht}
                      alt={t("bagageFiguurAlt")}
                      fill
                      sizes="(min-width: 768px) 50vw, 90vw"
                      placeholder="blur"
                      className="object-cover saturate-[0.9] contrast-[0.96]"
                    />
                  </div>
                  <figcaption className="px-7 py-8 md:px-9 md:py-10">
                    <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/50">
                      {t("bagageFiguurKicker")}
                    </p>
                    <h3 className="mt-5 font-display text-[clamp(24px,2.8vw,38px)] font-bold leading-[1.08] tracking-[-0.02em]">
                      {t("bagageFiguurCaption")}
                    </h3>
                    <p className="mt-5 max-w-lg text-[14px] leading-7 text-white/65">{t("bagageFiguurTekst")}</p>
                  </figcaption>
                </figure>
                <figure className="overflow-hidden bg-ink text-white">
                  <div className="relative aspect-[4/3]">
                    <Image
                      src={comfortAanBoord}
                      alt={t("comfortFiguurAlt")}
                      fill
                      sizes="(min-width: 768px) 40vw, 90vw"
                      placeholder="blur"
                      className="object-cover saturate-[0.9] contrast-[0.96]"
                    />
                  </div>
                  <figcaption className="px-7 py-8 md:px-9 md:py-10">
                    <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/50">
                      {t("comfortFiguurKicker")}
                    </p>
                    <h3 className="mt-5 font-display text-[clamp(24px,2.8vw,38px)] font-bold leading-[1.08] tracking-[-0.02em]">
                      {t("comfortFiguurTitel")}
                    </h3>
                    <p className="mt-5 max-w-lg text-[14px] leading-7 text-white/65">{t("comfortFiguurCaption")}</p>
                  </figcaption>
                </figure>
              </div>
            </Reveal>
          </>
        }
      />

      <Breath />

      {/* ═══ JOURNEY — de rit zelf: de vloot als technische tekening ═══ */}
      <Viewport
        meaning="journey"
        label={t("journeyLabel")}
        id="vloot"
        above={
          <NarrativePattern
            kicker={t("journeyKicker")}
            voice={t("journeyVoice")}
            echo={t("journeyEcho")}
            note={t("journeyNote")}
          />
        }
        below={
          <Reveal>
            <EditorialFigure
              src={teslaFleet}
              alt={t("figuurAlt")}
              specs={[
                { k: t("specAandrijving"), v: "100% EV" },
                { k: t("specBeschikbaar"), v: "24 / 7" },
                { k: t("specChauffeurs"), v: t("specChauffeursWaarde") },
                { k: t("specRegios"), v: "AMS · RTM" },
              ]}
            />
            <Stamp className="mt-5">
              {t("ookActief")}<Dash />
              <b className="font-semibold text-ink">Lynk &amp; Co 01</b> · {t("lynkDetails")}
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
        label={t("proofLabel")}
        above={
          <ProofPattern
            quote={t("proofQuote")}
            accent={t("proofAccent")}
            stamp={
              <Stamp>
                {t("proofStamp1")}<Dash />{t("proofStamp2")}<Dash />
                <b className="font-semibold text-ink">{t("proofStamp3")}</b>
              </Stamp>
            }
          />
        }
        below={
          <Reveal>
            <Stamp>
              {t("proofOnder1")}<Dash />{t("proofOnder2")}<Dash />KVK 80673813<Dash />
              {t("proofOnder3")}
            </Stamp>
          </Reveal>
        }
      />

      <Breath />

      {/* ═══ INVITATION — de uitnodiging ═══ */}
      <Viewport
        meaning="invitation"
        label={t("invLabel")}
        id="boeken"
        above={
          <NarrativePattern
            kicker={t("invKicker")}
            voice={t("invVoice")}
          />
        }
        onLine={
          <Reveal delay={1}>
            <div className="flex flex-wrap items-center gap-6 border-t border-ink/30 pt-6">
              <Link
                href="/boeken"
                className="hz-confirm-btn px-10 py-4 text-[13px] font-medium uppercase tracking-[0.14em] text-ink no-underline"
              >
                <span>{t("invCta")}</span>
              </Link>
              <a href="tel:+31634744522" className="hz-guide-line text-sm text-secondary no-underline">
                {t("invBel")}
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
              {t("invStamp1")}<Dash />{t("invStamp2")}<Dash />
              <b className="font-semibold text-ink">{t("invStamp3")}</b>
            </Stamp>
          </Reveal>
        }
      />
    </>
  );
}
