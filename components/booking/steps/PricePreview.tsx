import { useTranslations } from "next-intl";
import type { Quote } from "@/components/shared/useRouteQuote";
import { formatEuro } from "@/lib/format/currency";

/**
 * Prijsvoorbeeld — bron: autoritatieve Pricing Engine (/api/pricing/quote).
 * Staat onder elke stap, zodat de prijs vóór het boeken zichtbaar blijft.
 *
 * `provisionalPrice` (PR 2.3, besluit #70): de prijs die de server in de hero gaf,
 * uitsluitend als VOORLOPIG gemarkeerd (eigen tekst, geen vaste-prijslabel, geen
 * accentstijl, `aria-busy`) tot de server antwoordt; de beslissing zit in
 * `lib/booking-handoff.ts` (`provisionalPrice`). `priceUpdated`: de server gaf een
 * ander bedrag → korte melding. `handoff`: gedeelde view-transition-naam.
 */
export default function PricePreview({
  quote,
  ready,
  quoteReady,
  provisionalPrice = null,
  priceUpdated = false,
  handoff = false,
}: {
  quote: Quote;
  ready: boolean;
  quoteReady: boolean;
  provisionalPrice?: number | null;
  priceUpdated?: boolean;
  handoff?: boolean;
}) {
  const t = useTranslations("booking");

  const provisional = provisionalPrice !== null;
  const priceNote = provisional
    ? t("prijsVerifieren")
    : quote.status === "idle"
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
  const priceAmount = provisional
    ? formatEuro(provisionalPrice)
    : quote.status === "ready"
      ? quote.amount
      : quote.status === "loading"
        ? "…"
        : quote.status === "onrequest"
          ? t("opAanvraag")
          : "—";
  const priceBig = provisional || quote.status === "ready" || quote.status === "idle" || quote.status === "error";

  return (
    <>
      <div
        className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-[rgba(31,39,48,0.12)] bg-[linear-gradient(135deg,#FFFFFF,#F3F0EA)] p-4"
        role="region"
        aria-live="polite"
        aria-busy={provisional || quote.status === "loading"}
        data-price-state={provisional ? "provisional" : quote.status}
        aria-label={t("geschattePrijs")}
      >
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-stone">{t("geschattePrijs")}</div>
          <div className="mt-0.5 text-xs text-secondary">{priceNote}</div>
        </div>
        <div
          className={`shrink-0 font-display ${provisional ? "font-semibold text-secondary" : "font-bold text-accent"} ${priceBig ? "text-[28px]" : "text-base"}${handoff ? " hx-handoff-price" : ""}`}
        >
          {provisional && <span className="sr-only">{t("prijsVoorlopigSr")} </span>}
          {priceAmount}
        </div>
      </div>

      {priceUpdated && (
        <p className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-fog px-4 py-3 text-xs leading-relaxed text-ink" role="status">
          {t("prijsBijgewerkt")}
        </p>
      )}

      {ready && (
        <p className="mt-3 rounded-xl border border-line bg-fog px-4 py-3 text-xs leading-relaxed text-secondary" aria-live="polite">
          <strong className="text-ink">{t("inclusiefKop")}</strong> {t("inclusiefTekst")}
        </p>
      )}
    </>
  );
}
