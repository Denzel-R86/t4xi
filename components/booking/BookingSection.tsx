"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { type AddressSuggestion } from "@/components/shared/AddressAutocomplete";
import { useRouteQuote } from "@/components/shared/useRouteQuote";
import PaymentStep from "@/components/booking/PaymentStep";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { inferAddressMeta } from "@/lib/booking-meta";
import {
  BOOKING_STEPS,
  blocksStep,
  firstBookingFieldError,
  generalErrorIcon,
  initialBookingStep,
  nextStep,
  previousStep,
  serverFieldError,
  type BookingStep,
  type FieldMessageKey,
  type GeneralErrorKind,
} from "@/lib/booking/steps";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import { amsterdamDepartureIso } from "@/lib/pricing/departure-time";
import RouteStep, { type BookableRideType } from "./steps/RouteStep";
import RideStep from "./steps/RideStep";
import DetailsStep from "./steps/DetailsStep";
import ConfirmStep, { type ContactSummary } from "./steps/ConfirmStep";
import PricePreview from "./steps/PricePreview";
import StepPanel from "./steps/StepPanel";
import StepProgress from "./steps/StepProgress";
import { useStepFlow } from "./steps/useStepFlow";
import HandoffRouteLine from "./handoff/HandoffRouteLine";
import { clearHandoff, priceWhileVerifying } from "@/lib/booking-handoff";

/**
 * 2026-08-19 (audit-correctie): toetst het VOLLEDIGE vertrekmoment (datum +
 * tijd) in Europe/Amsterdam, niet alleen de datum — "vandaag, een uur
 * geleden" moet net zo geweigerd worden als "gisteren". Hergebruikt
 * uitsluitend `amsterdamDepartureIso` (dezelfde helper als de server in
 * app/api/pricing/quote/route.ts) — geen tweede tijdzone-implementatie, dus
 * front- en backend hanteren gegarandeerd dezelfde betekenis van "in het
 * verleden". Ongeldige datum/tijd (incl. een niet-bestaande DST-wandkloktijd)
 * → `false`, fail-closed.
 */
function isFutureAmsterdamDeparture(date: string, time: string): boolean {
  const iso = amsterdamDepartureIso(date, time);
  return iso !== null && new Date(iso).getTime() >= Date.now();
}

/**
 * Boekingsformulier (#boeken) als stappen Route → Rit → Gegevens → Bevestigen
 * (Experience 2.0 PR 2.4). De stappen zijn uitsluitend een WEERGAVE: één state,
 * één `<form>`, alle velden blijven gemount (inactieve stappen `hidden`), dus
 * FormData, payload en validatie zijn dezelfde als vóór de split.
 */
export default function BookingSection({
  initialPickup,
  initialDropoff,
  initialReturn,
  initialPersons,
  initialDate,
  initialTime,
  initialReturnDate,
  initialReturnTime,
  initialLuggage,
  handoff,
}: {
  /** Deep-link (?pickup=…): veld vooraf gevuld, prijs rekent direct. */
  initialPickup?: string;
  /** Deep-link (?dropoff=…). */
  initialDropoff?: string;
  /** Deep-link (?retour=1): start op de retour-tab. */
  initialReturn?: boolean;
  /** Deep-link (?persons=…): aantal passagiers vooraf ingevuld (1–4). */
  initialPersons?: number;
  /** Deep-link vanuit de tariefzoeker; uitsluitend gevalideerde ISO-velden. */
  initialDate?: string;
  initialTime?: string;
  initialReturnDate?: string;
  initialReturnTime?: string;
  /** Deep-link (?luggage=…): vooraf gevuld vanuit de homepagehero, uitsluitend bekende categorieën. */
  initialLuggage?: string;
  /**
   * Rit uit de hero-handoff (PR 2.3, §7): toont de route-lijn en, zolang de rit
   * ongewijzigd is en de hook nog verifieert, de prijs die de server in de hero
   * gaf (alleen uit het geheugen, nooit uit storage).
   */
  handoff?: { price: number | null };
} = {}) {
  const t = useTranslations("booking");
  const locale = useLocale();
  const [tab, setTab] = useState<BookableRideType>(initialReturn ? "retour" : "enkel");
  const [pickup, setPickup] = useState<AddressSuggestion | null>(
    initialPickup ? { id: "deeplink", label: initialPickup, source: "free" } : null
  );
  const [dropoff, setDropoff] = useState<AddressSuggestion | null>(
    initialDropoff ? { id: "deeplink", label: initialDropoff, source: "free" } : null
  );
  const [persons, setPersons] = useState(
    initialPersons && initialPersons >= 1 ? Math.min(4, Math.floor(initialPersons)) : 1
  );
  // 2026-08-19 (hotfix): leeg (niet vooraf op "handbagage" gezet) zodat bagage
  // altijd een BEWUSTE keuze is — ook "Geen bagage" moet expliciet aangeklikt worden.
  // Uitzondering: een reeds bewust in de hero gekozen waarde komt hier vooraf-gevuld binnen.
  const [luggage, setLuggage] = useState(initialLuggage ?? "");
  // Datum/tijd zijn controlled zodat de live richtprijs ze traffic-aware meestuurt
  // (de submit blijft ze óók via FormData lezen — de name-attributen blijven staan).
  const [date, setDate] = useState(initialDate ?? "");
  const [time, setTime] = useState(initialTime ?? "08:00");
  const [returnDate, setReturnDate] = useState(initialReturnDate ?? "");
  const [returnTime, setReturnTime] = useState(initialReturnTime ?? "18:00");
  const [flightNumber, setFlightNumber] = useState("");
  const [returnFlightNumber, setReturnFlightNumber] = useState("");

  type SubmitState =
    | { status: "idle" | "loading" }
    | { status: "success"; bookingRef: string; bookingId: string | null; quoteOnRequest: boolean; price: number | null }
    | { status: "error"; message: string; kind: GeneralErrorKind };
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });
  const loading = submit.status === "loading";

  // ── Stappenweergave (PR 2.4): alleen presentatie, geen invloed op payload ──
  const [contact, setContact] = useState<ContactSummary>({ name: "", phone: "", email: "" });
  const translate = useCallback((key: FieldMessageKey) => t(key), [t]);
  const clearGeneralError = useCallback(() => setSubmit((s) => (s.status === "error" ? { status: "idle" } : s)), []);
  const flow = useStepFlow({
    initialStep: initialBookingStep({ hasPickup: Boolean(initialPickup), hasDropoff: Boolean(initialDropoff) }),
    translate,
    onFieldError: clearGeneralError,
  });
  const { step, fieldError, showFieldError, goTo, formRef, panelRefs, headingRefs, clearFieldErrorOnInput, stepControlsValid } = flow;

  // Anti-stale betaling: zodra rit- of contactbepalende data wijzigt ná een geslaagde
  // boeking, is de aangemaakte boeking (bookingRef) én de betaalstap verouderd.
  // We resetten dan naar "idle" zodat de klant opnieuw boekt en een verse
  // PaymentIntent op de nieuwe gegevens ontstaat — nooit stilzwijgend het oude
  // bedrag/bookingRef hergebruiken.
  useEffect(() => {
    setSubmit((s) => (s.status === "success" ? { status: "idle" } : s));
  }, [
    pickup?.label,
    dropoff?.label,
    tab,
    persons,
    date,
    time,
    returnDate,
    returnTime,
    luggage,
    flightNumber,
    returnFlightNumber,
  ]);

  // Geslaagde boeking: de rit hoeft niet langer in sessionStorage te staan.
  useEffect(() => {
    if (submit.status === "success") clearHandoff();
  }, [submit.status]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return; // geen dubbele submit
    if (!quoteAllowsBooking) {
      setSubmit({ status: "error", kind: "price", message: t("prijsFout") });
      return;
    }
    // Zelfde checks, zelfde volgorde en meldingen als vóór PR 2.4
    // (lib/booking/steps.ts); nu met het veld erbij voor focus-na-fout.
    const invalid = firstBookingFieldError(validationInput);
    if (invalid) {
      showFieldError(invalid.field, t(invalid.messageKey));
      return;
    }
    if (!pickup || !dropoff) return; // al afgevangen hierboven; versmalt het type

    const form = new FormData(e.currentTarget);
    const payload = {
      rideType: tab,
      pickup: pickup.label,
      dropoff: dropoff.label,
      // Quote-lock: het gelockte bedrag uit de getoonde prijs. De server bindt
      // hierop en berekent niet opnieuw. Leeg bij offerte-op-aanvraag/onbekend.
      quoteId: quote.status === "ready" ? quote.quoteId : null,
      date: String(form.get("datum") ?? ""),
      time: String(form.get("tijd") ?? ""),
      returnDate: tab === "retour" ? returnDate : "",
      returnTime: tab === "retour" ? returnTime : "",
      persons,
      luggage,
      flightNumber: needsFlight ? flightNumber.trim() : "",
      returnFlightNumber: tab === "retour" && needsFlight ? returnFlightNumber.trim() : "",
      customerName: String(form.get("naam") ?? ""),
      customerPhone: String(form.get("telefoon") ?? ""),
      customerEmail: String(form.get("email") ?? ""),
      // Taal van de bevestigingsmail. De server valideert dit opnieuw en valt bij
      // een ongeldige waarde terug op "nl" — nooit blind op clientdata vertrouwen.
      locale,
      // Honeypot: leeg bij echte gebruikers; bots vullen dit → API blokkeert stil.
      website: String(form.get("website") ?? ""),
    };

    setSubmit({ status: "loading" });
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setSubmit({
          status: "success",
          bookingRef: data.bookingRef,
          bookingId: typeof data.bookingId === "string" ? data.bookingId : null,
          quoteOnRequest: Boolean(data.quoteOnRequest),
          price: typeof data.price === "number" ? data.price : null,
        });
      } else {
        // Servervalidatie van een contactveld → fout bij dat veld (F-13);
        // al het andere blijft een algemene melding met de servertekst.
        const serverField = serverFieldError(data.message);
        if (serverField) {
          showFieldError(serverField.field, t(serverField.messageKey));
        } else {
          setSubmit({
            status: "error",
            kind: res.status === 429 ? "rate" : "server",
            message: data.message ?? t("foutFallback"),
          });
        }
      }
    } catch {
      setSubmit({
        status: "error",
        kind: "network",
        message: t("foutVerbinding"),
      });
    }
  }

  const meta = useMemo(
    () => (pickup ? inferAddressMeta(pickup.label) : null),
    [pickup]
  );
  const ready = pickup && dropoff;
  // 2026-08-19 (hotfix; datum/tijd-check verscherpt na audit): datum, tijd én
  // bagage zijn verplicht vóórdat er ook maar een quote-API-call gedaan wordt
  // — geen prijs (vast of dynamisch) zonder deze drie. `departureValid` toetst
  // het VOLLEDIGE vertrekmoment (niet alleen de datum) — zelfde betekenis als
  // de server-side check in app/api/pricing/quote/route.ts.
  const departureValid = Boolean(date) && Boolean(time) && isFutureAmsterdamDeparture(date, time);
  const returnMomentReady = tab !== "retour" || (Boolean(returnDate) && Boolean(returnTime));
  const quoteReady = Boolean(ready) && departureValid && Boolean(luggage) && returnMomentReady;

  // Live richtprijs én luchthavencontext via de GEDEELDE quote-flow
  // (components/shared/useRouteQuote.ts) — dezelfde keten als de homepagehero.
  const quote = useRouteQuote(pickup, dropoff, {
    returnTrip: tab === "retour",
    passengers: persons,
    date,
    time,
    luggage,
    ready: quoteReady,
    // Retourtijd meesturen zodat het nachttarief per ritdeel wordt berekend.
    ...(tab === "retour" ? { returnDate, returnTime } : {}),
  });
  // Verzenden mag pas nadat de prijsflow een bindbare, opgeslagen quote-lock
  // oplevert, of expliciet heeft vastgesteld dat dit een offerte-op-aanvraag is.
  // Idle/loading/error mogen nooit stil via het no-lock-pad worden geboekt.
  // Handoff-prijs alleen voor exact de rit uit de hero en alleen tot de hook antwoordt.
  const pendingPrice = priceWhileVerifying({
    price: handoff?.price,
    initial: { pickup: initialPickup, dropoff: initialDropoff, date: initialDate, time: initialTime, persons: initialPersons, luggage: initialLuggage },
    current: { pickup: pickup?.label, dropoff: dropoff?.label, date, time, persons, luggage, returnTrip: tab === "retour" },
    quoteStatus: quote.status,
  });
  const quoteAllowsBooking =
    (quote.status === "ready" && quote.quoteId.length > 0) || quote.status === "onrequest";
  // Het vluchtnummerveld verschijnt zodra de engine zegt dat één zijde een
  // luchthaven is — ook bij "offerte op aanvraag". Ritten vanaf Schiphol hebben nog
  // geen vaste route, maar de aankomst moet wél gevolgd kunnen worden.
  const airport = quote.airport;
  const needsFlight = Boolean(airport?.isTransfer);
  const isArrival = airport?.direction === "arrival";
  // Een vluchtnummer is alléén VERPLICHT bij een AANKOMST (dan volgt de chauffeur de
  // landing). Bij een VERTREK (adres → Schiphol) is het veld optioneel. De retourrit
  // keert de richting om, dus daar geldt de omgekeerde plicht.
  const outboundDirection: "arrival" | "departure" | null = airport?.direction ?? null;
  const returnDirection: "arrival" | "departure" | null =
    outboundDirection === "arrival" ? "departure" : outboundDirection === "departure" ? "arrival" : null;
  const flightRequired = needsFlight && isArrival;
  const returnFlightRequired = needsFlight && tab === "retour" && returnDirection === "arrival";

  const validationInput = {
    hasPickup: Boolean(pickup),
    hasDropoff: Boolean(dropoff),
    date,
    time,
    luggage,
    rideType: tab,
    returnDate,
    returnTime,
    flightRequired,
    flightNumber,
    returnFlightRequired,
    returnFlightNumber,
    isFutureDeparture: isFutureAmsterdamDeparture,
  };

  /**
   * Volgende stap: dezelfde regels als `handleSubmit`, maar alleen die van de
   * huidige en eerdere stappen, plus de native constraints van de huidige stap.
   */
  function goNext() {
    const invalid = firstBookingFieldError(validationInput);
    if (invalid && blocksStep(invalid, step)) {
      showFieldError(invalid.field, t(invalid.messageKey));
      return;
    }
    if (!stepControlsValid(step)) return;
    if (step === "rit" && !quoteAllowsBooking) {
      if (quote.status === "loading") return;
      setSubmit({ status: "error", kind: "price", message: t("prijsFout") });
      return;
    }
    if (step === "gegevens" && formRef.current) {
      const form = new FormData(formRef.current);
      setContact({
        name: String(form.get("naam") ?? ""),
        phone: String(form.get("telefoon") ?? ""),
        email: String(form.get("email") ?? ""),
      });
    }
    clearGeneralError();
    goTo(nextStep(step));
  }

  /** Enter in een veld = volgende stap (pas in Bevestigen echt verzenden). */
  function onFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== "Enter" || e.defaultPrevented || step === "bevestigen") return;
    if (!(e.target instanceof HTMLInputElement)) return;
    e.preventDefault();
    goNext();
  }

  const bookingWhatsappHref = `https://wa.me/31634744522?text=${encodeURIComponent(t("whatsappBericht"))}`;
  const stepNumber = BOOKING_STEPS.indexOf(step) + 1;

  function panel(target: BookingStep, children: React.ReactNode) {
    return (
      <StepPanel
        key={target}
        step={target}
        active={target === step}
        animate={flow.animate}
        panelRef={(el) => {
          panelRefs.current[target] = el;
        }}
        headingRef={(el) => {
          headingRefs.current[target] = el;
        }}
      >
        {children}
      </StepPanel>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-line bg-card p-6 shadow-hero-card md:p-7">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-accent via-stone to-stone-subtle"
      />

      {submit.status === "success" && (
        <div className="mb-5">
          <div className="rounded-lg border border-green-600/30 bg-green-600/10 px-5 py-4 text-center text-sm text-green-700" role="status" aria-live="polite">
            <div className="flex items-center justify-center gap-2 font-semibold">
              <Icon name="check" size={16} />
              {t("succesRef")} {submit.bookingRef}
            </div>
            <p className="mt-1 text-green-700/90">
              {submit.quoteOnRequest ? t("succesOpAanvraag") : t("succesBetaalIntro")}
            </p>
          </div>

          {/* Betaalstap — alleen bij een vaste prijs. De prijsautoriteit blijft
              server-side: PaymentStep haalt het bedrag op via create-intent. */}
          {!submit.quoteOnRequest && submit.price !== null && submit.bookingId && pickup && dropoff && (
            <div className="mt-4">
              <PaymentStep
                ride={{
                  pickup: pickup.label,
                  dropoff: dropoff.label,
                  returnTrip: tab === "retour",
                  passengers: persons,
                  locale: locale as Locale,
                  bookingId: submit.bookingId,
                }}
              />
            </div>
          )}
        </div>
      )}

      {handoff && <HandoffRouteLine pickup={pickup} dropoff={dropoff} quote={quote} />}

      <StepProgress current={step} onGoTo={goTo} />

      <form ref={formRef} onSubmit={handleSubmit} onInput={clearFieldErrorOnInput} onKeyDown={onFormKeyDown}>
        {/* Honeypot — verborgen voor mensen, zichtbaar voor bots. Blijft leeg bij
            echte gebruikers; als het gevuld is blokkeert /api/bookings stil. */}
        <div aria-hidden="true" style={{ display: "none" }}>
          <label htmlFor="f-website">{t("honeypot")}</label>
          <input
            id="f-website"
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </div>

        <p className="mb-4 text-[12px] text-secondary">
          <span aria-hidden="true" className="text-accent">*</span> {t("verplichtUitleg")}
        </p>

        {panel(
          "route",
          <RouteStep
            tab={tab}
            onTab={setTab}
            onPickup={setPickup}
            onDropoff={setDropoff}
            initialPickup={initialPickup}
            initialDropoff={initialDropoff}
            meta={meta}
            error={fieldError}
          />
        )}
        {panel(
          "rit",
          <RideStep
            retour={tab === "retour"}
            date={date}
            onDate={setDate}
            time={time}
            onTime={setTime}
            returnDate={returnDate}
            onReturnDate={setReturnDate}
            returnTime={returnTime}
            onReturnTime={setReturnTime}
            persons={persons}
            onPersons={setPersons}
            luggage={luggage}
            onLuggage={setLuggage}
            needsFlight={needsFlight}
            isArrival={isArrival}
            flightRequired={flightRequired}
            returnFlightRequired={returnFlightRequired}
            outboundDirection={outboundDirection}
            returnDirection={returnDirection}
            flightNumber={flightNumber}
            onFlightNumber={setFlightNumber}
            returnFlightNumber={returnFlightNumber}
            onReturnFlightNumber={setReturnFlightNumber}
            error={fieldError}
          />
        )}
        {panel("gegevens", <DetailsStep error={fieldError} />)}
        {panel(
          "bevestigen",
          <ConfirmStep
            pickup={pickup?.label ?? ""}
            dropoff={dropoff?.label ?? ""}
            retour={tab === "retour"}
            date={date}
            time={time}
            returnDate={returnDate}
            returnTime={returnTime}
            persons={persons}
            luggage={luggage}
            flightNumber={needsFlight ? flightNumber : ""}
            returnFlightNumber={needsFlight ? returnFlightNumber : ""}
            contact={contact}
            onEdit={goTo}
          />
        )}

        <PricePreview quote={quote} ready={Boolean(ready)} quoteReady={quoteReady} pendingPrice={pendingPrice} handoff={Boolean(handoff)} />

        {/* Algemene melding — alleen voor fouten die niet bij één veld horen
            (prijs, verbinding, server); het icoon volgt het soort fout (F-13). Direct
            boven de actiebalk, dus in beeld bij de knop die de fout opleverde. */}
        {submit.status === "error" && (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-5 py-4 text-center text-sm text-red-700" role="alert" aria-live="assertive">
            <Icon name={generalErrorIcon(submit.kind)} size={16} className="shrink-0" />
            {submit.message}
          </div>
        )}

        {/* Actiebalk: precies één primaire actie per stap (§13e); terug is secundair. */}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          {stepNumber > 1 ? (
            <Button variant="secondary" size="lg" className="w-full sm:w-auto" onClick={() => goTo(previousStep(step))}>
              {t("terug")}
            </Button>
          ) : (
            <span aria-hidden="true" className="hidden sm:block" />
          )}
          {step === "bevestigen" ? (
            <Button
              key="submit"
              type="submit"
              size="lg"
              className="w-full sm:w-auto"
              disabled={loading || !quoteReady || !quoteAllowsBooking}
              loading={loading}
              aria-label={t("verzenden")}
            >
              {loading ? t("bezig") : t("verzenden")}
            </Button>
          ) : (
            // Eigen key: anders hergebruikt React dezelfde <button> en wordt de klik op
            // "Volgende" na de stapwissel als submit afgehandeld.
            <Button
              key="next"
              size="lg"
              className="w-full sm:w-auto"
              loading={step === "rit" && quote.status === "loading"}
              onClick={goNext}
            >
              {t("volgende")}
            </Button>
          )}
        </div>
        <p className="mt-3 text-center text-[13px] text-secondary">
          {t("ofWhatsapp")}{" "}
          <a
            href={bookingWhatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("whatsappAria")}
            className="inline-flex min-h-[44px] items-center gap-1.5 font-medium text-[#0b6b3a] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b6b3a]"
          >
            <Icon name="whatsapp" size={15} />
            +31 6 34 74 45 22
          </a>
        </p>
      </form>
    </div>
  );
}
