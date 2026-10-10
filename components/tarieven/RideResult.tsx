"use client";

import "@/components/booking/handoff/handoff.css";
import { useLocale, useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import JourneyLine from "@/components/horizon/JourneyLine";
import TariffComparison from "@/components/tarieven/TariffComparison";
import { rideBuildUp, type ServerQuoteFields } from "@/lib/tarieven/ride-result";
import type { JourneyState } from "@/lib/horizon/journey-line-state";

/** Korte plaatsnaam zoals in de hero-zin ("Amsterdam Zuidas, Amsterdam" → "Amsterdam Zuidas"). */
const short = (label: string) => label.split(",")[0]?.trim() || label;

/**
 * "UW RIT" — het prijsresultaat van de RouteFinder (Experience 2.0 PR 2.7, §3).
 * Zelfde beeldtaal als de resultaatregel van de hero-zin (PR 2.1): JourneyLine,
 * de serverprijs en één primaire actie (Button v2). De JourneyLine en de prijs
 * dragen de handoff-namen (handoff.css), zodat ze naar /boeken doorlopen.
 *
 * Prijsopbouw: alleen velden die de server teruggaf (`rideBuildUp`), plus de
 * objectieve vergelijking met het wettelijke maximumtarief (TariffComparison).
 */
export default function RideResult({
  pickup,
  dropoff,
  summary,
  quote,
  journey,
  time,
  passengers,
  luggageLabel,
  isArrival,
  needsFlight,
  bookingHref,
  onBook,
  schipholRoute,
}: {
  pickup: string;
  dropoff: string;
  summary: string;
  quote: ServerQuoteFields;
  /** Uit `journeyStateFor`: `arrived` alleen bij een backend-bevestigde quote (§4). */
  journey: JourneyState;
  time: string;
  passengers: number;
  /** De al-vertaalde, daadwerkelijk gekozen bagagecategorie. */
  luggageLabel: string;
  isArrival: boolean;
  needsFlight: boolean;
  bookingHref: string;
  onBook: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  schipholRoute: { slug: string; naam: string } | null;
}) {
  const t = useTranslations("routezoeker");
  const locale = useLocale();
  const money = new Intl.NumberFormat(locale === "nl" ? "nl-NL" : "en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const { price, returnApplied, distanceKm, estimatedDurationMin } = quote;

  const facts: { label: string; value: string }[] = [
    { label: t("factVoertuig"), value: t("voertuigKlasse") },
    { label: t("factPassagiers"), value: t("passagiersMax", { max: 4, gekozen: passengers }) },
    { label: t("factBagage"), value: luggageLabel || "—" },
    { label: t("factWachttijd"), value: isArrival ? t("wachttijdLucht") : t("wachttijdStandaard") },
  ];
  const proofs = [
    "bewijsVaste", "bewijsChauffeur", "bewijsVoertuig", "bewijsBagage",
    ...(needsFlight ? (["bewijsVlucht"] as const) : []), "bewijsGeenVerrassing",
  ] as const;
  const buildUp = rideBuildUp(quote);

  return (
    <section
      aria-labelledby="uw-rit-kop"
      data-testid="uw-rit"
      className="hz-reveal hz-in overflow-hidden rounded-[28px] border border-line-strong bg-card shadow-card-lg"
    >
      {/* ── UW RIT: route, serverprijs, één primaire actie ── */}
      <div className="px-6 pb-6 pt-5 md:px-8 md:pb-7">
        <h3 id="uw-rit-kop" className="text-meta font-semibold uppercase text-accent">
          {t("kaartKop")}
        </h3>
        <div className="hx-handoff-journey mt-4">
          <JourneyLine state={journey} from={short(pickup)} to={short(dropoff)} fromMeta={time || undefined} decorative />
        </div>
        <p className="mt-3 text-[13px] leading-snug text-secondary">{summary}</p>

        <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-ink/30 pt-4">
          <span className="hx-handoff-price font-display text-[40px] font-semibold leading-none text-ink [font-variant-numeric:tabular-nums] md:text-[48px]">
            € {price}
          </span>
          <span className="text-sm text-secondary">
            {returnApplied ? t("vastRetour") : t("vastEnkel")} · {t("inclBtw")} · {t("geenSurge")}
          </span>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* §13e: één primary per sectie; de routepagina is secondary. */}
          <Button href={bookingHref} variant="primary" size="lg" onClick={onBook} className="sm:flex-1">
            {t("boekDezeRit")}
          </Button>
          {schipholRoute && (
            <Button href={`/${schipholRoute.slug}`} variant="secondary" size="lg" arrow>
              {t("bekijkRoute", { stad: schipholRoute.naam })}
            </Button>
          )}
        </div>
      </div>

      {/* ── Details en prijsopbouw ── */}
      <div className="border-t border-line bg-fog/60 px-6 py-6 md:px-8">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label} className="border-t border-line pt-3">
              <dt className="text-[10px] uppercase tracking-[0.12em] text-stone-text">{f.label}</dt>
              <dd className="mt-0.5 text-sm font-semibold text-ink [font-variant-numeric:tabular-nums]">{f.value}</dd>
            </div>
          ))}
        </dl>

        {buildUp.length > 0 && (
          <div className="mt-6" data-testid="prijsopbouw">
            {/* Geen eigen kop: een nieuw label is een copyvoorstel (§0c) — de regels
                dragen alleen bestaande labels bij serverwaarden. */}
            <dl className="space-y-2 text-sm">
              {buildUp.map((row) =>
                row.kind === "fact" ? (
                  <div key={row.source} data-source={row.source} className="flex items-baseline justify-between gap-3">
                    <dt className="text-secondary">{t(row.labelKey)}</dt>
                    <dd className="text-right font-medium text-ink [font-variant-numeric:tabular-nums]">{row.value}</dd>
                  </div>
                ) : (
                  <div
                    key={row.source}
                    data-source={row.source}
                    className="flex items-baseline justify-between gap-3 border-t border-line pt-2"
                  >
                    <dt className="font-medium text-ink first-letter:uppercase">
                      {t(row.labelKey)} · {t("inclBtw")}
                    </dt>
                    <dd className="text-right font-semibold text-ink [font-variant-numeric:tabular-nums]">
                      € {money.format(row.amount)}
                    </dd>
                  </div>
                )
              )}
            </dl>
          </div>
        )}

        <TariffComparison distanceKm={distanceKm} durationMin={estimatedDurationMin} price={price} />

        <ul className="mt-6 grid gap-2 sm:grid-cols-2">
          {proofs.map((k) => (
            <li key={k} className="flex items-start gap-2 text-[13px] text-secondary">
              <Icon name="circle-check" size={15} className="mt-0.5 shrink-0 text-accent" />
              {t(k)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
