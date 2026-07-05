"use client";

import { useState } from "react";
import Icon from "@/components/ui/Icon";
import type { Stad } from "@/lib/seo-steden";

const inputCls =
  "min-h-[48px] w-full rounded-field border border-[rgba(31,39,48,0.14)] bg-field px-4 text-[15px] font-medium text-ink placeholder:font-normal placeholder:text-stone focus:border-accent focus:bg-white focus:shadow-[0_0_0_4px_rgba(40,49,59,0.10)] focus:outline-none";
const labelCls = "mb-1.5 block text-xs font-bold text-secondary";

/** Prijskaart met snelboek-formulier van de SEO-landingspagina's. */
export default function QuickBookCard({ stad }: { stad: Stad }) {
  const [sent, setSent] = useState(false);

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-line bg-card p-6 shadow-hero-card md:p-7">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-accent via-stone to-stone-subtle" />
      <p className="mb-3 text-[11px] uppercase tracking-[3px] text-accent">
        {stad.naam} → Schiphol Airport
      </p>
      <p className="font-display text-[64px] font-bold leading-none text-accent md:text-[80px]">
        {stad.prijs}
      </p>
      <p className="mt-2 text-[13px] text-secondary">Vaste prijs enkele rit · incl. btw</p>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { val: stad.retour, label: "Retour" },
          { val: stad.afstand, label: "Afstand" },
          { val: stad.reistijd, label: "Reistijd" },
          { val: "4 pers.", label: "Max. personen" },
        ].map((pd) => (
          <div key={pd.label} className="rounded-xl border border-line bg-fog px-3 py-2.5 text-center">
            <div className="font-display text-lg font-bold text-ink">{pd.val}</div>
            <div className="mt-0.5 text-[11px] text-stone">{pd.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-secondary">
        Nachttarief (23:00–06:00): +15% = {stad.nacht}
      </p>

      <form
        className="mt-5 border-t border-line pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          setSent(true);
        }}
      >
        <p className="mb-4 text-[10px] uppercase tracking-[2px] text-accent">Snel boeken</p>
        <div className="grid gap-3">
          <div>
            <label htmlFor="qb-date" className={labelCls}>Datum</label>
            <input id="qb-date" type="date" required className={inputCls} />
          </div>
          <div>
            <label htmlFor="qb-time" className={labelCls}>Vertrektijd</label>
            <input id="qb-time" type="time" defaultValue="06:00" className={inputCls} />
          </div>
          <div>
            <label htmlFor="qb-name" className={labelCls}>Naam</label>
            <input id="qb-name" placeholder="Uw naam" autoComplete="name" required className={inputCls} />
          </div>
          <div>
            <label htmlFor="qb-phone" className={labelCls}>Telefoon / WhatsApp</label>
            <input id="qb-phone" type="tel" placeholder="+31 6 ..." autoComplete="tel" className={inputCls} />
          </div>
        </div>
        {sent && (
          <p className="mt-4 flex items-center gap-2 rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-3 text-[13px] text-green-700">
            <Icon name="check" size={15} />
            Boeking ontvangen! Wij bevestigen via WhatsApp.
          </p>
        )}
        <button
          type="submit"
          className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md bg-accent px-6 font-display text-sm font-medium text-white shadow-cta transition-colors hover:bg-accent-hover"
        >
          <Icon name="calendar-check" size={16} />
          Bevestig boeking — {stad.prijs}
        </button>
      </form>
    </div>
  );
}
