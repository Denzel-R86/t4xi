"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Icon from "@/components/ui/Icon";
import { Link } from "@/i18n/navigation";
import { BEDRIJF } from "@/lib/legal";
import {
  BUSINESS_CONTACT_TOPICS,
  PRIVATE_CONTACT_TOPICS,
  type ContactAudience,
  type ContactTopic,
} from "@/lib/contact/prefill";

type SubmitState = "idle" | "loading" | "success" | "error";

const WHATSAPP = "https://wa.me/31634744522";

const inputClassName =
  "min-h-[52px] w-full rounded-field border border-[rgba(31,39,48,0.16)] bg-field px-4 text-[15px] font-medium text-ink placeholder:font-normal placeholder:text-stone focus:border-accent focus:bg-white focus:shadow-[0_0_0_4px_rgba(40,49,59,0.10)] focus:outline-none";
const labelClassName = "mb-1.5 block text-xs font-bold text-secondary";

function fallbackLines(form: HTMLFormElement): string[] {
  const fields = Array.from(
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "[data-contact-field]"
    )
  );

  return fields
    .filter((field) => {
      if ((field instanceof HTMLInputElement) && ["radio", "checkbox"].includes(field.type)) {
        return field.checked;
      }
      return field.value.trim() !== "";
    })
    .map((field) => {
      const label = field.labels?.[0]?.textContent?.trim().replace(/\s*\*$/, "") ?? field.name;
      const value = field instanceof HTMLSelectElement
        ? field.selectedOptions[0]?.textContent?.trim() ?? field.value
        : field.value.trim();
      return `${label}: ${value}`;
    });
}

function mailtoHref(form: HTMLFormElement, subject: string): string {
  const body = fallbackLines(form).join("\r\n");
  return `mailto:${BEDRIJF.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function whatsappHref(form: HTMLFormElement, subject: string): string {
  const text = [subject, ...fallbackLines(form)].join("\n");
  return `${WHATSAPP}?text=${encodeURIComponent(text)}`;
}

export default function ContactLeadForm({
  initialAudience = "private",
  initialTopic = "",
}: {
  initialAudience?: ContactAudience;
  initialTopic?: ContactTopic;
}) {
  const t = useTranslations("contact.form");
  const locale = useLocale();
  const [audience, setAudience] = useState<ContactAudience>(initialAudience);
  const [topic, setTopic] = useState<ContactTopic>(initialTopic);
  const [state, setState] = useState<SubmitState>("idle");

  const topicKeys = audience === "business"
    ? BUSINESS_CONTACT_TOPICS
    : PRIVATE_CONTACT_TOPICS;
  const fallbackSubject = audience === "business" ? t("businessMailSubject") : t("privateMailSubject");

  return (
    <section id="contact-form" className="scroll-mt-20 border-b border-line bg-fog py-16 md:py-24" aria-labelledby="contact-form-title">
      <div className="mx-auto grid max-w-site gap-10 px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <div>
          <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
            <span aria-hidden="true" className="h-px w-4 bg-accent" />
            {t("kicker")}
          </p>
          <h2 id="contact-form-title" className="mt-4 font-display text-display-md font-bold text-ink">
            {t("title")}
          </h2>
          <p className="mt-5 max-w-xl text-[15px] leading-7 text-secondary">{t("intro")}</p>

          <div className="mt-8 rounded-card border border-line bg-card p-5 shadow-card">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Icon name="clock" size={19} />
              </span>
              <div>
                <h3 className="font-display text-base font-semibold text-ink">{t("responseTitle")}</h3>
                <p className="mt-1 text-sm leading-6 text-secondary">{t("responseText")}</p>
              </div>
            </div>
          </div>
        </div>

        <form
          className="relative overflow-hidden rounded-[28px] border border-line bg-card p-6 shadow-hero-card md:p-8"
          aria-labelledby="contact-form-title"
          onChange={() => {
            if (state === "error" || state === "success") setState("idle");
          }}
          onSubmit={async (event) => {
            event.preventDefault();
            if (state === "loading") return;

            const form = event.currentTarget;
            const values = new FormData(form);
            const selectedTopic = form.elements.namedItem("topic") as HTMLSelectElement | null;
            const fields = [
              { label: t("nameLabel"), value: String(values.get("name") ?? "") },
              { label: t("emailLabel"), value: String(values.get("email") ?? "") },
              { label: t("phoneLabel"), value: String(values.get("phone") ?? "") },
              {
                label: t("audienceLegend"),
                value: audience === "business" ? t("businessOption") : t("privateOption"),
              },
              {
                label: t("topicLabel"),
                value: selectedTopic?.selectedOptions[0]?.textContent?.trim() ?? topic,
              },
              ...(audience === "business"
                ? [{ label: t("companyLabel"), value: String(values.get("company") ?? "") }]
                : []),
              { label: t("messageLabel"), value: String(values.get("message") ?? "") },
            ].filter((field) => field.value.trim() !== "");

            setState("loading");
            try {
              const response = await fetch("/api/leads", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  kind: audience === "business" ? "contact-business" : "contact-private",
                  audience,
                  locale,
                  name: String(values.get("name") ?? ""),
                  email: String(values.get("email") ?? ""),
                  phone: String(values.get("phone") ?? ""),
                  company: String(values.get("company") ?? ""),
                  topic,
                  message: String(values.get("message") ?? ""),
                  website: String(values.get("website") ?? ""),
                  fields,
                }),
              });
              if (!response.ok) throw new Error("delivery_failed");
              form.reset();
              setAudience("private");
              setTopic("");
              setState("success");
            } catch {
              setState("error");
            }
          }}
        >
          <div aria-hidden="true" className="hidden">
            <label htmlFor="contact-website">{t("honeypot")}</label>
            <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
          </div>
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-accent via-stone to-stone-subtle" />

          <p className="text-xs text-secondary">{t("requiredNote")}</p>

          <fieldset className="mt-5">
            <legend className={labelClassName}>{t("audienceLegend")} *</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["private", "business"] as const).map((option) => {
                const id = `contact-${option}`;
                const checked = audience === option;
                return (
                  <label
                    key={option}
                    htmlFor={id}
                    className={`flex min-h-[52px] cursor-pointer items-center gap-3 rounded-field border px-4 text-sm font-semibold transition-colors ${
                      checked ? "border-accent bg-accent/5 text-ink" : "border-line bg-field text-secondary hover:border-stone"
                    }`}
                  >
                    <input
                      id={id}
                      name="audience"
                      type="radio"
                      value={option}
                      checked={checked}
                      required
                      onChange={() => {
                        setAudience(option);
                        setTopic("");
                      }}
                      data-contact-field
                      className="h-4 w-4 accent-accent"
                    />
                    {option === "business" ? t("businessOption") : t("privateOption")}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="contact-name" className={labelClassName}>{t("nameLabel")} *</label>
              <input
                id="contact-name"
                name="name"
                autoComplete="name"
                maxLength={120}
                required
                data-contact-field
                className={inputClassName}
              />
            </div>
            <div>
              <label htmlFor="contact-phone" className={labelClassName}>{t("phoneLabel")}</label>
              <input
                id="contact-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                maxLength={60}
                placeholder="+31 6 ..."
                data-contact-field
                className={inputClassName}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="contact-email" className={labelClassName}>{t("emailLabel")} *</label>
              <input
                id="contact-email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
                data-contact-field
                className={inputClassName}
              />
            </div>
            {audience === "business" && (
              <div className="sm:col-span-2">
                <label htmlFor="contact-company" className={labelClassName}>{t("companyLabel")} *</label>
                <input
                  id="contact-company"
                  name="company"
                  autoComplete="organization"
                  maxLength={160}
                  required
                  data-contact-field
                  className={inputClassName}
                />
              </div>
            )}
            <div className="sm:col-span-2">
              <label htmlFor="contact-topic" className={labelClassName}>{t("topicLabel")} *</label>
              <select
                id="contact-topic"
                name="topic"
                value={topic}
                onChange={(event) => setTopic(event.target.value as ContactTopic)}
                required
                data-contact-field
                className={inputClassName}
              >
                <option value="" disabled>{t("topicPlaceholder")}</option>
                {topicKeys.map((key) => <option key={key} value={key}>{t(`topics.${key}`)}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="contact-message" className={labelClassName}>{t("messageLabel")} *</label>
              <textarea
                id="contact-message"
                name="message"
                minLength={10}
                maxLength={1_200}
                required
                data-contact-field
                placeholder={t("messagePlaceholder")}
                className={`${inputClassName} min-h-32 resize-y py-3`}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={state === "loading"}
            aria-busy={state === "loading"}
            className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-md bg-accent px-8 font-display text-base font-medium text-white shadow-cta transition-all hover:-translate-y-0.5 hover:bg-accent-hover disabled:cursor-wait disabled:opacity-70"
          >
            <Icon name="send" size={17} />
            {state === "loading" ? t("sending") : t("submit")}
          </button>

          <div aria-live="polite" aria-atomic="true">
            {state === "success" && (
              <p className="mt-4 rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-3 text-center text-sm text-green-700" role="status">
                {t("success")}
              </p>
            )}
            {state === "error" && (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700" role="alert">
                <p>{t("error")}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 font-semibold">
                  <a
                    href={`mailto:${BEDRIJF.email}`}
                    onClick={(event) => {
                      event.currentTarget.href = mailtoHref(formFrom(event.currentTarget), fallbackSubject);
                    }}
                    className="underline underline-offset-2"
                  >
                    {t("emailFallback")}
                  </a>
                  <a
                    href={WHATSAPP}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => {
                      event.currentTarget.href = whatsappHref(formFrom(event.currentTarget), fallbackSubject);
                    }}
                    className="underline underline-offset-2"
                  >
                    {t("whatsappFallback")}
                  </a>
                </div>
              </div>
            )}
          </div>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-secondary">
            {t("privacyNote")} {" "}
            <Link href="/privacy" className="underline underline-offset-2">{t("privacyLink")}</Link>.
          </p>
        </form>
      </div>
    </section>
  );
}

function formFrom(element: HTMLElement): HTMLFormElement {
  const form = element.closest("form");
  if (!(form instanceof HTMLFormElement)) throw new Error("contact_form_missing");
  return form;
}
