"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import JourneyLine from "@/components/horizon/JourneyLine";
import Button from "@/components/ui/Button";
import { formatDate } from "@/components/booking/steps/ConfirmStep";
import { BEDRIJF } from "@/lib/legal";
import { buildBookingIcs, shortPlace } from "@/lib/bookings/booking-calendar";
import { confirmationFields, type ConfirmationDetails, type ConfirmationField } from "@/lib/bookings/confirmation-details";
import { screenHeadline } from "@/lib/bookings/customer-status-copy";
import { rideIcsFilename } from "@/lib/bookings/ride-calendar";
import { maskEmail } from "@/lib/format/mask-email";
import { journeyTransition } from "@/lib/horizon/journey-line-state";
import { formatAmount } from "@/lib/payments/payment-flow";
import { isServerPaid, type ServerPaidProof } from "@/lib/payments/server-paid";
import type { Locale } from "@/i18n/routing";

const WHATSAPP_NUMBER = BEDRIJF.telefoonHref.replace(/\D/g, "");

/**
 * Bevestigingsmoment (Experience 2.0 §8) — rit-overzicht na het betalen.
 *
 * Harde guard (besluit eigenaar #72): "Betaling ontvangen", "€X betaald" en het
 * agenda-item verschijnen UITSLUITEND met een server-bewijs (`payment`, uit
 * `serverPaidProof` op de `paid`-status van /api/payments/status). Zonder geldig
 * bewijs — pending, nagemaakte props, een cast — toont dezelfde weergave de
 * pending-kop, zonder bedrag en zonder agenda. "Uw rit is bevestigd" volgt
 * alleen uit bookingstatus `confirmed` (`screenHeadline`).
 *
 * - Volgorde ES 09 (`confirmationFields`); voertuigKLASSE, nooit een model (B5).
 * - JourneyLine reist één keer (cinematic); reduced motion = direct eindstaat.
 *   Geen vinkje: dat zou meer beloven dan de status.
 */
export default function BookingConfirmation({
  details,
  payment,
  locale,
}: {
  details: ConfirmationDetails;
  /** Server-bewijs van betaling, of `null` zolang de server nog geen `paid` meldde. */
  payment: ServerPaidProof | null;
  locale: Locale;
}) {
  const t = useTranslations("bevestiging");
  const tb = useTranslations("booking");
  const tp = useTranslations("betaling");
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Eén keer bepaald bij het verschijnen: de reis speelt hooguit één keer af,
  // ook als dezelfde weergave daarna van pending naar betaald gaat.
  const [journey] = useState(() =>
    journeyTransition("route", "arrived", {
      reducedMotion: typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
    })
  );
  const [createdAt] = useState(() => new Date());

  // Het formulier (en de focus erin) verdwijnt; focus naar de nieuwe kop.
  useEffect(() => headingRef.current?.focus(), []);

  const paid = isServerPaid(payment);
  const headline = screenHeadline(details.bookingStatus, payment, locale);
  const email = maskEmail(details.email);
  const ics = buildBookingIcs(details, { locale, payment, now: createdAt });
  const paidLabel = paid && payment.amountCents !== null ? formatAmount(payment.amountCents, payment.currency, locale) : null;

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
    <section
      className="rounded-2xl border border-line bg-card p-4 sm:p-5"
      aria-labelledby="bevestiging-kop"
      data-booking-status={details.bookingStatus}
      data-payment={paid ? "paid" : "pending"}
    >
      {/* Live: dezelfde weergave gaat van pending naar betaald zonder te hermounten. */}
      <div aria-live="polite">
        <h2 id="bevestiging-kop" ref={headingRef} tabIndex={-1} className="font-display text-lg font-semibold text-ink focus:outline-none">
          {headline}
        </h2>
        <p className="mt-1 text-sm text-secondary">{paid ? tb("succesBevestiging") : tp("pending")}</p>
      </div>

      <JourneyLine
        state={journey}
        from={shortPlace(details.pickup)}
        to={shortPlace(details.dropoff)}
        fromMeta={details.time}
        decorative
        className="hz-jl--cinematic my-5"
      />

      <dl className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px] sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]">
        {confirmationFields(details, payment).map((field) => (
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
        <Button variant="secondary" fullWidth href={whatsappHref} target="_blank" rel="noopener noreferrer" aria-label={t("whatsappAria")}>
          {t("whatsapp")}
        </Button>
      </div>
    </section>
  );
}
