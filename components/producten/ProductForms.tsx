"use client";

import { useState, type ReactNode } from "react";
import Icon from "@/components/ui/Icon";

const inputCls =
  "min-h-[52px] w-full rounded-field border border-[rgba(31,39,48,0.14)] bg-field px-4 text-[15px] font-medium text-ink placeholder:font-normal placeholder:text-stone focus:border-accent focus:bg-white focus:shadow-[0_0_0_4px_rgba(40,49,59,0.10)] focus:outline-none";
const labelCls = "mb-1.5 block text-xs font-bold text-secondary";

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function FormShell({
  title,
  intro,
  success,
  cta,
  note,
  children,
}: {
  title: string;
  intro: string;
  success: string;
  cta: string;
  note?: string;
  children: ReactNode;
}) {
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
      <h3 className="font-display text-xl font-bold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm text-secondary">{intro}</p>
      {sent && (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm text-green-700">
          <Icon name="check" size={16} />
          {success}
        </p>
      )}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">{children}</div>
      <button
        type="submit"
        className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-md bg-accent px-8 font-display text-base font-medium text-white shadow-cta transition-all hover:-translate-y-0.5 hover:bg-accent-hover"
      >
        <Icon name="send" size={17} />
        {cta}
      </button>
      {note && <p className="mt-3 text-center text-xs text-secondary">{note}</p>}
    </form>
  );
}

export function MembershipForm() {
  return (
    <FormShell
      title="Membership aanvragen"
      intro="Kies je pakket en wij nemen binnen 24 uur contact op."
      success="Aanvraag ontvangen — wij bellen je morgen!"
      cta="Membership aanvragen"
      note="Geen jaarcontract. Altijd opzegbaar."
    >
      <Field id="m-naam" label="Naam">
        <input id="m-naam" placeholder="Volledige naam" autoComplete="name" required className={inputCls} />
      </Field>
      <Field id="m-tel" label="Telefoon">
        <input id="m-tel" type="tel" placeholder="+31 6 ..." autoComplete="tel" className={inputCls} />
      </Field>
      <div className="sm:col-span-2">
        <Field id="m-email" label="E-mail">
          <input id="m-email" type="email" placeholder="uw@email.nl" autoComplete="email" className={inputCls} />
        </Field>
      </div>
      <Field id="m-loc" label="Vertreklocatie">
        <input id="m-loc" placeholder="Bijv. Almere Stad" className={inputCls} />
      </Field>
      <Field id="m-ritten" label="Gem. ritten/maand">
        <select id="m-ritten" className={inputCls}>
          <option>1–3 ritten</option>
          <option>4–6 ritten</option>
          <option>7–10 ritten</option>
          <option>10+ ritten</option>
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field id="m-pakket" label="Pakket voorkeur">
          <select id="m-pakket" defaultValue="Business — €549/maand (8 ritten)" className={inputCls}>
            <option>Frequent — €279/maand (4 ritten)</option>
            <option>Business — €549/maand (8 ritten)</option>
            <option>Executive — maatwerk</option>
          </select>
        </Field>
      </div>
    </FormShell>
  );
}

export function StrippenkaartForm() {
  return (
    <FormShell
      title="Strippenkaart aanvragen"
      intro="Zakelijk, inclusief factuur op naam en BTW-nummer."
      success="Aanvraag ontvangen — offerte binnen 1 werkdag!"
      cta="Offerte aanvragen"
    >
      <Field id="z-naam" label="Contactpersoon">
        <input id="z-naam" placeholder="Naam" autoComplete="name" required className={inputCls} />
      </Field>
      <Field id="z-func" label="Functie">
        <input id="z-func" placeholder="Bijv. Office Manager" className={inputCls} />
      </Field>
      <div className="sm:col-span-2">
        <Field id="z-bedrijf" label="Bedrijfsnaam">
          <input id="z-bedrijf" placeholder="Uw bedrijfsnaam" className={inputCls} />
        </Field>
      </div>
      <Field id="z-email" label="E-mail">
        <input id="z-email" type="email" placeholder="zakelijk@bedrijf.nl" autoComplete="email" className={inputCls} />
      </Field>
      <Field id="z-tel" label="Telefoon">
        <input id="z-tel" type="tel" placeholder="+31 6 ..." autoComplete="tel" className={inputCls} />
      </Field>
      <Field id="z-size" label="Aantal medewerkers">
        <select id="z-size" className={inputCls}>
          <option>1–5</option>
          <option>6–20</option>
          <option>21–50</option>
          <option>50+</option>
        </select>
      </Field>
      <Field id="z-pakket" label="Pakket voorkeur">
        <select id="z-pakket" defaultValue="Team — €899 (20 ritten)" className={inputCls}>
          <option>Starter — €499 (10 ritten)</option>
          <option>Team — €899 (20 ritten)</option>
          <option>Corporate — €1.599 (40 ritten)</option>
          <option>Maatwerk — ik wil een offerte op maat</option>
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field id="z-route" label="Gebruikelijk traject">
          <input id="z-route" placeholder="Bijv. Amsterdam/Almere → Schiphol" className={inputCls} />
        </Field>
      </div>
    </FormShell>
  );
}

export function HotelForm() {
  return (
    <FormShell
      title="Partnerschap bespreken"
      intro="We plannen een kennismakingsgesprek en stellen een contract op maat op."
      success="Aanvraag ontvangen — wij plannen een kennismakingsgesprek!"
      cta="Kennismaking inplannen"
    >
      <Field id="h-naam" label="Naam">
        <input id="h-naam" placeholder="Uw naam" autoComplete="name" required className={inputCls} />
      </Field>
      <Field id="h-hotel" label="Hotel naam">
        <input id="h-hotel" placeholder="Hotel naam" className={inputCls} />
      </Field>
      <div className="sm:col-span-2">
        <Field id="h-email" label="E-mail">
          <input id="h-email" type="email" placeholder="info@uwhotel.nl" autoComplete="email" className={inputCls} />
        </Field>
      </div>
      <Field id="h-tel" label="Telefoon">
        <input id="h-tel" type="tel" placeholder="+31 6 ..." autoComplete="tel" className={inputCls} />
      </Field>
      <Field id="h-kamers" label="Aantal kamers">
        <select id="h-kamers" className={inputCls}>
          <option>&lt;20 kamers</option>
          <option>20–50</option>
          <option>51–100</option>
          <option>100+</option>
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field id="h-loc" label="Locatie hotel">
          <input id="h-loc" placeholder="Stad en adres" className={inputCls} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field id="h-vraag" label="Hoe kunnen wij helpen?">
          <textarea
            id="h-vraag"
            placeholder="Bijv: wij zoeken een vaste chauffeur voor Schipholtransfers van onze gasten, 10–15 ritten per week..."
            className={`${inputCls} min-h-24 resize-y py-3`}
          />
        </Field>
      </div>
    </FormShell>
  );
}
