"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("producten.formMembership");
  const rittenOpts = t.raw("rittenOpts") as string[];
  const pakketOpts = t.raw("pakketOpts") as string[];
  return (
    <FormShell
      title={t("title")}
      intro={t("intro")}
      success={t("success")}
      cta={t("cta")}
      note={t("note")}
    >
      <Field id="m-naam" label={t("naam")}>
        <input id="m-naam" placeholder={t("naamPl")} autoComplete="name" required className={inputCls} />
      </Field>
      <Field id="m-tel" label={t("tel")}>
        <input id="m-tel" type="tel" placeholder="+31 6 ..." autoComplete="tel" className={inputCls} />
      </Field>
      <div className="sm:col-span-2">
        <Field id="m-email" label={t("email")}>
          <input id="m-email" type="email" placeholder={t("emailPl")} autoComplete="email" className={inputCls} />
        </Field>
      </div>
      <Field id="m-loc" label={t("loc")}>
        <input id="m-loc" placeholder={t("locPl")} className={inputCls} />
      </Field>
      <Field id="m-ritten" label={t("ritten")}>
        <select id="m-ritten" className={inputCls}>
          {rittenOpts.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field id="m-pakket" label={t("pakket")}>
          <select id="m-pakket" defaultValue={pakketOpts[1]} className={inputCls}>
            {pakketOpts.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </Field>
      </div>
    </FormShell>
  );
}

export function StrippenkaartForm() {
  const t = useTranslations("producten.formZakelijk");
  const sizeOpts = t.raw("sizeOpts") as string[];
  const pakketOpts = t.raw("pakketOpts") as string[];
  return (
    <FormShell
      title={t("title")}
      intro={t("intro")}
      success={t("success")}
      cta={t("cta")}
    >
      <Field id="z-naam" label={t("contact")}>
        <input id="z-naam" placeholder={t("contactPl")} autoComplete="name" required className={inputCls} />
      </Field>
      <Field id="z-func" label={t("functie")}>
        <input id="z-func" placeholder={t("functiePl")} className={inputCls} />
      </Field>
      <div className="sm:col-span-2">
        <Field id="z-bedrijf" label={t("bedrijf")}>
          <input id="z-bedrijf" placeholder={t("bedrijfPl")} className={inputCls} />
        </Field>
      </div>
      <Field id="z-email" label={t("email")}>
        <input id="z-email" type="email" placeholder={t("emailPl")} autoComplete="email" className={inputCls} />
      </Field>
      <Field id="z-tel" label={t("tel")}>
        <input id="z-tel" type="tel" placeholder="+31 6 ..." autoComplete="tel" className={inputCls} />
      </Field>
      <Field id="z-size" label={t("size")}>
        <select id="z-size" className={inputCls}>
          {sizeOpts.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </Field>
      <Field id="z-pakket" label={t("pakket")}>
        <select id="z-pakket" defaultValue={pakketOpts[1]} className={inputCls}>
          {pakketOpts.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field id="z-route" label={t("route")}>
          <input id="z-route" placeholder={t("routePl")} className={inputCls} />
        </Field>
      </div>
    </FormShell>
  );
}

export function HotelForm() {
  const t = useTranslations("producten.formHotel");
  const kamersOpts = t.raw("kamersOpts") as string[];
  return (
    <FormShell
      title={t("title")}
      intro={t("intro")}
      success={t("success")}
      cta={t("cta")}
    >
      <Field id="h-naam" label={t("naam")}>
        <input id="h-naam" placeholder={t("naamPl")} autoComplete="name" required className={inputCls} />
      </Field>
      <Field id="h-hotel" label={t("hotel")}>
        <input id="h-hotel" placeholder={t("hotelPl")} className={inputCls} />
      </Field>
      <div className="sm:col-span-2">
        <Field id="h-email" label={t("email")}>
          <input id="h-email" type="email" placeholder={t("emailPl")} autoComplete="email" className={inputCls} />
        </Field>
      </div>
      <Field id="h-tel" label={t("tel")}>
        <input id="h-tel" type="tel" placeholder="+31 6 ..." autoComplete="tel" className={inputCls} />
      </Field>
      <Field id="h-kamers" label={t("kamers")}>
        <select id="h-kamers" className={inputCls}>
          {kamersOpts.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field id="h-loc" label={t("loc")}>
          <input id="h-loc" placeholder={t("locPl")} className={inputCls} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field id="h-vraag" label={t("vraag")}>
          <textarea
            id="h-vraag"
            placeholder={t("vraagPl")}
            className={`${inputCls} min-h-24 resize-y py-3`}
          />
        </Field>
      </div>
    </FormShell>
  );
}
