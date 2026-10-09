import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { BOOKING_STEPS, stepIndex, type BookingStep } from "@/lib/booking/steps";
import { STEP_TITLE_KEY } from "./StepProgress";

/**
 * Eén stap van het formulier. Inactieve stappen blijven gemount (`hidden`),
 * zodat FormData en de velden-state ongewijzigd blijven; de kop is het
 * focusdoel na een stapwissel. Stapwissel-animatie: `.booking-step` in
 * app/globals.css (`--hz-ui`, reduced motion = direct).
 */
export default function StepPanel({
  step,
  active,
  animate,
  panelRef,
  headingRef,
  children,
}: {
  step: BookingStep;
  active: boolean;
  animate: boolean;
  panelRef: (el: HTMLDivElement | null) => void;
  headingRef: (el: HTMLHeadingElement | null) => void;
  children: ReactNode;
}) {
  const t = useTranslations("booking");
  return (
    <div ref={panelRef} hidden={!active} data-animate={animate && active ? "" : undefined} className="booking-step">
      <h2 ref={headingRef} tabIndex={-1} className="mb-4 font-display text-lg font-semibold text-ink focus:outline-none">
        <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-stone-text">
          {t("stapVanTotaal", { current: stepIndex(step) + 1, total: BOOKING_STEPS.length })}
        </span>
        {t(STEP_TITLE_KEY[step])}
      </h2>
      {children}
    </div>
  );
}
