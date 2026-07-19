import type { Metadata } from "next";
import Link from "next/link";
import "@/components/horizon/horizon.css";
import FairBand from "@/components/sections/FairBand";
import { loadRateCard, type CityRates, type RateEntry } from "@/lib/pricing/rate-card";

/**
 * Tarievenpagina — Editorial Ledger binnen de Horizon Design Language.
 *
 * Server-rendered uit DEZELFDE bron als de Pricing Engine (fixed_route_prices),
 * zodat tarievenpagina, homepage-quote en /boeken nooit uiteenlopen. Per
 * vertrekstad twee gescheiden groepen: Naar Schiphol en Intercity. Geen tabs,
 * geen cards, geen pricing-table — hairlines, tabellaire cijfers, ademruimte.
 *
 * ISR: uurlijkse revalidatie behoudt statische SEO-waarde met verse prijzen.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Tarieven",
  description:
    "Vaste T4XI-tarieven vanuit Amsterdam, Rotterdam, Almere en Utrecht. Naar Schiphol en intercity — enkele rit en retour, geen verrassingen.",
  alternates: { canonical: "/tarieven" },
};

const eur = (n: number) => `€ ${n}`;

function RateRows({ entries }: { entries: RateEntry[] }) {
  return (
    <ul className="mt-3 list-none">
      {entries.map((e) => (
        <li
          key={`${e.from}-${e.to}`}
          className="grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1 border-t border-line py-4 first:border-t-0 sm:grid-cols-[1fr_auto_auto_auto]"
        >
          <span className="font-display text-[15px] font-medium text-ink sm:text-base">
            {e.from} <span className="text-stone">→</span> {e.to}
          </span>
          <span className="order-3 text-xs uppercase tracking-[0.1em] text-stone sm:order-none [font-variant-numeric:tabular-nums]">
            {e.distanceKm} km
          </span>
          <span className="text-right font-display text-[15px] font-bold text-ink [font-variant-numeric:tabular-nums] sm:text-base">
            {eur(e.single)}
          </span>
          <span className="order-4 text-right text-sm text-secondary [font-variant-numeric:tabular-nums] sm:order-none">
            {e.retour !== null ? <>retour {eur(e.retour)}</> : <>—</>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RouteGroup({ title, entries, cityName }: { title: string; entries: RateEntry[]; cityName: string }) {
  return (
    <div className="mt-9">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-secondary">{title}</h3>
      {entries.length > 0 ? (
        <RateRows entries={entries} />
      ) : (
        <p className="mt-3 border-t border-line pt-4 text-sm text-secondary">
          Andere bestemming vanuit {cityName}?{" "}
          <Link href="/boeken" className="hz-guide-line text-ink no-underline">
            Vraag een vaste prijs aan
          </Link>
          .
        </p>
      )}
    </div>
  );
}

function CitySection({ city }: { city: CityRates }) {
  return (
    <section aria-labelledby={`stad-${city.citySlug}`} className="border-t border-ink/25 pt-12">
      <p className="flex items-center gap-3.5 text-[11px] font-medium uppercase tracking-[0.16em] text-secondary">
        <span aria-hidden="true" className="h-px w-8 bg-ink" />
        Vertrek
      </p>
      <h2
        id={`stad-${city.citySlug}`}
        className="mt-3 font-display text-[clamp(30px,4.4vw,54px)] font-extrabold leading-none tracking-[-0.02em] text-ink"
      >
        Vanuit {city.cityName}
      </h2>
      <RouteGroup title="Naar Schiphol" entries={city.toSchiphol} cityName={city.cityName} />
      <RouteGroup title="Intercity" entries={city.intercity} cityName={city.cityName} />
    </section>
  );
}

export default async function TarievenPage() {
  const cities = await loadRateCard();

  return (
    <>
      <main className="mx-auto max-w-site px-[5vw] py-20 md:py-28">
        <header className="max-w-3xl">
          <p className="flex items-center gap-3.5 text-[11px] font-medium uppercase tracking-[0.16em] text-secondary">
            <span aria-hidden="true" className="h-px w-8 bg-ink" />
            Vaste tarieven — geen taxameter, geen verrassing
          </p>
          <h1 className="mt-6 font-display text-[clamp(40px,7vw,96px)] font-extrabold leading-[0.98] tracking-[-0.03em] text-ink">
            Elke rit heeft
            <br />
            <span className="font-light text-stone">zijn prijs.</span>
          </h1>
          <p className="mt-6 text-secondary">
            Prijzen voor de enkele rit met onze executive-EV (Tesla Model Y / Lynk &amp; Co). Retour staat per route
            vermeld. Nachttarief (23:00–06:00) +15%. Alle bedragen inclusief btw, maximaal 4 passagiers exclusief
            chauffeur.
          </p>
        </header>

        <div className="mt-16 space-y-16">
          {cities.length > 0 ? (
            cities.map((city) => <CitySection key={city.citySlug} city={city} />)
          ) : (
            <p className="border-t border-ink/25 pt-12 text-secondary">
              Tarieven zijn momenteel niet beschikbaar.{" "}
              <Link href="/boeken" className="hz-guide-line text-ink no-underline">
                Vraag een vaste prijs aan
              </Link>
              .
            </p>
          )}
        </div>

        <p className="mt-16 border-t border-line pt-6 text-[13px] leading-relaxed text-secondary">
          Staat uw route er niet bij?{" "}
          <Link href="/boeken" className="hz-guide-line text-ink no-underline">
            Vraag een vaste prijs aan
          </Link>{" "}
          — of bel{" "}
          <a href="tel:+31634744522" className="hz-guide-line text-ink no-underline">
            +31 6 34 74 45 22
          </a>
          . Adviesbagage: 2 grote koffers + 2 handbagage bij 4 passagiers, of 3 grote koffers bij maximaal 3 passagiers.
        </p>
      </main>
      <FairBand />
    </>
  );
}
