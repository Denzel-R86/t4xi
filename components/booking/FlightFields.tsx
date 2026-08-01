"use client";

import Icon from "@/components/ui/Icon";
import { useTranslations } from "next-intl";
import type { FlightFieldRules } from "@/lib/booking-meta";

/**
 * Vluchtnummer- en retourvelden van het boekingsformulier.
 *
 * Afgesplitst van BookingSection om dat bestand onder de 500-regelgrens te houden;
 * bevat geen eigen logica. Welke velden verplicht/optioneel/verborgen zijn bepaalt
 * `flightFieldRules` (lib/booking-meta.ts) op basis van de server-side afgeleide
 * luchthavencontext — hier wordt niets opnieuw afgeleid.
 *
 * Vluchtnummers en retourdatum/-tijd staan als state in de ouder, zodat een
 * tijdelijke formulierwijziging (van tab wisselen, een veld dat even verdwijnt)
 * een eerder ingevoerde waarde niet wist.
 */
export default function FlightFields({
  flightRules,
  outboundIsArrival,
  isReturn,
  flightNumber,
  onFlightNumber,
  returnDate,
  onReturnDate,
  returnTime,
  onReturnTime,
  returnFlightNumber,
  onReturnFlightNumber,
  inputCls,
  labelCls,
}: {
  flightRules: FlightFieldRules;
  /** Heenrit vertrekt vanaf een luchthaven → aankomstlabel + Airport Arrival Service. */
  outboundIsArrival: boolean;
  isReturn: boolean;
  flightNumber: string;
  onFlightNumber: (value: string) => void;
  returnDate: string;
  onReturnDate: (value: string) => void;
  returnTime: string;
  onReturnTime: (value: string) => void;
  returnFlightNumber: string;
  onReturnFlightNumber: (value: string) => void;
  inputCls: string;
  labelCls: string;
}) {
  const t = useTranslations("booking");

  return (
    <>
      {/*
        Vluchtnummer heenrit — verplicht wanneer de heenrit VÁNAF een luchthaven
        vertrekt (aankomst monitoren), optioneel wanneer hij ernaartóe gaat, en
        verborgen als hij geen luchthaven raakt.
      */}
      {flightRules.outbound !== "hidden" && (
        <div className="sm:col-span-2">
          <label htmlFor="f-flight" className={labelCls}>
            {outboundIsArrival ? t("vluchtAankomend") : t("vluchtVertrekkend")}{" "}
            <span className={flightRules.outbound === "required" ? "text-accent" : "text-stone"}>
              {flightRules.outbound === "required" ? t("verplicht") : t("optioneel")}
            </span>
          </label>
          <input
            id="f-flight"
            name="vluchtnummer"
            value={flightNumber}
            onChange={(e) => onFlightNumber(e.target.value.toUpperCase())}
            placeholder="KL1234"
            autoComplete="off"
            spellCheck={false}
            maxLength={8}
            required={flightRules.outbound === "required"}
            aria-describedby="f-flight-help"
            className={inputCls}
          />
          <p id="f-flight-help" className="mt-1.5 text-[12px] text-secondary">
            {t("vluchtUitleg")}
          </p>

          {/*
            Airport Arrival Service — uitsluitend bij een OPHALING vanaf de
            luchthaven. De klant ziet wat inbegrepen is, niet waaruit de kosten
            bestaan. Het prijsmodel is niet vastgesteld: bewust geen bedragen.
          */}
          {outboundIsArrival && (
            <div className="mt-3 rounded-field border border-line bg-fog px-4 py-3">
              <p className="text-xs font-bold text-ink">{t("aasKop")}</p>
              <ul className="mt-2 flex flex-col gap-1.5 text-[12px] text-secondary">
                {(["aas1", "aas2", "aas3"] as const).map((k) => (
                  <li key={k} className="flex items-start gap-2">
                    <Icon name="check" size={13} className="mt-0.5 shrink-0 text-accent" />
                    {t(k)}
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 border-t border-line pt-2.5 text-[12px] text-secondary">
                {t("aasNa")}
              </p>
            </div>
          )}
        </div>
      )}

      {/*
        Retour — datum/tijd zijn verplicht en moeten strikt later liggen dan de
        heenrit. Het retourvluchtnummer volgt dezelfde regel als de heenrit:
        verplicht wanneer de retourrit vanaf een luchthaven vertrekt (dat is de
        heen-bestemming).
      */}
      {isReturn && (
        <>
          <div>
            <label htmlFor="f-return-date" className={labelCls}>
              {t("retourDatum")} <span className="text-accent">{t("verplicht")}</span>
            </label>
            <input
              id="f-return-date"
              type="date"
              value={returnDate}
              onChange={(e) => onReturnDate(e.target.value)}
              required
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="f-return-time" className={labelCls}>
              {t("retourTijd")} <span className="text-accent">{t("verplicht")}</span>
            </label>
            <input
              id="f-return-time"
              type="time"
              value={returnTime}
              onChange={(e) => onReturnTime(e.target.value)}
              required
              className={inputCls}
            />
          </div>
          {flightRules.return !== "hidden" && (
            <div className="sm:col-span-2">
              <label htmlFor="f-return-flight" className={labelCls}>
                {t("retourVlucht")}{" "}
                <span className={flightRules.return === "required" ? "text-accent" : "text-stone"}>
                  {flightRules.return === "required" ? t("verplicht") : t("optioneel")}
                </span>
              </label>
              <input
                id="f-return-flight"
                name="retourvluchtnummer"
                value={returnFlightNumber}
                onChange={(e) => onReturnFlightNumber(e.target.value.toUpperCase())}
                placeholder="KL1234"
                autoComplete="off"
                spellCheck={false}
                maxLength={8}
                required={flightRules.return === "required"}
                aria-describedby="f-return-flight-help"
                className={inputCls}
              />
              <p id="f-return-flight-help" className="mt-1.5 text-[12px] text-secondary">
                {t("vluchtUitleg")}
              </p>
            </div>
          )}
        </>
      )}
    </>
  );
}
