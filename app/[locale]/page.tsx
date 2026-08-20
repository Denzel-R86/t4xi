import { Link } from "@/i18n/navigation";
import CmsLivePreview from "@/components/cms/CmsLivePreview";
import { Reveal } from "@/components/horizon/motion";
import {
  HorizonSpine,
  Viewport,
  NarrativePattern,
  SentencePattern,
  LedgerPattern,
  ProofPattern,
  Stamp,
  Dash,
  type LedgerEntry,
} from "@/components/horizon/patterns";
import { loadRateCard, type CityRates } from "@/lib/pricing/rate-card";
import { cleanCmsOptionalText, safeCmsInternalHref } from "@/lib/cms/safe-content";
import { loadCmsFleetPage } from "@/sanity/lib/content";
import { urlForImage } from "@/sanity/lib/image";
import type { CmsImage } from "@/sanity/types";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Image, { type StaticImageData } from "next/image";
import { stegaClean } from "next-sanity";
// Statische imports laten Next tijdens de build blur-placeholders genereren;
// de bronbestanden zelf blijven ongewijzigd.
import teslaFleet from "@/public/tesla_model_y_black.jpg";
import teslaInterior from "@/public/tesla-interieur.jpg";
import lynkFleet from "@/public/lynk_co_black.jpg";
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
        href: `/boeken?pickup=${encodeURIComponent(route.from)}&dropoff=${encodeURIComponent(route.to)}`,
      },
    ];
  });
}

/**
 * Eén voertuig als redactionele plaat: exterieur en interieur krijgen dezelfde
 * visuele status. De tweede plaat spiegelt op desktop, terwijl mobiel een
 * logische volgorde behoudt: model, exterieur, interieur.
 */
function FleetPlate({
  index,
  name,
  type,
  description,
  exterior,
  exteriorAlt,
  interior,
  interiorAlt,
  exteriorLabel,
  interiorLabel,
  attributes,
  interiorDisclosure,
  reverse = false,
  interiorPosition = "object-center",
}: {
  index: string;
  name: string;
  type: string;
  description: string;
  exterior: StaticImageData | CmsImage;
  exteriorAlt: string;
  interior: StaticImageData | CmsImage;
  interiorAlt: string;
  exteriorLabel: string;
  interiorLabel: string;
  attributes?: string[];
  interiorDisclosure?: string;
  reverse?: boolean;
  interiorPosition?: string;
}) {
  const labelClass =
    "absolute left-4 top-4 z-10 bg-ink/85 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.16em] text-white backdrop-blur-sm md:left-5 md:top-5";

  return (
    <article className="border-t border-ink/30 py-9 last:border-b md:py-12">
      <header className="mb-7 grid gap-4 md:grid-cols-[64px_minmax(0,1fr)_auto] md:items-end">
        <span className="text-[12px] font-medium tracking-[0.16em] text-stone [font-variant-numeric:tabular-nums]">
          {index}
        </span>
        <div>
          <h3 className="font-display text-[clamp(28px,3.8vw,48px)] font-bold leading-none tracking-[-0.025em] text-ink">
            {name}
          </h3>
          <p className="mt-3 max-w-xl text-sm leading-7 text-secondary">{description}</p>
          {attributes && attributes.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
              {attributes.map((attribute) => (
                <li
                  key={stegaClean(attribute)}
                  className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-secondary"
                >
                  <span aria-hidden="true" className="h-1 w-1 rounded-full bg-stone" />
                  {attribute}
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-secondary md:pb-1 md:text-right">
          {type}
        </p>
      </header>

      <div className="grid gap-px bg-ink/20 lg:grid-cols-12">
        <figure
          className={`relative aspect-[2/1] overflow-hidden bg-ink lg:col-span-8 lg:min-h-[430px] lg:aspect-auto ${
            reverse ? "lg:order-2" : ""
          }`}
        >
          <FleetImage
            source={exterior}
            alt={exteriorAlt}
            sizes="(min-width: 1024px) 62vw, 90vw"
            className="object-cover object-center saturate-[0.88] contrast-[0.98]"
            width={1800}
            height={1050}
          />
          <figcaption className={labelClass}>{exteriorLabel}</figcaption>
        </figure>

        <figure
          className={`relative aspect-[4/3] overflow-hidden bg-ink lg:col-span-4 lg:min-h-[430px] lg:aspect-auto ${
            reverse ? "lg:order-1" : ""
          }`}
        >
          <FleetImage
            source={interior}
            alt={interiorAlt}
            sizes="(min-width: 1024px) 28vw, 90vw"
            className={`object-cover saturate-[0.88] contrast-[0.98] ${interiorPosition}`}
            width={1050}
            height={1050}
          />
          <figcaption className={labelClass}>{interiorLabel}</figcaption>
          {interiorDisclosure && (
            <p className="absolute inset-x-4 bottom-4 z-10 bg-ink/80 px-3 py-2 text-[10px] leading-4 text-white/80 backdrop-blur-sm md:inset-x-5 md:bottom-5">
              {interiorDisclosure}
            </p>
          )}
        </figure>
      </div>
    </article>
  );
}

function isCmsImage(source: StaticImageData | CmsImage): source is CmsImage {
  return "asset" in source;
}

function FleetImage({
  source,
  alt,
  sizes,
  className,
  width,
  height,
}: {
  source: StaticImageData | CmsImage;
  alt: string;
  sizes: string;
  className: string;
  width: number;
  height: number;
}) {
  if (!isCmsImage(source)) {
    return (
      <Image
        src={source}
        alt={alt}
        fill
        sizes={sizes}
        placeholder="blur"
        className={className}
      />
    );
  }

  const src = urlForImage(source)
    .width(width)
    .height(height)
    .fit("crop")
    .auto("format")
    .quality(88)
    .url();
  const blurDataURL = source.asset.metadata?.lqip || undefined;

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      placeholder={blurDataURL ? "blur" : "empty"}
      blurDataURL={blurDataURL}
      className={className}
    />
  );
}

export const dynamic = "force-dynamic";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "home" });
  const cmsFleet = await loadCmsFleetPage(locale);
  const VOWS = [
    { title: t("vow1Titel"), text: t("vow1Tekst") },
    { title: t("vow2Titel"), text: t("vow2Tekst") },
    { title: t("vow3Titel"), text: t("vow3Tekst") },
    { title: t("vow4Titel"), text: t("vow4Tekst") },
  ];
  const PATHS = [
    { label: t("padDiensten"), href: "/diensten" },
    { label: t("padDagtochten"), href: "/dagtochten" },
    { label: t("padZakelijk"), href: "/zakelijk-vervoer" },
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
        <div className="order-last flex min-w-0 flex-col justify-center px-[5vw] pb-12 pt-10 md:order-none md:col-start-1 md:row-start-1 md:py-14 md:pr-[4vw]">
          <NarrativePattern
            as="h1"
            kicker={t("arrivalKicker")}
            voice={t("arrivalVoice")}
            echo={t("arrivalEcho")}
            note={t("arrivalNote")}
            immediate
            echoClassName="font-light text-secondary"
            // 2026-08-19 (hotfix): deze kop staat in de 48%-splitkolom van de
            // ARRIVAL-sectie, niet in een bijna-volle-breedte Viewport zoals de
            // overige drie NarrativePattern-koppen — de standaard `7.6vw` overschoot
            // die smalle kolom vanaf md (bv. "Van voordeur" brak middenin het woord
            // af op 1280px breed). `md:`-override schaalt tegen de kolombreedte;
            // onder md (enkele kolom, volle breedte) blijft het standaardgedrag.
            titleClassName="mt-6 font-display text-[clamp(44px,7.6vw,108px)] md:text-[clamp(40px,5.4vw,112px)] font-extrabold leading-[0.98] tracking-[-0.03em] text-ink"
          />
          <Reveal immediate>
            <div className="mt-9">
              <SentencePattern />
            </div>
          </Reveal>
          <Reveal immediate>
            <Stamp className="mt-7 leading-relaxed">
              {t("arrivalStamp1")}<Dash />{t("arrivalStamp2")}<Dash />{t("arrivalStamp3")}<Dash />
              <b className="font-semibold text-ink">{t("arrivalStamp4")}</b>
            </Stamp>
          </Reveal>
        </div>
        <figure className="relative order-first h-[32svh] min-h-[220px] max-h-[320px] overflow-hidden bg-ink md:order-none md:col-start-2 md:row-start-1 md:h-auto md:max-h-none md:min-h-full">
          <Image
            src={passagierRust}
            alt={t("recogFiguurAlt")}
            fill
            priority
            sizes="(min-width: 768px) 52vw, 100vw"
            placeholder="blur"
            className="object-cover object-[62%_center] saturate-[0.9] contrast-[0.96] md:object-[57%_center]"
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
                actionLabel={t("ledgerBook")}
                closing={
                  <Stamp>
                    <Link
                      href="/tarieven"
                      className="hz-guide-line inline-flex min-h-11 items-center text-ink no-underline"
                    >
                      {t("ledgerAlle")}
                    </Link>
                    <Dash />
                    {t("ledgerOnbekend")}
                  </Stamp>
                }
              />
            </Reveal>
            <Reveal delay={1}>
              <div className="mt-20 grid gap-5 md:grid-cols-2">
                <figure className="overflow-hidden bg-ink text-white">
                  <div className="relative aspect-[4/3]">
                    <Image
                      src={bagageOverdracht}
                      alt={t("bagageFiguurAlt")}
                      fill
                      sizes="(min-width: 768px) 45vw, 90vw"
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
                      sizes="(min-width: 768px) 45vw, 90vw"
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

      {/* ═══ JOURNEY — de rit zelf: de vloot als technische tekening ═══ */}
      <Viewport
        meaning="journey"
        label={t("journeyLabel")}
        id="vloot"
        above={
          <NarrativePattern
            kicker={cmsFleet?.intro.eyebrow ?? t("journeyKicker")}
            voice={cmsFleet?.intro.headline ?? t("journeyVoice")}
            echo={cmsFleet?.intro.headlineConclusion ?? t("journeyEcho")}
            note={cmsFleet?.intro.introduction ?? t("journeyNote")}
          />
        }
        below={
          <Reveal>
            {cmsFleet ? (
              cmsFleet.vehicles.map((vehicle, vehicleIndex) => {
                const isMoodImage = stegaClean(vehicle.interiorImageType) === "mood";
                return (
                  <FleetPlate
                    key={vehicle._key}
                    index={`${String(vehicleIndex + 1).padStart(2, "0")} / ${String(cmsFleet.vehicles.length).padStart(2, "0")}`}
                    name={vehicle.modelName}
                    type={vehicle.powertrain}
                    description={vehicle.description}
                    attributes={vehicle.attributes}
                    exterior={vehicle.exteriorImage}
                    exteriorAlt={vehicle.exteriorImage.alt}
                    interior={vehicle.interiorImage}
                    interiorAlt={vehicle.interiorImage.alt}
                    exteriorLabel={t("fleetExteriorLabel")}
                    interiorLabel={isMoodImage ? t("fleetInteriorMoodLabel") : t("fleetInteriorLabel")}
                    interiorDisclosure={
                      isMoodImage ? vehicle.moodImageDisclosure || undefined : undefined
                    }
                    reverse={vehicleIndex % 2 === 1}
                  />
                );
              })
            ) : (
              <>
                <FleetPlate
                  index="01 / 02"
                  name="Tesla Model Y"
                  type={t("fleetTeslaType")}
                  description={t("fleetTeslaDescription")}
                  exterior={teslaFleet}
                  exteriorAlt={t("fleetTeslaExteriorAlt")}
                  interior={teslaInterior}
                  interiorAlt={t("fleetTeslaInteriorAlt")}
                  exteriorLabel={t("fleetExteriorLabel")}
                  interiorLabel={t("fleetInteriorLabel")}
                  interiorPosition="object-[52%_58%]"
                />

                <FleetPlate
                  index="02 / 02"
                  name="Lynk & Co 01"
                  type={t("fleetLynkType")}
                  description={t("fleetLynkDescription")}
                  exterior={lynkFleet}
                  exteriorAlt={t("fleetLynkExteriorAlt")}
                  interior={comfortAanBoord}
                  interiorAlt={t("fleetLynkInteriorAlt")}
                  exteriorLabel={t("fleetExteriorLabel")}
                  interiorLabel={t("fleetInteriorMoodLabel")}
                  interiorDisclosure={t("fleetLynkInteriorDisclosure")}
                  interiorPosition="object-[66%_center]"
                  reverse
                />
              </>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-5">
              <Stamp className="leading-relaxed">
                {cmsFleet?.availabilityNote ?? t("fleetAvailabilityNote")}<Dash />
                <b className="font-semibold text-ink">
                  {cmsFleet?.servicePromise ?? t("fleetServiceStandard")}
                </b>
              </Stamp>
              {cmsFleet && (
                <Link
                  href={safeCmsInternalHref(cmsFleet.action.href)}
                  aria-label={cleanCmsOptionalText(cmsFleet.action.accessibleLabel)}
                  className="hz-guide-line text-[11px] font-medium uppercase tracking-[0.14em] text-ink no-underline"
                >
                  {cmsFleet.action.label}
                </Link>
              )}
            </div>
          </Reveal>
        }
      />

      {/* ═══ PROOF — uitsluitend wat aantoonbaar is ═══ */}
      {/*
        Klantcitaten en beoordelingscijfers zijn hier bewust verwijderd: er is geen
        verifieerbare bron. Zie components/sections/ReviewsSection.tsx. Wat hier staat
        is controleerbaar — de prijsbelofte, het luchthavenbeleid en het KvK-nummer.
      */}
      <Viewport
        meaning="proof"
        label={t("proofLabel")}
        compact
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

      {/* ═══ INVITATION — de uitnodiging ═══ */}
      <Viewport
        meaning="invitation"
        label={t("invLabel")}
        id="boeken"
        compact
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
      <CmsLivePreview />
    </>
  );
}
