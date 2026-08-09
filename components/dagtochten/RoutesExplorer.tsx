"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import Icon from "@/components/ui/Icon";
import { getFeatured, getRoutes, type Country, type Locale, type Route } from "@/lib/dagtochten";

/**
 * Bestemmingsbeeld met terugval. Heeft de route een eigen foto
 * (/public/dagtochten/<slug>.jpg), dan tonen we die; anders het emoji-vlak dat
 * er al was. Zo blijft het raster consistent en kan later per route een foto
 * worden bijgeplaatst zonder de kaart te herbouwen.
 */
function RouteMedia({ route, sizes, emojiClass }: { route: Route; sizes: string; emojiClass: string }) {
  if (route.image) {
    return (
      <Image
        src={route.image}
        alt={route.name}
        fill
        sizes={sizes}
        className="object-cover"
      />
    );
  }
  return <span aria-hidden="true" className={emojiClass}>{route.emoji}</span>;
}

/** "Details bekijken"-knop van de featured Brugge-kaart, opent de routemodal. */
export function FeaturedDetailsButton() {
  const [open, setOpen] = useState(false);
  const locale = useLocale() as Locale;
  const t = useTranslations("routes");
  const featured = getFeatured(locale);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 flex-1 items-center justify-center rounded-md border border-line-strong bg-white/60 text-sm font-medium text-ink transition-colors hover:bg-white"
      >
        {t("detailsBekijken")}
      </button>
      {open && <RouteModal route={featured.modal} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Filterbare routegrid + detailmodal uit dagtochten.html. */
export default function RoutesExplorer() {
  const [filter, setFilter] = useState<Country | "all">("all");
  const [modal, setModal] = useState<Route | null>(null);
  const locale = useLocale() as Locale;
  const t = useTranslations("routes");
  const td = useTranslations("dagtochten");

  const FILTERS: { key: Country | "all"; label: string }[] = [
    { key: "all", label: t("filterAlle") },
    { key: "be", label: `🇧🇪 ${td("landBE")}` },
    { key: "nl", label: `🇳🇱 ${td("landNL")}` },
    { key: "de", label: `🇩🇪 ${td("landDE")}` },
    { key: "lu", label: `🇱🇺 ${td("landLU")}` },
  ];

  const visible = getRoutes(locale).filter((r) => filter === "all" || r.country === filter);

  return (
    <>
      {/* Filterbalk (in bron onderdeel van de hero) */}
      <div className="flex flex-wrap justify-center gap-2" role="group" aria-label={t("filterAria")}>
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
            <div className="relative flex h-36 items-center justify-center overflow-hidden bg-[linear-gradient(135deg,#EEEAE5,#E2DDD5)]">
              <RouteMedia
                route={r}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                emojiClass="text-5xl"
              />
              <span className="absolute left-4 top-4 z-10 rounded-full bg-white/85 px-3 py-1 text-xs text-ink backdrop-blur-sm">
                {r.flag} {r.countryName}
              </span>
              <span className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1 text-[11px] text-secondary backdrop-blur-sm">
                <Icon name="clock" size={12} />
                {r.duration}
              </span>
            </div>
            <div className="flex flex-1 flex-col p-5">
              <h3 className="font-playfair text-[22px] text-ink">{r.name}</h3>
              <p className="mb-4 mt-1.5 text-[13px] leading-relaxed text-secondary">{r.tagline}</p>
              <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-secondary">
                <span className="flex items-center gap-1.5"><Icon name="map-pin" size={13} className="text-accent" />{r.km}</span>
                <span className="flex items-center gap-1.5"><Icon name="users" size={13} className="text-accent" />{t("passagiers")}</span>
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
                {r.onAanvraag ? (
                  <span className="font-playfair text-[22px] font-bold text-accent">{t("opAanvraag")}</span>
                ) : (
                  <>
                    <span className="font-playfair text-[28px] font-bold text-accent">{r.price}</span>
                    <span className="text-xs text-secondary">{t("retourAuto")}</span>
                  </>
                )}
              </div>
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={() => setModal(r)}
                  className="flex min-h-11 items-center justify-center rounded-md border border-line-strong bg-white/60 text-sm font-medium text-ink transition-colors hover:bg-white"
                >
                  {t("details")}
                </button>
                {/* Gewone <a>: in-page anker, native browserscroll — geen router nodig. */}
                <a
                  href="#aanvragen"
                  className="flex min-h-11 items-center justify-center rounded-md bg-accent text-sm font-medium text-white shadow-cta transition-colors hover:bg-accent-hover"
                >
                  {t("aanvragen")}
                </a>
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
  const t = useTranslations("routes");
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute("hidden"));
      if (focusable.length === 0) {
        e.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/70 p-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card border border-line bg-card p-7 shadow-hero-card outline-none"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t("sluiten")}
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-md bg-white/80 text-ink backdrop-blur-sm hover:bg-white"
        >
          <Icon name="x" size={18} />
        </button>
        {route.image && (
          <div className="relative -mx-7 -mt-7 mb-5 h-48 overflow-hidden">
            <Image src={route.image} alt={route.name} fill sizes="(max-width: 640px) 100vw, 512px" className="object-cover" />
          </div>
        )}
        <p className="mb-2 text-[11px] uppercase tracking-[3px] text-accent">
          {route.flag} {route.countryName}
        </p>
        <h3 id={titleId} className="font-playfair text-2xl text-ink">{route.name}</h3>
        <p className="mt-2 inline-block rounded-full border border-line bg-fog px-3 py-1 text-xs text-secondary">
          {route.duration.replace(/ (rijden|drive)$/, "")} · {route.km}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-secondary">{route.desc}</p>
        <p className="mb-3 mt-6 text-[10px] uppercase tracking-[2px] text-accent">
          {t("programma")}
        </p>
        <ul className="flex flex-col gap-2.5">
          {route.itinerary.map((onderdeel) => (
            <li key={onderdeel} className="flex gap-3 text-sm">
              <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
              <span className="text-secondary">{onderdeel}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-[1.7] text-stone">
          {t("programmaNa")}
        </p>
        <div className="mt-6 flex items-baseline gap-2.5 border-t border-line pt-6">
          {route.onAanvraag ? (
            <>
              <span className="font-playfair text-2xl font-bold text-accent">{t("opAanvraag")}</span>
              <span className="text-xs text-secondary">{t("maatwerk")}</span>
            </>
          ) : (
            <>
              <span className="text-xs uppercase tracking-wider text-stone">{t("retourPrijs")}</span>
              <span className="font-playfair text-4xl font-bold text-accent">{route.price}</span>
              <span className="text-xs text-secondary">{t("heleAuto")}</span>
            </>
          )}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-11 items-center justify-center rounded-md border border-line-strong bg-white/60 text-sm font-medium text-ink hover:bg-white"
          >
            {t("sluiten")}
          </button>
          {/* onClose sluit de modal, anders scrollt de achtergrond onzichtbaar weg. */}
          <a
            href="#aanvragen"
            onClick={onClose}
            className="flex min-h-11 items-center justify-center rounded-md bg-accent text-sm font-medium text-white shadow-cta hover:bg-accent-hover"
          >
            {t("aanvragen")}
          </a>
        </div>
      </div>
    </div>
  );
}
