"use client";

import { type ReactNode, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Icon from "@/components/ui/Icon";
import { BEDRIJF } from "@/lib/legal";
import { Link } from "@/i18n/navigation";

const inputCls =
  "min-h-[52px] w-full rounded-field border border-[rgba(31,39,48,0.14)] bg-field px-4 text-[15px] font-medium text-ink placeholder:font-normal placeholder:text-stone focus:border-accent focus:bg-white focus:shadow-[0_0_0_4px_rgba(40,49,59,0.10)] focus:outline-none";
const labelCls = "mb-1.5 block text-xs font-bold text-secondary";

const WHATSAPP = "https://wa.me/31634744522";

/**
 * Aanvragen gaan via /api/leads rechtstreeks naar operations. Labels komen uit
 * de gekoppelde <label>, zodat de ops-mail per locale leesbare veldnamen toont.
 * Bij een providerstoring blijft een vooraf ingevulde e-mail en WhatsApp als
 * expliciete fallback beschikbaar; er verschijnt nooit een valse bevestiging.
 */
/** Verzamelt de ingevulde velden als "Label: waarde"-regels (lege overslaan). */
function collectFields(form: HTMLFormElement): string[] {
  const els = Array.from(
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")
  );
  return els
    .filter((el) => el.type !== "submit" && el.type !== "hidden" && el.value.trim() !== "")
    .map((el) => {
      const label = el.labels?.[0]?.textContent?.trim().replace(/\s*\*$/, "") ?? el.id;
      return `${label}: ${el.value.trim()}`;
    });
}

function collectFieldObjects(form: HTMLFormElement): { label: string; value: string }[] {
  const els = Array.from(
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")
  );
  return els
    .filter((el) => el.type !== "submit" && el.type !== "hidden" && el.value.trim() !== "")
    .map((el) => ({
      label: el.labels?.[0]?.textContent?.trim().replace(/\s*\*$/, "") ?? el.name ?? el.id,
      value: el.value.trim(),
    }));
}

function composeMailto(form: HTMLFormElement, subject: string): void {
  const body = collectFields(form).join("\r\n");
  window.location.href = `mailto:${BEDRIJF.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** WhatsApp-route, óók gevuld met de ingevoerde gegevens (met plain-link fallback). */
function composeWhatsApp(form: HTMLFormElement, subject: string): void {
  const text = [subject, ...collectFields(form)].join("\n");
  window.location.href = `${WHATSAPP}?text=${encodeURIComponent(text)}`;
}

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
  cta,
  mailSubject,
  leadKind,
  note,
  children,
}: {
  title: string;
  intro: string;
  cta: string;
  mailSubject: string;
  leadKind: "membership" | "ride-pass" | "hotel";
  note?: string;
  children: ReactNode;
}) {
  const t = useTranslations("producten");
  const locale = useLocale();
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  return (
    <form
      className="relative overflow-hidden rounded-[28px] border border-line bg-card p-6 shadow-hero-card md:p-7"
      onSubmit={async (e) => {
        e.preventDefault();
        if (state === "loading") return;
        const form = e.currentTarget;
        const values = new FormData(form);
        setState("loading");
        try {
          const response = await fetch("/api/leads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: leadKind,
              locale,
              name: String(values.get("name") ?? ""),
              email: String(values.get("email") ?? ""),
              phone: String(values.get("phone") ?? ""),
              website: String(values.get("website") ?? ""),
              fields: collectFieldObjects(form),
            }),
          });
          if (!response.ok) throw new Error("delivery_failed");
          setState("success");
          form.reset();
        } catch {
          setState("error");
        }
      }}
    >
      <div aria-hidden="true" className="hidden">
        <label htmlFor={`${leadKind}-website`}>{t("honeypot")}</label>
        <input id={`${leadKind}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-accent via-stone to-stone-subtle" />
      <h3 className="font-display text-xl font-bold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm text-secondary">{intro}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">{children}</div>
      <button
        type="submit"
        disabled={state === "loading"}
        aria-busy={state === "loading"}
        className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-md bg-accent px-8 font-display text-base font-medium text-white shadow-cta transition-all hover:-translate-y-0.5 hover:bg-accent-hover"
      >
        <Icon name="send" size={17} />
        {state === "loading" ? t("sending") : cta}
      </button>
      {state === "success" && (
        <p className="mt-3 rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-3 text-center text-sm text-green-700" role="status" aria-live="polite">
          {t("sendSuccess")}
        </p>
      )}
      {state === "error" && (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-700" role="alert">
          {t("sendError")} {" "}
          <button type="button" onClick={(e) => composeMailto(e.currentTarget.form!, mailSubject)} className="font-semibold underline underline-offset-2">
            {t("emailFallback")}
          </button>
        </p>
      )}
      <p className="mt-3 text-center text-xs text-secondary">
        {t("sendNote")}{" "}
        <a
          href={WHATSAPP}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            const form = e.currentTarget.closest("form");
            if (form) {
              e.preventDefault();
              composeWhatsApp(form, mailSubject);
            }
          }}
          className="font-medium text-accent hover:underline"
        >
          {t("orWhatsapp")}
        </a>
        .
      </p>
      {note && <p className="mt-2 text-center text-xs text-secondary">{note}</p>}
      <p className="mt-2 text-center text-[11px] leading-relaxed text-secondary">
        {t("privacyNote")} {" "}
        <Link href="/privacy" className="underline underline-offset-2">{t("privacyLink")}</Link>.
      </p>
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
      mailSubject={t("mailSubject")}
      leadKind="membership"
      cta={t("cta")}
      note={t("note")}
    >
      <Field id="m-naam" label={t("naam")}>
        <input id="m-naam" name="name" placeholder={t("naamPl")} autoComplete="name" required className={inputCls} />
      </Field>
      <Field id="m-tel" label={t("tel")}>
        <input id="m-tel" name="phone" type="tel" placeholder="+31 6 ..." autoComplete="tel" className={inputCls} />
      </Field>
      <div className="sm:col-span-2">
        <Field id="m-email" label={`${t("email")} *`}>
          <input id="m-email" name="email" type="email" placeholder={t("emailPl")} autoComplete="email" required className={inputCls} />
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
      mailSubject={t("mailSubject")}
      leadKind="ride-pass"
      cta={t("cta")}
    >
      <Field id="z-naam" label={t("contact")}>
        <input id="z-naam" name="name" placeholder={t("contactPl")} autoComplete="name" required className={inputCls} />
      </Field>
      <Field id="z-func" label={t("functie")}>
        <input id="z-func" placeholder={t("functiePl")} className={inputCls} />
      </Field>
      <div className="sm:col-span-2">
        <Field id="z-bedrijf" label={t("bedrijf")}>
        <input id="z-bedrijf" placeholder={t("bedrijfPl")} required className={inputCls} />
        </Field>
      </div>
      <Field id="z-email" label={`${t("email")} *`}>
        <input id="z-email" name="email" type="email" placeholder={t("emailPl")} autoComplete="email" required className={inputCls} />
      </Field>
      <Field id="z-tel" label={t("tel")}>
        <input id="z-tel" name="phone" type="tel" placeholder="+31 6 ..." autoComplete="tel" className={inputCls} />
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
      mailSubject={t("mailSubject")}
      leadKind="hotel"
      cta={t("cta")}
    >
      <Field id="h-naam" label={t("naam")}>
        <input id="h-naam" name="name" placeholder={t("naamPl")} autoComplete="name" required className={inputCls} />
      </Field>
      <Field id="h-hotel" label={t("hotel")}>
        <input id="h-hotel" placeholder={t("hotelPl")} required className={inputCls} />
      </Field>
      <div className="sm:col-span-2">
        <Field id="h-email" label={`${t("email")} *`}>
          <input id="h-email" name="email" type="email" placeholder={t("emailPl")} autoComplete="email" required className={inputCls} />
        </Field>
      </div>
      <Field id="h-tel" label={t("tel")}>
        <input id="h-tel" name="phone" type="tel" placeholder="+31 6 ..." autoComplete="tel" className={inputCls} />
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
