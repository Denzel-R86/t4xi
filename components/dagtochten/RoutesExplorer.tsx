"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import { FEATURED, ROUTES, type Country, type Route } from "@/lib/dagtochten";

/** "Details bekijken"-knop van de featured Brugge-kaart, opent de routemodal. */
export function FeaturedDetailsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 flex-1 items-center justify-center rounded-md border border-line-strong bg-white/60 text-sm font-medium text-ink transition-colors hover:bg-white"
      >
        Details bekijken
      </button>
      {open && <RouteModal route={FEATURED.modal} onClose={() => setOpen(false)} />}
    </>
  );
}

const FILTERS: { key: Country | "all"; label: string }[] = [
  { key: "all", label: "Alle routes" },
  { key: "be", label: "🇧🇪 België" },
  { key: "nl", label: "🇳🇱 Nederland" },
  { key: "de", label: "🇩🇪 Duitsland" },
  { key: "lu", label: "🇱🇺 Luxemburg" },
];

/** Filterbare routegrid + detailmodal uit dagtochten.html. */
export default function RoutesExplorer() {
  const [filter, setFilter] = useState<Country | "all">("all");
  const [modal, setModal] = useState<Route | null>(null);

  const visible = ROUTES.filter((r) => filter === "all" || r.country === filter);

  return (
    <>
      {/* Filterbalk (in bron onderdeel van de hero) */}
      <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Filter op land">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              filter === f.key
                ? "border-accent bg-accent text-white"
                : "border-line bg-white/70 text-secondary hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((r) => (
          <article key={r.slug} className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-card shadow-card">
            <div className="relative flex h-36 items-center justify-center bg-[linear-gradient(135deg,#EEEAE5,#E2DDD5)] text-5xl">
              <span aria-hidden="true">{r.emoji}</span>
              <span className="absolute left-4 top-4 rounded-full bg-white/85 px-3 py-1 text-xs text-ink">
                {r.flag} {r.countryName}
              </span>
              <span className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1 text-[11px] text-secondary">
                <Icon name="clock" size={12} />
                {r.duration}
              </span>
            </div>
            <div className="flex flex-1 flex-col p-5">
              <h3 className="font-playfair text-[22px] text-ink">{r.name}</h3>
              <p className="mb-4 mt-1.5 text-[13px] leading-relaxed text-secondary">{r.tagline}</p>
              <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-secondary">
                <span className="flex items-center gap-1.5"><Icon name="map-pin" size={13} className="text-accent" />{r.km}</span>
                <span className="flex items-center gap-1.5"><Icon name="users" size={13} className="text-accent" />1–4 passagiers</span>
                <span className="flex items-center gap-1.5"><Icon name="luggage" size={13} className="text-accent" />{r.luggage}</span>
              </div>
              <ul className="mb-5 flex flex-col gap-1.5">
                {r.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-xs text-secondary">
                    <Icon name="check" size={12} className="mt-0.5 shrink-0 text-accent" />
                    {h}
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex items-baseline gap-2 border-t border-line pt-4">
                <span className="text-[11px] uppercase tracking-wider text-stone">Vanaf</span>
                <span className="font-playfair text-[28px] font-bold text-accent">{r.price}</span>
                <span className="text-xs text-secondary">retour</span>
              </div>
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={() => setModal(r)}
                  className="flex min-h-11 items-center justify-center rounded-md border border-line-strong bg-white/60 text-sm font-medium text-ink transition-colors hover:bg-white"
                >
                  Details &amp; tijdschema
                </button>
                <Link
                  href="/boeken"
                  className="flex min-h-11 items-center justify-center rounded-md bg-accent text-sm font-medium text-white shadow-cta transition-colors hover:bg-accent-hover"
                >
                  Direct boeken
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>

      {modal && <RouteModal route={modal} onClose={() => setModal(null)} />}
    </>
  );
}

export function RouteModal({ route, onClose }: { route: Route; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/70 p-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Details ${route.name}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card border border-line bg-card p-7 shadow-hero-card">
        <button
          type="button"
          onClick={onClose}
          aria-label="Sluiten"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-md text-stone hover:bg-fog hover:text-ink"
        >
          <Icon name="x" size={18} />
        </button>
        <p className="mb-2 text-[11px] uppercase tracking-[3px] text-accent">
          {route.flag} {route.countryName}
        </p>
        <h3 className="font-playfair text-2xl text-ink">{route.name}</h3>
        <p className="mt-2 inline-block rounded-full border border-line bg-fog px-3 py-1 text-xs text-secondary">
          {route.duration.replace(" rijden", "")} · {route.km}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-secondary">{route.desc}</p>
        <p className="mb-3 mt-6 text-[10px] uppercase tracking-[2px] text-accent">
          Voorbeeldschema (flexibel aanpasbaar)
        </p>
        <ul className="flex flex-col gap-2.5">
          {route.itinerary.map((it) => (
            <li key={it.t} className="flex gap-3 text-sm">
              <span className="w-12 shrink-0 font-semibold text-accent">{it.t}</span>
              <span className="text-secondary">{it.a}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex items-baseline gap-2.5 border-t border-line pt-6">
          <span className="text-xs uppercase tracking-wider text-stone">Retourprijs</span>
          <span className="font-playfair text-4xl font-bold text-accent">{route.price}</span>
          <span className="text-xs text-secondary">voor de gehele auto (max. 4 passagiers)</span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-11 items-center justify-center rounded-md border border-line-strong bg-white/60 text-sm font-medium text-ink hover:bg-white"
          >
            Sluiten
          </button>
          <Link
            href="/boeken"
            className="flex min-h-11 items-center justify-center rounded-md bg-accent text-sm font-medium text-white shadow-cta hover:bg-accent-hover"
          >
            Boek deze route
          </Link>
        </div>
      </div>
    </div>
  );
}
