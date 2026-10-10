"use client";

import { useTranslations } from "next-intl";
import Icon from "@/components/ui/Icon";

/* ── Geen automatisch tarief: bruikbare aanvraagflow ── */
export default function OnRequestCard({
  summary, whatsappHref, mailtoHref, needsFlight, hasStops,
}: {
  summary: string;
  whatsappHref: string;
  mailtoHref: string;
  needsFlight: boolean;
  hasStops: boolean;
}) {
  const t = useTranslations("routezoeker");
  return (
    <div className="hz-reveal hz-in rounded-[28px] border border-line-strong bg-card p-6 shadow-card md:p-8">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">{t("kaartKop")}</p>
      <p className="mt-2 font-display text-lg font-semibold leading-snug text-ink">{summary}</p>
      <p className="mt-4 max-w-xl text-secondary">
        {t("opAanvraagUitleg")}
        {hasStops ? ` ${t("opAanvraagStops")}` : ""}
        {needsFlight ? ` ${t("opAanvraagVlucht")}` : ""}
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-md bg-accent px-8 font-display text-base font-medium text-white shadow-cta transition-all hover:-translate-y-0.5 hover:bg-accent-hover"
        >
          <Icon name="whatsapp" size={18} /> {t("vraagWhatsapp")}
        </a>
        <a
          href={mailtoHref}
          className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-md border border-line-strong bg-white px-8 font-display text-base font-medium text-ink transition-colors hover:bg-fog"
        >
          <Icon name="message-check" size={18} /> {t("vraagEmail")}
        </a>
      </div>
      <p className="mt-4 text-center text-[13px] text-secondary">
        {t("ofBel")}{" "}
        <a href="tel:+31634744522" className="inline-flex min-h-6 items-center text-accent hover:underline">+31 6 34 74 45 22</a>
      </p>
    </div>
  );
}
