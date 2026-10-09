import { useTranslations } from "next-intl";
import type { Quote } from "@/components/shared/useRouteQuote";

/**
 * Prijsvoorbeeld — bron: autoritatieve Pricing Engine (/api/pricing/quote).
 * Staat onder elke stap, zodat de prijs vóór het boeken zichtbaar blijft.
 */
export default function PricePreview({
  quote,
  ready,
  quoteReady,
}: {
  quote: Quote;
  ready: boolean;
  quoteReady: boolean;
}) {
  const t = useTranslations("booking");

  const priceNote =
    quote.status === "idle"
      ? ready && !quoteReady
        ? t("prijsKiesDatumTijdBagage")
        : t("prijsIdle")
      : quote.status === "loading"
        ? t("prijsLaden")
        : quote.status === "ready"
          ? t(quote.returnApplied ? "prijsRetour" : "prijsVast")
          : quote.status === "onrequest"
            ? t("prijsOpAanvraag")
            : quote.status === "error" && quote.reason === "rate_limited"
              ? t("prijsRateLimited")
              : t("prijsFout");
  const priceAmount =
    quote.status === "ready"
      ? quote.amount
      : quote.status === "loading"
        ? "…"
        : quote.status === "onrequest"
          ? t("opAanvraag")
          : "—";
  const priceBig = quote.status === "ready" || quote.status === "idle" || quote.status === "error";

  return (
    <>
      <div
        className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-[rgba(31,39,48,0.12)] bg-[linear-gradient(135deg,#FFFFFF,#F3F0EA)] p-4"
        role="region"
        aria-live="polite"
        aria-busy={quote.status === "loading"}
        aria-label={t("geschattePrijs")}
      >
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-stone">{t("geschattePrijs")}</div>
          <div className="mt-0.5 text-xs text-secondary">{priceNote}</div>
        </div>
        <div className={`shrink-0 font-display font-bold text-accent ${priceBig ? "text-[28px]" : "text-base"}`}>
          {priceAmount}
        </div>
      </div>

      {ready && (
        <p className="mt-3 rounded-xl border border-line bg-fog px-4 py-3 text-xs leading-relaxed text-secondary" aria-live="polite">
          <strong className="text-ink">{t("inclusiefKop")}</strong> {t("inclusiefTekst")}
        </p>
      )}
    </>
  );
}
