"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import JourneyLine from "@/components/horizon/JourneyLine";
import Button from "@/components/ui/Button";
import { formatDate } from "@/components/booking/steps/ConfirmStep";
import { BEDRIJF } from "@/lib/legal";
import { confirmationFields, type ConfirmationDetails, type ConfirmationField } from "@/lib/bookings/confirmation-details";
import { customerStatusHeadline, isPreConfirmation } from "@/lib/bookings/customer-status-copy";
import { buildRideIcs, rideIcsFilename } from "@/lib/bookings/ride-calendar";
import { maskEmail } from "@/lib/format/mask-email";
import { journeyTransition } from "@/lib/horizon/journey-line-state";

/** Korte plaatsnaam voor de lijn ("Amsterdam Zuidas, Amsterdam" → "Amsterdam Zuidas"). */
const short = (label: string) => label.split(",")[0]?.trim() || label;

const WHATSAPP_NUMBER = BEDRIJF.telefoonHref.replace(/\D/g, "");

/**
 * Bevestigingsmoment na een server-bevestigde betaling (Experience 2.0 §8).
 *
 * - Kop uit de gedeelde status → klanttaal-mapping: zolang T4XI de rit niet
 *   bevestigde, nooit "bevestigd" (ES 08). Betaling ≠ vervoersbevestiging.
 * - Volgorde ES 09 (`confirmationFields`); voertuigKLASSE, nooit een model (B5).
 * - Het betaalde bedrag komt van de aanroeper uit de server-intent.
 * - JourneyLine reist één keer (cinematic); reduced motion = direct eindstaat.
 *   Geen vinkje: dat zou meer beloven dan de status.
 */
export default function BookingConfirmation({
  details,
  paidLabel,
  locale,
}: {
  details: ConfirmationDetails;
  /** Geformatteerd bedrag uit de server-intent (create-intent-respons); `null` → geen bedragregel. */
  paidLabel: string | null;
  locale: string;
}) {
  const t = useTranslations("bevestiging");
  const tb = useTranslations("booking");
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Eén keer bepaald bij het verschijnen: de reis speelt hooguit één keer af.
  const [journey] = useState(() =>
    journeyTransition("route", "arrived", {
      reducedMotion: typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
    })
  );

  const [createdAt] = useState(() => new Date());

  // Het formulier (en de focus erin) verdwijnt; focus naar de nieuwe kop.
  useEffect(() => headingRef.current?.focus(), []);

  const headline = customerStatusHeadline(details.bookingStatus, "paid", locale);
  const tentative = isPreConfirmation(details.bookingStatus);
  const email = maskEmail(details.email);

  const ics = buildRideIcs({
    reference: details.bookingRef,
    tentative,
    now: createdAt,
    description: t("agendaOmschrijving", { ref: details.bookingRef, status: headline }),
    legs: [
      { date: details.date, time: details.time, location: details.pickup, summary: t("agendaTitel", { from: short(details.pickup), to: short(details.dropoff) }) },
      ...(details.returnTrip
        ? [{ date: details.returnDate, time: details.returnTime, location: details.dropoff, summary: t("agendaTitelTerug", { from: short(details.dropoff), to: short(details.pickup) }) }]
        : []),
    ],
  });

  function downloadIcs() {
    if (!ics) return;
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = rideIcsFilename(details.bookingRef);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const rows: Record<ConfirmationField, [string, string]> = {
    when: [t("datumTijd"), `${formatDate(details.date, locale)} · ${details.time}`],
    returnWhen: [t("terugrit"), `${formatDate(details.returnDate, locale)} · ${details.returnTime}`],
    pickup: [t("ophaallocatie"), details.pickup],
    dropoff: [t("bestemming"), details.dropoff],
    reference: [t("referentie"), details.bookingRef],
    contact: [t("contact"), email ?? ""],
    passengers: [t("passagiers"), String(details.passengers)],
    flight: [t("vluchtnummer"), details.flightNumber],
    returnFlight: [t("retourVlucht"), details.returnFlightNumber],
    vehicle: [t("voertuig"), t("voertuigklasse")],
    paid: [t("betaling"), paidLabel ? t("betaald", { amount: paidLabel }) : ""],
  };

  const whatsappHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(t("whatsappBericht", { ref: details.bookingRef }))}`;

  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-5" aria-labelledby="bevestiging-kop" data-booking-status={details.bookingStatus}>
      <h2 id="bevestiging-kop" ref={headingRef} tabIndex={-1} className="font-display text-lg font-semibold text-ink focus:outline-none">
        {headline}
      </h2>
      <p className="mt-1 text-sm text-secondary">{tb("succesBevestiging")}</p>

      <JourneyLine
        state={journey}
        from={short(details.pickup)}
        to={short(details.dropoff)}
        fromMeta={details.time}
        decorative
        className="hz-jl--cinematic my-5"
      />

      <dl className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
        {confirmationFields(details)
          .filter((field) => field !== "paid" || paidLabel)
          .map((field) => (
          <div key={field} className="contents" data-field={field}>
            <dt className="text-secondary">{rows[field][0]}</dt>
            <dd className="break-words font-medium text-ink">{rows[field][1]}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 flex flex-col gap-3">
        {ics ? (
          <Button variant="secondary" fullWidth onClick={downloadIcs}>
            {t("agenda")}
          </Button>
        ) : null}
        <Button
          variant="secondary"
          fullWidth
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("whatsappAria")}
         
        >
          {t("whatsapp")}
        </Button>
      </div>
    </section>
  );
}
