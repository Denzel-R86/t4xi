"use client";

import { useState } from "react";
import Icon from "@/components/ui/Icon";

const inputCls =
  "min-h-[52px] w-full rounded-field border border-[rgba(31,39,48,0.14)] bg-field px-4 text-[15px] font-medium text-ink placeholder:font-normal placeholder:text-stone focus:border-accent focus:bg-white focus:shadow-[0_0_0_4px_rgba(40,49,59,0.10)] focus:outline-none";
const labelCls = "mb-1.5 block text-xs font-bold text-secondary";

const PAKKETTEN = [
  { value: 0.2, fixed: 0, label: "Starter — €0 + 20%" },
  { value: 0.12, fixed: 99, label: "Pro — €99 + 12%" },
  { value: 0.08, fixed: 199, label: "Elite — €199 + 8%" },
  { value: 0.05, fixed: 299, label: "Fleet — €299 + 5%" },
];

const euro = (n: number) =>
  "€" + Math.round(n).toLocaleString("nl-NL");

/** Verdiencalculator uit partner.html (#calculator). */
export function EarningsCalculator() {
  const [ritten, setRitten] = useState(75);
  const [prijs, setPrijs] = useState(79);
  const [pakket, setPakket] = useState(1);

  const p = PAKKETTEN[pakket];
  const omzet = ritten * prijs;
  const netto = omzet * (1 - p.value) - p.fixed;
  const uber = omzet * 0.65;
  const verschil = netto - uber;

  return (
    <div className="rounded-card border border-line bg-card p-6 shadow-card md:p-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="c-ritten" className={labelCls}>Ritten per maand</label>
          <input
            id="c-ritten" type="number" min={1} max={300} value={ritten}
            onChange={(e) => setRitten(Number(e.target.value) || 0)}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="c-prijs" className={labelCls}>Gem. ritprijs (€)</label>
          <input
            id="c-prijs" type="number" min={10} max={500} value={prijs}
            onChange={(e) => setPrijs(Number(e.target.value) || 0)}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="c-pakket" className={labelCls}>Jouw pakket</label>
          <select
            id="c-pakket" value={pakket}
            onChange={(e) => setPakket(Number(e.target.value))}
            className={inputCls}
          >
            {PAKKETTEN.map((pk, i) => (
              <option key={pk.label} value={i}>{pk.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-live="polite">
        {[
          { val: euro(omzet), label: "Bruto omzet" },
          { val: euro(netto), label: "Netto verdienst", highlight: true },
          { val: euro(uber), label: "Bij Andere platforms (65%)" },
          { val: `+${euro(verschil)}`, label: "Extra per maand", green: true },
        ].map((r) => (
          <div
            key={r.label}
            className={`rounded-xl border p-4 text-center ${r.highlight ? "border-accent bg-accent/5" : "border-line bg-fog"}`}
          >
            <div className={`font-display text-2xl font-bold ${r.green ? "text-green-600" : "text-ink"}`}>
              {r.val}
            </div>
            <div className="mt-1 text-[11px] text-secondary">{r.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-secondary">
        Netto verdienst = omzet − commissie − maandbedrag. Vergelijking op
        basis van 65% chauffeursaandeel bij grote platforms.
      </p>
    </div>
  );
}

/** Aanmeldformulier uit partner.html (#aanmelden). */
export function PartnerSignupForm() {
  const [sent, setSent] = useState(false);

  return (
    <form
      className="relative overflow-hidden rounded-[28px] border border-line bg-card p-6 shadow-hero-card md:p-7"
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-accent via-stone to-stone-subtle" />
      {sent && (
        <p className="mb-5 flex items-center gap-2 rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-3.5 text-sm text-green-700">
          <Icon name="check" size={16} />
          Aanmelding ontvangen — wij bellen je binnen 24 uur!
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="p-naam" className={labelCls}>Naam *</label>
          <input id="p-naam" placeholder="Volledige naam" autoComplete="name" required className={inputCls} />
        </div>
        <div>
          <label htmlFor="p-tel" className={labelCls}>Telefoon *</label>
          <input id="p-tel" type="tel" placeholder="+31 6 ..." autoComplete="tel" required className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="p-email" className={labelCls}>E-mail</label>
          <input id="p-email" type="email" placeholder="uw@email.nl" autoComplete="email" className={inputCls} />
        </div>
        <div>
          <label htmlFor="p-auto" className={labelCls}>Voertuig</label>
          <input id="p-auto" placeholder="Bijv. Tesla Model Y 2023" className={inputCls} />
        </div>
        <div>
          <label htmlFor="p-verg" className={labelCls}>Type vergunning</label>
          <select id="p-verg" defaultValue="" className={inputCls}>
            <option value="" disabled>Selecteer...</option>
            <option>Taxivergunning (TCA)</option>
            <option>Chauffeurskaart + eigen voertuig</option>
            <option>Eigen taxibedrijf / vloot</option>
            <option>Nog niet — heb hulp nodig</option>
          </select>
        </div>
        <div>
          <label htmlFor="p-regio" className={labelCls}>Werkgebied</label>
          <select id="p-regio" defaultValue="" className={inputCls}>
            <option value="" disabled>Selecteer regio...</option>
            <option>Almere / Flevoland</option>
            <option>Amsterdam</option>
            <option>Rotterdam</option>
            <option>Utrecht</option>
            <option>Den Haag</option>
            <option>Meerdere regio&apos;s</option>
          </select>
        </div>
        <div>
          <label htmlFor="p-ritten" className={labelCls}>Gem. ritten/week</label>
          <select id="p-ritten" className={inputCls}>
            <option>1–10 ritten</option>
            <option>11–20 ritten</option>
            <option>21–40 ritten</option>
            <option>40+ ritten</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="p-pakket" className={labelCls}>Gewenst pakket *</label>
          <select id="p-pakket" required defaultValue="" className={inputCls}>
            <option value="" disabled>Kies een pakket...</option>
            <option>Starter — €0/maand + 20%</option>
            <option>Pro — €99/maand + 12%</option>
            <option>Elite — €199/maand + 8%</option>
            <option>Fleet — €299/maand + 5%</option>
          </select>
        </div>
      </div>
      <button
        type="submit"
        className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-md bg-accent px-8 font-display text-base font-medium text-white shadow-cta transition-all hover:-translate-y-0.5 hover:bg-accent-hover"
      >
        <Icon name="send" size={17} />
        Aanmelding versturen
      </button>
      <p className="mt-3 text-center text-xs text-secondary">
        Of bel direct:{" "}
        <a href="tel:+31634744522" className="text-accent hover:underline">+31 6 34 74 45 22</a>
      </p>
    </form>
  );
}
