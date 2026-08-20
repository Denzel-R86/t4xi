import { Link } from "@/i18n/navigation";
import Icon from "@/components/ui/Icon";
import { getAirportLandingCopy } from "@/lib/airport-landing-copy";
import { formatEuroForLocale } from "@/lib/format/currency";
import type { AirportLandingLocale, LocalizedStad } from "@/lib/seo-steden";
import type { RateEntry } from "@/lib/pricing/rate-card";

/**
 * Tarievenkaart op de SEO-landingspagina's — vervangt QuickBookCard.
 *
 * De oude QuickBookCard toonde een boekingsformulier dat bij verzenden alleen
 * `e.preventDefault()` deed en een groene bevestiging liet zien. Er werd niets
 * verstuurd: geen boeking, geen e-mail, geen chauffeur. Klanten dachten geboekt te
 * hebben terwijl er niets gebeurde — op precies de pagina's waar het verkeer met de
 * hoogste koopintentie binnenkomt.
 *
 * Hier staat nu wat de pagina wél kan waarmaken: de echte tarieven uit de engine,
 * en een link naar de boekingsflow die werkt. Eén boekingsimplementatie, niet twee.
 *
 * Prijzen komen uit `loadRateCard()`. Levert die niets, dan tonen we géén bedrag —
 * liever een eerlijke verwijzing dan een verkeerd getal.
 */
export default function RateTable({
  stad,
  rates,
  bookingHref,
  locale,
}: {
  stad: LocalizedStad;
  rates: RateEntry[];
  bookingHref: string;
  locale: AirportLandingLocale;
}) {
  const heeftTarieven = rates.length > 0;
  const copy = getAirportLandingCopy(locale).rateTable;

  return (
    <aside
      className="rounded-card border border-line bg-white/70 p-6 shadow-card backdrop-blur-sm"
      aria-labelledby="tarieven-titel"
    >
      <p className="text-eyebrow font-medium uppercase text-accent">{copy.eyebrow}</p>
      <h2 id="tarieven-titel" className="mt-2 font-display text-xl font-bold text-ink">
        {stad.naam} → Schiphol
      </h2>

      {heeftTarieven ? (
        <>
          <p className="mt-2 text-sm text-secondary">{copy.oneWay}</p>
          <ul className="mt-4 list-none border-t border-line">
            {rates.map((r) => (
              <li
                key={`${r.from}-${r.to}`}
                className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 border-b border-line py-3"
              >
                <span className="text-sm font-medium text-ink">
                  {stad.rateLabelTranslations[r.from] ?? r.from}
                </span>
                <span className="text-[11px] uppercase tracking-[0.1em] text-secondary [font-variant-numeric:tabular-nums]">
                  {r.distanceKm} km
                </span>
                <span className="text-right text-sm font-bold text-ink [font-variant-numeric:tabular-nums]">
                  {formatEuroForLocale(r.single, locale)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-secondary">{copy.returnNote}</p>
        </>
      ) : (
        <p className="mt-3 text-sm text-secondary">{copy.fallback}</p>
      )}

      <Link
        href={bookingHref}
        className="mt-5 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-md bg-accent px-6 font-display text-base font-medium text-white shadow-cta transition-colors hover:bg-accent-hover"
      >
        <Icon name="calendar-check" size={18} />
        {copy.button}
      </Link>

      <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-secondary">
        {copy.flightNote}
      </p>
    </aside>
  );
}
