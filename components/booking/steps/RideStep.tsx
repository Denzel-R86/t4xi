import { useTranslations } from "next-intl";
import FlightCard from "@/components/booking/FlightCard";
import Icon from "@/components/ui/Icon";
import { BOOKING_FIELD_ID } from "@/lib/booking/steps";
import { FieldError, RequiredMark, dateTimeCls, fieldA11y, inputCls, labelCls, type FieldErrorState } from "./fields";

export const LUGGAGE = [
  { value: "geen-bagage", labelKey: "bagageGeen" },
  { value: "handbagage", labelKey: "bagageHand" },
  { value: "1-2-koffers", labelKey: "bagage12" },
  { value: "3-koffers", labelKey: "bagage3" },
  { value: "overleg", labelKey: "bagageOverleg" },
] as const;

/** ISO-datum van vandaag (lokale tijd) — uitsluitend voor de `min`-grens van het HTML-datumveld (dat werkt alleen op dagniveau). */
function todayISO(): string {
  const d = new Date();
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}

type Direction = "arrival" | "departure" | null;

/** Stap 2 — Rit: moment, passagiers, bagage en (bij luchthavenritten) vluchtnummers. */
export default function RideStep({
  retour,
  date,
  onDate,
  time,
  onTime,
  returnDate,
  onReturnDate,
  returnTime,
  onReturnTime,
  persons,
  onPersons,
  luggage,
  onLuggage,
  needsFlight,
  isArrival,
  flightRequired,
  returnFlightRequired,
  outboundDirection,
  returnDirection,
  flightNumber,
  onFlightNumber,
  returnFlightNumber,
  onReturnFlightNumber,
  error,
}: {
  retour: boolean;
  date: string;
  onDate: (v: string) => void;
  time: string;
  onTime: (v: string) => void;
  returnDate: string;
  onReturnDate: (v: string) => void;
  returnTime: string;
  onReturnTime: (v: string) => void;
  persons: number;
  onPersons: (v: number) => void;
  luggage: string;
  onLuggage: (v: string) => void;
  needsFlight: boolean;
  isArrival: boolean;
  flightRequired: boolean;
  returnFlightRequired: boolean;
  outboundDirection: Direction;
  returnDirection: Direction;
  flightNumber: string;
  onFlightNumber: (v: string) => void;
  returnFlightNumber: string;
  onReturnFlightNumber: (v: string) => void;
  error: FieldErrorState;
}) {
  const t = useTranslations("booking");

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="min-w-0">
        <label htmlFor={BOOKING_FIELD_ID.date} className={labelCls}>{t("datum")}<RequiredMark /></label>
        <input id={BOOKING_FIELD_ID.date} name="datum" type="date" required min={todayISO()} className={dateTimeCls} value={date} onChange={(e) => onDate(e.target.value)} {...fieldA11y("date", error)} />
        <FieldError field="date" error={error} />
      </div>
      <div className="min-w-0">
        <label htmlFor={BOOKING_FIELD_ID.time} className={labelCls}>{t("tijd")}<RequiredMark /></label>
        <input id={BOOKING_FIELD_ID.time} name="tijd" type="time" required className={dateTimeCls} value={time} onChange={(e) => onTime(e.target.value)} {...fieldA11y("time", error)} />
        <FieldError field="time" error={error} />
      </div>
      {retour && (
        <>
          <div className="min-w-0">
            <label htmlFor={BOOKING_FIELD_ID.returnDate} className={labelCls}>{t("retourDatum")}<RequiredMark /></label>
            <input
              id={BOOKING_FIELD_ID.returnDate}
              type="date"
              required
              className={dateTimeCls}
              value={returnDate}
              min={date || undefined}
              onChange={(e) => onReturnDate(e.target.value)}
              {...fieldA11y("returnDate", error)}
            />
            <FieldError field="returnDate" error={error} />
          </div>
          <div className="min-w-0">
            <label htmlFor={BOOKING_FIELD_ID.returnTime} className={labelCls}>{t("retourTijd")}<RequiredMark /></label>
            <input
              id={BOOKING_FIELD_ID.returnTime}
              type="time"
              required
              className={dateTimeCls}
              value={returnTime}
              onChange={(e) => onReturnTime(e.target.value)}
              {...fieldA11y("returnTime", error)}
            />
            <FieldError field="returnTime" error={error} />
          </div>
        </>
      )}
      <div className="min-w-0">
        <label htmlFor={BOOKING_FIELD_ID.persons} className={labelCls}>{t("passagiers")}</label>
        <input
          id={BOOKING_FIELD_ID.persons}
          type="number"
          min={1}
          max={4}
          value={persons}
          onChange={(e) => onPersons(Number(e.target.value) || 1)}
          className={inputCls}
          {...fieldA11y("persons", error)}
        />
        <FieldError field="persons" error={error} />
      </div>
      <div className="min-w-0">
        <label htmlFor={BOOKING_FIELD_ID.luggage} className={labelCls}>{t("bagage")}<RequiredMark /></label>
        <select
          id={BOOKING_FIELD_ID.luggage}
          value={luggage}
          required
          onChange={(e) => onLuggage(e.target.value)}
          className={inputCls}
          {...fieldA11y("luggage", error)}
        >
          <option value="" disabled>{t("bagageKies")}</option>
          {LUGGAGE.map((l) => (
            <option key={l.value} value={l.value}>{t(l.labelKey)}</option>
          ))}
        </select>
        <FieldError field="luggage" error={error} />
      </div>

      {/*
        Vluchtnummer — verschijnt uitsluitend bij luchthavenritten, zodra de
        prijsengine heeft bevestigd dat herkomst of bestemming een luchthaven is.
        Bij ophalen na een aankomende vlucht is het nummer verplicht om de
        vluchtstatus te volgen; bij wegbrengen naar de luchthaven is het optioneel.
      */}
      {needsFlight && (
        <div className="min-w-0 sm:col-span-2">
          <label htmlFor={BOOKING_FIELD_ID.flight} className={labelCls}>
            {isArrival ? t("vluchtAankomend") : t("vluchtVertrekkend")}{" "}
            <span className={flightRequired ? "text-accent" : "text-stone-text"}>
              {flightRequired ? t("verplicht") : t("optioneel")}
            </span>
          </label>
          <input
            id={BOOKING_FIELD_ID.flight}
            name="vluchtnummer"
            value={flightNumber}
            onChange={(e) => onFlightNumber(e.target.value.toUpperCase())}
            placeholder="KL1234"
            autoComplete="off"
            spellCheck={false}
            maxLength={8}
            required={flightRequired}
            className={inputCls}
            {...fieldA11y("flight", error, "f-flight-help")}
          />
          <FieldError field="flight" error={error} />
          <p id="f-flight-help" className="mt-1.5 text-[12px] text-secondary">
            {isArrival ? t("vluchtHelpAankomst") : t("vluchtHelpVertrek")}
          </p>

          {/* Live vluchtkaart (7.9A): debounced check op /api/flights/* zodra
              een vluchtnummer is ingevoerd. Richting meegeven zodat het JUISTE
              ritdeel (vertrek vs aankomst) van hetzelfde vluchtnummer wordt getoond. */}
          <FlightCard flightNumber={flightNumber} direction={outboundDirection} />

          {retour && (
            <div className="mt-4 border-t border-line pt-4">
              <label htmlFor={BOOKING_FIELD_ID.returnFlight} className={labelCls}>
                {t("retourVlucht")} — {isArrival ? t("vluchtVertrekkend") : t("vluchtAankomend")}{" "}
                <span className={returnFlightRequired ? "text-accent" : "text-stone-text"}>
                  {returnFlightRequired ? t("verplicht") : t("optioneel")}
                </span>
              </label>
              <input
                id={BOOKING_FIELD_ID.returnFlight}
                value={returnFlightNumber}
                onChange={(e) => onReturnFlightNumber(e.target.value.toUpperCase())}
                placeholder="KL1234"
                autoComplete="off"
                spellCheck={false}
                maxLength={8}
                required={returnFlightRequired}
                className={inputCls}
                {...fieldA11y("returnFlight", error)}
              />
              <FieldError field="returnFlight" error={error} />
              <FlightCard flightNumber={returnFlightNumber} direction={returnDirection} />
            </div>
          )}

          {/*
            Airport Arrival Service — uitsluitend bij een OPHALING. De klant ziet
            wat inbegrepen is, niet waaruit de kosten bestaan: geen parkeerbedrag
            en geen aparte toeslagregel. Het prijsmodel is nog niet vastgesteld,
            dus hier staan bewust geen bedragen.
          */}
          {isArrival && (
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
    </div>
  );
}
