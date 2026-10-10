import { useLocale, useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import type { BookingStep } from "@/lib/booking/steps";
import { LUGGAGE } from "./RideStep";
import { STEP_TITLE_KEY } from "./StepProgress";

export type ContactSummary = { name: string; phone: string; email: string };

export function formatDate(iso: string, locale: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
}

/**
 * Stap 4 — Bevestigen: alleen-lezen overzicht van dezelfde state, met per
 * blok een weg terug. De primaire actie (verzenden) staat in de actiebalk.
 * Geen nieuwe beloftes: alleen wat de klant zelf invulde.
 */
export default function ConfirmStep({
  pickup,
  dropoff,
  retour,
  date,
  time,
  returnDate,
  returnTime,
  persons,
  luggage,
  flightNumber,
  returnFlightNumber,
  contact,
  onEdit,
}: {
  pickup: string;
  dropoff: string;
  retour: boolean;
  date: string;
  time: string;
  returnDate: string;
  returnTime: string;
  persons: number;
  luggage: string;
  flightNumber: string;
  returnFlightNumber: string;
  contact: ContactSummary;
  onEdit: (step: BookingStep) => void;
}) {
  const t = useTranslations("booking");
  const locale = useLocale();
  const luggageKey = LUGGAGE.find((l) => l.value === luggage)?.labelKey;

  const blocks: { step: BookingStep; rows: [string, string][] }[] = [
    {
      step: "route",
      rows: [
        [t("ritType"), t(retour ? "tabRetour" : "tabEnkel")],
        [t("van"), pickup],
        [t("naar"), dropoff],
      ],
    },
    {
      step: "rit",
      rows: [
        [t("datum"), `${formatDate(date, locale)} · ${time}`],
        ...(retour ? ([[t("retourDatum"), `${formatDate(returnDate, locale)} · ${returnTime}`]] as [string, string][]) : []),
        [t("passagiers"), String(persons)],
        [t("bagage"), luggageKey ? t(luggageKey) : "—"],
        ...(flightNumber ? ([[t("vluchtnummerKort"), flightNumber]] as [string, string][]) : []),
        ...(retour && returnFlightNumber ? ([[t("retourVlucht"), returnFlightNumber]] as [string, string][]) : []),
      ],
    },
    {
      step: "gegevens",
      rows: [
        [t("naam"), contact.name],
        [t("telefoon"), contact.phone],
        [t("email"), contact.email],
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block) => (
        <section key={block.step} className="rounded-field border border-line bg-fog px-4 py-3" aria-label={t(STEP_TITLE_KEY[block.step])}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-text">{t(STEP_TITLE_KEY[block.step])}</h3>
            <Button
              variant="text"
              arrow={false}
              onClick={() => onEdit(block.step)}
              aria-label={`${t("wijzig")}: ${t(STEP_TITLE_KEY[block.step])}`}
            >
              {t("wijzig")}
            </Button>
          </div>
          <dl className="mt-1 grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
            {block.rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-secondary">{k}</dt>
                <dd className="break-words font-medium text-ink">{v || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
