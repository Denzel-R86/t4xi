import { useTranslations } from "next-intl";
import { BOOKING_STEPS, stepStatus, type BookingStep } from "@/lib/booking/steps";

export const STEP_TITLE_KEY: Record<BookingStep, "stapRoute" | "stapRit" | "stapGegevens" | "stapBevestigen"> = {
  route: "stapRoute",
  rit: "stapRit",
  gegevens: "stapGegevens",
  bevestigen: "stapBevestigen",
};

/**
 * Voortgang Route → Rit → Gegevens → Bevestigen. Afgeronde stappen zijn een
 * knop terug; de huidige stap draagt `aria-current="step"`; vooruit gaat
 * alleen via de primaire actie (die valideert).
 */
export default function StepProgress({
  current,
  onGoTo,
}: {
  current: BookingStep;
  onGoTo: (step: BookingStep) => void;
}) {
  const t = useTranslations("booking");
  return (
    <nav aria-label={t("stapVoortgang")} className="mb-6">
      <ol className="grid grid-cols-4 gap-2">
        {BOOKING_STEPS.map((step, i) => {
          const status = stepStatus(step, current);
          const bar = (
            <span
              aria-hidden="true"
              className={`block h-px w-full origin-left transition-colors duration-ui ease-premium motion-reduce:transition-none ${
                status === "upcoming" ? "bg-line-strong" : "bg-ink"
              }`}
            />
          );
          const label = (
            // Mobiel: geen nummer en geen kapitalen, zodat "Bevestigen" in een kwart past.
            <span className="mt-2 flex items-baseline gap-1.5 text-[11px] font-medium sm:uppercase sm:tracking-[0.12em]">
              <span aria-hidden="true" className="hidden tabular-nums sm:inline">{i + 1}</span>
              <span className="truncate">{t(STEP_TITLE_KEY[step])}</span>
            </span>
          );
          return (
            <li key={step} className="min-w-0">
              {status === "complete" ? (
                <button
                  type="button"
                  onClick={() => onGoTo(step)}
                  className="block min-h-11 w-full text-left text-ink underline-offset-4 hover:underline"
                >
                  {bar}
                  {label}
                </button>
              ) : (
                <span
                  aria-current={status === "current" ? "step" : undefined}
                  className={`block min-h-11 ${status === "current" ? "font-semibold text-ink" : "text-stone-text"}`}
                >
                  {bar}
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
