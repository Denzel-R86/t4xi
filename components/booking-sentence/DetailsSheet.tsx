"use client";

import { useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import { useFormatter, useTranslations } from "next-intl";
import Icon from "@/components/ui/Icon";
import Button from "@/components/ui/Button";
import { dateTimeCls, inputCls, labelCls } from "@/components/booking/steps/fields";
import { SENTENCE_PASSENGERS, sentencePassengers } from "@/lib/hero/sentence-reveal";
import { todayISO } from "./sentence-env";
import { trapSheetTab, useSheetDialog } from "./sheet-dialog";

/*
 * Mobiele boekingszin, tweede regel (Experience 2.0 PR 2.6b, masterplan §6.5):
 * "op … om … met … en …" is onder 768px één knop die een bottom sheet opent met
 * native pickers op volle breedte (datum, tijd, passagiers, bagage). Zelfde
 * basis als de adres-sheet (sheet-dialog.ts). De sheet werkt op een concept
 * (besluit eigenaar 14-10): alleen "Klaar" schrijft de waarden in de zin;
 * Escape, Sluiten en een tik buiten de sheet annuleren. Heropenen toont de
 * laatst toegepaste waarden. Zo start er tijdens het kiezen geen prijsaanvraag.
 * Datum/tijd gebruiken `dateTimeCls` van /boeken (F-26: appearance:none +
 * min-width:0, zodat iOS het veld niet breder maakt dan de kolom).
 */

export const HERO_LUGGAGE = [
  { value: "geen-bagage", labelKey: "bagageGeen" },
  { value: "handbagage", labelKey: "bagageHand" },
  { value: "1-2-koffers", labelKey: "bagage12" },
  { value: "3-koffers", labelKey: "bagage3" },
  { value: "overleg", labelKey: "bagageOverleg" },
] as const;

export type RideDetails = { date: string; time: string; passengers: number; luggage: string };

export const DETAILS_SHEET_ID = "hero-details-sheet";

/*
 * WebKit negeert min-height op een native <select> (gemeten: ~24px hoog in
 * WebKit iPhone 13). Daarom appearance:none + vaste 52px, met een eigen pijl
 * uit Icon.tsx; de native keuzelijst opent zoals altijd.
 */
const selectCls = `${inputCls} block h-[52px] appearance-none pr-11 [-webkit-appearance:none]`;
const chevronCls = "pointer-events-none absolute bottom-[17px] right-4 text-ink";

/**
 * De tweede zinregel als inline velden (≥ 768px, sinds PR 2.1); ongewijzigd uit
 * SentencePattern verplaatst (PR 2.6b). Onder 768px vervangen door DetailsTrigger.
 */
export function InlineDetails({
  details,
  onChange,
}: {
  details: RideDetails;
  onChange: (patch: Partial<RideDetails>) => void;
}) {
  const t = useTranslations("zin");
  return (
    <div className="hz-sentence-text mt-2 font-display text-[clamp(15px,1.7vw,20px)] font-light leading-[1.6] text-ink/75 max-md:hidden">
      {t("op")}{" "}
      <span className="hz-focus relative inline-block align-baseline">
        <input
          type="date"
          className="hz-blank font-display font-medium"
          style={{ width: "10.5ch" }}
          min={todayISO()}
          value={details.date}
          onChange={(e) => onChange({ date: e.target.value })}
          aria-label={t("ariaDatum")}
        />
      </span>{" "}
      {t("om")}{" "}
      <span className="hz-focus relative inline-block align-baseline">
        <input
          type="time"
          className="hz-blank hz-time font-display font-medium"
          value={details.time}
          onChange={(e) => onChange({ time: e.target.value })}
          aria-label={t("ariaTijd")}
        />
      </span>{" "}
      {t("met")}{" "}
      <span>
        <span className="hz-focus relative inline-block align-baseline">
          <select
            className="hz-blank font-display font-medium"
            value={details.passengers}
            onChange={(e) => onChange({ passengers: sentencePassengers(e.target.value) })}
            aria-label={t("ariaPassagiers")}
          >
            {SENTENCE_PASSENGERS.map((n) => (
              <option key={n} value={n}>{t("passagiersAantal", { count: n })}</option>
            ))}
          </select>
        </span>{" "}
        {t("en")}{" "}
      </span>
      <span className="hz-focus relative inline-block align-baseline">
        <select
          className="hz-blank font-display font-medium"
          value={details.luggage}
          onChange={(e) => onChange({ luggage: e.target.value })}
          aria-label={t("ariaBagage")}
        >
          <option value="" disabled>{t("kiesBagage")}</option>
          {HERO_LUGGAGE.map((l) => (
            <option key={l.value} value={l.value}>{t(l.labelKey)}</option>
          ))}
        </select>
      </span>
      .
    </div>
  );
}

function Blank({ filled, children }: { filled: boolean; children: ReactNode }) {
  return (
    <span
      className={`hz-focus inline-block whitespace-nowrap px-0.5 ${
        filled ? "font-medium text-ink" : "font-normal lowercase text-stone-text"
      }`}
    >
      {children}
    </span>
  );
}

/** De zinregel "op … om … met … en …" als één knop; alleen < 768px. */
export function DetailsTrigger({
  details,
  expanded,
  onOpen,
  triggerRef,
}: {
  details: RideDetails;
  expanded: boolean;
  onOpen: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const t = useTranslations("zin");
  const format = useFormatter();
  const luggageKey = HERO_LUGGAGE.find((l) => l.value === details.luggage)?.labelKey;
  // ISO-datum als kalenderdag (UTC), zodat de tijdzone de dag niet verschuift.
  const dateText = details.date
    ? format.dateTime(new Date(`${details.date}T00:00:00Z`), {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      })
    : null;
  return (
    <button
      ref={triggerRef}
      type="button"
      className="hz-sheet-trigger hz-sentence-text mt-2 block w-full py-1 text-left font-display text-[15px] font-light leading-[1.6] text-ink/75 md:hidden"
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-controls={DETAILS_SHEET_ID}
      onClick={onOpen}
    >
      {t("op")} <Blank filled={dateText !== null}>{dateText ?? t("ariaDatum")}</Blank> {t("om")}{" "}
      <Blank filled={Boolean(details.time)}>{details.time || t("ariaTijd")}</Blank> {t("met")}{" "}
      <Blank filled>{t("passagiersAantal", { count: details.passengers })}</Blank> {t("en")}{" "}
      <Blank filled={Boolean(luggageKey)}>{luggageKey ? t(luggageKey) : t("kiesBagage")}</Blank>.
    </button>
  );
}

export function DetailsSheet({
  open,
  details,
  onCommit,
  onClosed,
  returnFocusRef,
}: {
  open: boolean;
  details: RideDetails;
  /** "Klaar": de waarden gaan de zin in (daarna sluit de sheet). */
  onCommit: (details: RideDetails) => void;
  onClosed: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const t = useTranslations("zin");
  const tr = useTranslations("routes");
  const tz = useTranslations("routezoeker");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Concept: bij elke opening opnieuw gevuld met wat er in de zin staat.
  const [draft, setDraft] = useState<RideDetails>(details);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(details);
  }
  // Focus op de titel, niet op een veld: anders opent iOS direct een picker.
  useSheetDialog({ open, dialogRef, initialFocusRef: titleRef, returnFocusRef, onClosed });

  // Tik buiten de sheet (op de backdrop) = annuleren. Een klik op de backdrop
  // komt bij de <dialog> zelf binnen, met coördinaten buiten zijn vlak.
  function cancelOnBackdrop(e: MouseEvent<HTMLDialogElement>) {
    if (e.target !== e.currentTarget) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.currentTarget.close();
  }

  const set = (patch: Partial<RideDetails>) => setDraft((d) => ({ ...d, ...patch }));
  const id = DETAILS_SHEET_ID;

  return (
    <dialog
      ref={dialogRef}
      id={id}
      className="hz-sheet hz-sheet--fit bg-card text-ink shadow-card"
      aria-labelledby={`${id}-title`}
      onKeyDown={(e) => trapSheetTab(e, dialogRef.current)}
      onClick={cancelOnBackdrop}
    >
      <span className="hz-sheet-handle" aria-hidden="true" />
      <div className="flex items-center justify-between">
        <h2 id={`${id}-title`} ref={titleRef} tabIndex={-1} className="font-sans text-[17px] font-semibold focus:outline-none">
          {tz("uwRitKop")}
        </h2>
        <button
          type="button"
          className="-mr-2 flex h-11 w-11 items-center justify-center rounded-field text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          aria-label={tr("sluiten")}
          onClick={() => dialogRef.current?.close()}
        >
          <Icon name="x" size={20} />
        </button>
      </div>
      <div className="mt-2 grid min-h-0 flex-1 gap-3 overflow-y-auto overscroll-contain">
        <div className="min-w-0">
          <label htmlFor={`${id}-date`} className={labelCls}>{t("ariaDatum")}</label>
          <input
            id={`${id}-date`}
            type="date"
            min={todayISO()}
            className={dateTimeCls}
            value={draft.date}
            onChange={(e) => set({ date: e.target.value })}
          />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${id}-time`} className={labelCls}>{t("ariaTijd")}</label>
          <input
            id={`${id}-time`}
            type="time"
            className={dateTimeCls}
            value={draft.time}
            onChange={(e) => set({ time: e.target.value })}
          />
        </div>
        <div className="relative min-w-0">
          <label htmlFor={`${id}-passengers`} className={labelCls}>{t("ariaPassagiers")}</label>
          <select
            id={`${id}-passengers`}
            className={selectCls}
            value={draft.passengers}
            onChange={(e) => set({ passengers: sentencePassengers(e.target.value) })}
          >
            {SENTENCE_PASSENGERS.map((n) => (
              <option key={n} value={n}>{t("passagiersAantal", { count: n })}</option>
            ))}
          </select>
          <Icon name="chevron-down" size={18} className={chevronCls} />
        </div>
        <div className="relative min-w-0">
          <label htmlFor={`${id}-luggage`} className={labelCls}>{t("ariaBagage")}</label>
          <select
            id={`${id}-luggage`}
            className={selectCls}
            value={draft.luggage}
            onChange={(e) => set({ luggage: e.target.value })}
          >
            <option value="" disabled>{t("kiesBagage")}</option>
            {HERO_LUGGAGE.map((l) => (
              <option key={l.value} value={l.value}>{t(l.labelKey)}</option>
            ))}
          </select>
          <Icon name="chevron-down" size={18} className={chevronCls} />
        </div>
      </div>
      <Button
        variant="primary"
        fullWidth
        className="mt-4 shrink-0"
        onClick={() => {
          onCommit(draft);
          dialogRef.current?.close();
        }}
      >
        {t("klaar")}
      </Button>
    </dialog>
  );
}
