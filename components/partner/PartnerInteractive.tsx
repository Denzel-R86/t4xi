"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Icon from "@/components/ui/Icon";
import { BEDRIJF } from "@/lib/legal";
import { Link } from "@/i18n/navigation";

const inputCls =
  "min-h-[52px] w-full rounded-field border border-[rgba(31,39,48,0.14)] bg-field px-4 text-[15px] font-medium text-ink placeholder:font-normal placeholder:text-stone focus:border-accent focus:bg-white focus:shadow-[0_0_0_4px_rgba(40,49,59,0.10)] focus:outline-none";
const labelCls = "mb-1.5 block text-xs font-bold text-secondary";

const WHATSAPP = "https://wa.me/31634744522";

/**
 * Aanvragen gaan via /api/leads rechtstreeks naar operations. E-mail en
 * WhatsApp blijven expliciete fallbacks als de mailprovider niet beschikbaar is.
 */
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

/** Commissie + maandbedrag per pakket — taalneutraal (label komt uit i18n). */
const PAKKETTEN = [
  { value: 0.2, fixed: 0 },
  { value: 0.12, fixed: 99 },
  { value: 0.08, fixed: 199 },
  { value: 0.05, fixed: 299 },
];

/** Verdiencalculator uit partner.html (#calculator). */
export function EarningsCalculator() {
  const t = useTranslations("partner");
  const locale = useLocale();
  const euro = (n: number) => "€" + Math.round(n).toLocaleString(locale === "nl" ? "nl-NL" : "en-GB");

  const [ritten, setRitten] = useState(75);
  const [prijs, setPrijs] = useState(79);
  const [pakket, setPakket] = useState(1);

  const pakLabels = t.raw("pakLabels") as string[];
  const resLabels = t.raw("calcRes") as string[];

  const p = PAKKETTEN[pakket];
  const omzet = ritten * prijs;
  const netto = omzet * (1 - p.value) - p.fixed;
  const uber = omzet * 0.65;
  const verschil = netto - uber;
  const verschilLabel = `${verschil >= 0 ? "+" : "−"}${euro(Math.abs(verschil))}`;

  return (
    <div className="rounded-card border border-line bg-card p-6 shadow-card md:p-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="c-ritten" className={labelCls}>{t("calcLabelRitten")}</label>
          <input
            id="c-ritten" type="number" min={1} max={300} value={ritten}
            onChange={(e) => setRitten(Number(e.target.value) || 0)}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="c-prijs" className={labelCls}>{t("calcLabelPrijs")}</label>
          <input
            id="c-prijs" type="number" min={10} max={500} value={prijs}
            onChange={(e) => setPrijs(Number(e.target.value) || 0)}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="c-pakket" className={labelCls}>{t("calcLabelPakket")}</label>
          <select
            id="c-pakket" value={pakket}
            onChange={(e) => setPakket(Number(e.target.value))}
            className={inputCls}
          >
            {pakLabels.map((label, i) => (
              <option key={label} value={i}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-live="polite">
        {[
          { val: euro(omzet), label: resLabels[0] },
          { val: euro(netto), label: resLabels[1], highlight: true },
          { val: euro(uber), label: resLabels[2] },
          {
            val: verschilLabel,
            label: resLabels[3],
            positive: verschil >= 0,
            negative: verschil < 0,
          },
        ].map((r) => (
          <div
            key={r.label}
            className={`rounded-xl border p-4 text-center ${r.highlight ? "border-accent bg-accent/5" : "border-line bg-fog"}`}
          >
            <div
              className={`font-display text-2xl font-bold ${
                r.positive ? "text-green-600" : r.negative ? "text-red-600" : "text-ink"
              }`}
            >
              {r.val}
            </div>
            <div className="mt-1 text-[11px] text-secondary">{r.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-secondary">
        {t("calcFoot")}
      </p>
    </div>
  );
}

/** Aanmeldformulier uit partner.html (#aanmelden). */
export function PartnerSignupForm() {
  const t = useTranslations("partner");
  const locale = useLocale();
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");

  const vergOpts = t.raw("fVergOpts") as string[];
  const regioOpts = t.raw("fRegioOpts") as string[];
  const rittenOpts = t.raw("fRittenOpts") as string[];
  const pakketOpts = t.raw("fPakketOpts") as string[];

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
              kind: "partner",
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
        <label htmlFor="p-website">{t("honeypot")}</label>
        <input id="p-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-accent via-stone to-stone-subtle" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="p-naam" className={labelCls}>{t("fNaam")}</label>
          <input id="p-naam" name="name" placeholder={t("fNaamPl")} autoComplete="name" required className={inputCls} />
        </div>
        <div>
          <label htmlFor="p-tel" className={labelCls}>{t("fTel")}</label>
          <input id="p-tel" name="phone" type="tel" placeholder="+31 6 ..." autoComplete="tel" required className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="p-email" className={labelCls}>{t("fEmail")} <span aria-hidden="true" className="text-accent">*</span></label>
          <input id="p-email" name="email" type="email" placeholder={t("fEmailPl")} autoComplete="email" required className={inputCls} />
        </div>
        <div>
          <label htmlFor="p-auto" className={labelCls}>{t("fAuto")}</label>
          <input id="p-auto" placeholder={t("fAutoPl")} className={inputCls} />
        </div>
        <div>
          <label htmlFor="p-verg" className={labelCls}>{t("fVerg")}</label>
          <select id="p-verg" defaultValue="" className={inputCls}>
            <option value="" disabled>{vergOpts[0]}</option>
            {vergOpts.slice(1).map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="p-regio" className={labelCls}>{t("fRegio")}</label>
          <select id="p-regio" defaultValue="" className={inputCls}>
            <option value="" disabled>{regioOpts[0]}</option>
            {regioOpts.slice(1).map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="p-ritten" className={labelCls}>{t("fRittenWk")}</label>
          <select id="p-ritten" className={inputCls}>
            {rittenOpts.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="p-pakket" className={labelCls}>{t("fPakket")}</label>
          <select id="p-pakket" required defaultValue="" className={inputCls}>
            <option value="" disabled>{pakketOpts[0]}</option>
            {pakketOpts.slice(1).map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
      </div>
      <button
        type="submit"
        disabled={state === "loading"}
        aria-busy={state === "loading"}
        className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-md bg-accent px-8 font-display text-base font-medium text-white shadow-cta transition-all hover:-translate-y-0.5 hover:bg-accent-hover"
      >
        <Icon name="send" size={17} />
        {state === "loading" ? t("sending") : t("fSubmit")}
      </button>
      {state === "success" && (
        <p className="mt-3 rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-3 text-center text-sm text-green-700" role="status" aria-live="polite">
          {t("sendSuccess")}
        </p>
      )}
      {state === "error" && (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-700" role="alert">
          {t("sendError")} {" "}
          <button type="button" onClick={(e) => composeMailto(e.currentTarget.form!, t("mailSubject"))} className="font-semibold underline underline-offset-2">
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
              composeWhatsApp(form, t("mailSubject"));
            }
          }}
          className="font-medium text-accent hover:underline"
        >
          {t("orWhatsapp")}
        </a>
        .
      </p>
      <p className="mt-2 text-center text-xs text-secondary">
        {t("fBel")}{" "}
        <a href="tel:+31634744522" className="text-accent hover:underline">+31 6 34 74 45 22</a>
      </p>
      <p className="mt-2 text-center text-[11px] leading-relaxed text-secondary">
        {t("privacyNote")}{" "}
        <Link href="/privacy" className="underline underline-offset-2">{t("privacyLink")}</Link>.
      </p>
    </form>
  );
}
