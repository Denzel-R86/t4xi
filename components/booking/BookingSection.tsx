"use client";

import { useEffect, useMemo, useState } from "react";
import AddressAutocomplete, {
  type AddressSuggestion,
} from "@/components/shared/AddressAutocomplete";
import { useRouteQuote } from "@/components/shared/useRouteQuote";
import PaymentStep from "@/components/booking/PaymentStep";
import FlightCard from "@/components/booking/FlightCard";
import Icon from "@/components/ui/Icon";
import { inferAddressMeta, type RitType } from "@/lib/booking-meta";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";

type BookableRideType = Extract<RitType, "enkel" | "retour">;

const TABS: { key: BookableRideType; labelKey: "tabEnkel" | "tabRetour" }[] = [
  { key: "enkel", labelKey: "tabEnkel" },
  { key: "retour", labelKey: "tabRetour" },
];

const LUGGAGE = [
  { value: "handbagage", labelKey: "bagageHand" },
  { value: "1-2-koffers", labelKey: "bagage12" },
  { value: "3-koffers", labelKey: "bagage3" },
  { value: "overleg", labelKey: "bagageOverleg" },
] as const;

const inputCls =
  "min-h-[52px] w-full rounded-field border border-[rgba(31,39,48,0.14)] bg-field px-4 text-[15px] font-medium text-ink placeholder:font-normal placeholder:text-stone focus:border-accent focus:bg-white focus:shadow-[0_0_0_4px_rgba(40,49,59,0.10)] focus:outline-none";
const labelCls = "mb-1.5 block text-xs font-bold text-secondary";

/**
 * Volledig boekingsformulier uit het v14-bronbestand (#boeken):
 * rit-type tabs, adressen met PDOK-autocomplete, datum/tijd/passagiers/
 * bagage, adresdetectie-pillen, live richtprijs en contactvelden.
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
  const [luggage, setLuggage] = useState("handbagage");
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
    | { status: "error"; message: string };
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });
  const loading = submit.status === "loading";

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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return; // geen dubbele submit
    if (!pickup || !dropoff) {
      setSubmit({ status: "error", message: t("valAdres") });
      return;
    }
    if (flightRequired && flightNumber.trim() === "") {
      setSubmit({ status: "error", message: t("valVluchtAankomst") });
      return;
    }
    if (tab === "retour" && (!returnDate || !returnTime)) {
      setSubmit({ status: "error", message: t("valRetourMoment") });
      return;
    }
    if (returnFlightRequired && returnFlightNumber.trim() === "") {
      setSubmit({ status: "error", message: t("valVluchtRetourAankomst") });
      return;
    }

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
        setSubmit({
          status: "error",
          message: data.message ?? t("foutFallback"),
        });
      }
    } catch {
      setSubmit({
        status: "error",
        message: t("foutVerbinding"),
      });
    }
  }

  const meta = useMemo(
    () => (pickup ? inferAddressMeta(pickup.label) : null),
    [pickup]
  );
  const ready = pickup && dropoff;

  // Live richtprijs én luchthavencontext via de GEDEELDE quote-flow
  // (components/shared/useRouteQuote.ts) — dezelfde keten als de homepagehero.
  const quote = useRouteQuote(pickup, dropoff, {
    returnTrip: tab === "retour",
    passengers: persons,
    date,
    time,
    // Retourtijd meesturen zodat het nachttarief per ritdeel wordt berekend.
    ...(tab === "retour" ? { returnDate, returnTime } : {}),
  });
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

  const priceNote =
    quote.status === "idle"
      ? t("prijsIdle")
      : quote.status === "loading"
        ? t("prijsLaden")
        : quote.status === "ready"
          ? t(quote.returnApplied ? "prijsRetour" : "prijsVast")
          : quote.status === "onrequest"
            ? t("prijsOpAanvraag")
            : t("prijsFout");
  const priceAmount =
    quote.status === "ready"
      ? quote.amount
      : quote.status === "loading"
        ? "…"
        : quote.status === "onrequest"
          ? t("opAanvraag")
          : "—";
  const priceBig = quote.status === "ready" || quote.status === "idle" || quote.status === "error";
  const bookingWhatsappHref = `https://wa.me/31634744522?text=${encodeURIComponent(t("whatsappBericht"))}`;

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

      {submit.status === "error" && (
        <div className="mb-5 flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-5 py-4 text-center text-sm text-red-600" role="alert" aria-live="assertive">
          <Icon name="phone" size={16} />
          {submit.message}
        </div>
      )}

      {/* Ritsoort: luchthaven is geen los type maar wordt uit de adressen herkend.
          Dagtochten hebben een eigen aanvraagflow en horen niet in een transferformulier. */}
      <fieldset className="mb-5">
        <legend className="sr-only">{t("ritType")}</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("ritType")}>
          {TABS.map((x) => (
            <button
              key={x.key}
              type="button"
              role="radio"
              aria-checked={tab === x.key}
              onClick={() => setTab(x.key)}
              className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === x.key
                  ? "border-accent bg-accent text-white"
                  : "border-line bg-[#F4F1EB] text-[#4E565E] hover:text-ink"
              }`}
            >
              {t(x.labelKey)}
            </button>
          ))}
        </div>
        <p className="mt-2.5 text-xs leading-relaxed text-secondary">
          {t("airportHint")} {" "}
          <Link href="/dagtochten#aanvragen" className="font-medium text-accent underline underline-offset-2">
            {t("dayTripLink")}
          </Link>
        </p>
      </fieldset>

      <form onSubmit={handleSubmit}>
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 grid gap-1 sm:grid-cols-2 sm:gap-4">
            <AddressAutocomplete label={t("van")} placeholder={t("vertrekadresPh")} onSelect={setPickup} initialValue={initialPickup} />
            <AddressAutocomplete label={t("naar")} placeholder={t("bestemmingPh")} onSelect={setDropoff} initialValue={initialDropoff} />
          </div>
          <div>
            <label htmlFor="f-date" className={labelCls}>{t("datum")}</label>
            <input id="f-date" name="datum" type="date" required className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor="f-time" className={labelCls}>{t("tijd")}</label>
            <input id="f-time" name="tijd" type="time" required className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          {tab === "retour" && (
            <>
              <div>
                <label htmlFor="f-return-date" className={labelCls}>{t("retourDatum")}</label>
                <input
                  id="f-return-date"
                  type="date"
                  required
                  className={inputCls}
                  value={returnDate}
                  min={date || undefined}
                  onChange={(e) => setReturnDate(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="f-return-time" className={labelCls}>{t("retourTijd")}</label>
                <input
                  id="f-return-time"
                  type="time"
                  required
                  className={inputCls}
                  value={returnTime}
                  onChange={(e) => setReturnTime(e.target.value)}
                />
              </div>
            </>
          )}
          <div>
            <label htmlFor="f-persons" className={labelCls}>{t("passagiers")}</label>
            <input
              id="f-persons"
              type="number"
              min={1}
              max={4}
              value={persons}
              onChange={(e) => setPersons(Number(e.target.value) || 1)}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="f-luggage" className={labelCls}>{t("bagage")}</label>
            <select
              id="f-luggage"
              value={luggage}
              onChange={(e) => setLuggage(e.target.value)}
              className={inputCls}
            >
              {LUGGAGE.map((l) => (
                <option key={l.value} value={l.value}>{t(l.labelKey)}</option>
              ))}
            </select>
          </div>

          {/*
            Vluchtnummer — verschijnt uitsluitend bij luchthavenritten, zodra de
            prijsengine heeft bevestigd dat herkomst of bestemming een luchthaven is.
            Zonder dit nummer kan T4XI de belofte "wij volgen uw vluchtstatus" niet
            waarmaken, daarom is het veld daar verplicht.
          */}
          {needsFlight && (
            <div className="sm:col-span-2">
              <label htmlFor="f-flight" className={labelCls}>
                {isArrival ? t("vluchtAankomend") : t("vluchtVertrekkend")}{" "}
                <span className={flightRequired ? "text-accent" : "text-stone"}>
                  {flightRequired ? t("verplicht") : t("optioneel")}
                </span>
              </label>
              <input
                id="f-flight"
                name="vluchtnummer"
                value={flightNumber}
                onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
                placeholder="KL1234"
                autoComplete="off"
                spellCheck={false}
                maxLength={8}
                required={flightRequired}
                aria-describedby="f-flight-help"
                className={inputCls}
              />
              <p id="f-flight-help" className="mt-1.5 text-[12px] text-secondary">
                {isArrival ? t("vluchtHelpAankomst") : t("vluchtHelpVertrek")}
              </p>

              {/* Live vluchtkaart (7.9A): debounced check op /api/flights/* zodra
                  een vluchtnummer is ingevoerd. Richting meegeven zodat het JUISTE
                  ritdeel (vertrek vs aankomst) van hetzelfde vluchtnummer wordt getoond. */}
              <FlightCard flightNumber={flightNumber} direction={outboundDirection} />

              {tab === "retour" && (
                <div className="mt-4 border-t border-line pt-4">
                  <label htmlFor="f-return-flight" className={labelCls}>
                    {t("retourVlucht")} — {isArrival ? t("vluchtVertrekkend") : t("vluchtAankomend")}{" "}
                    <span className={returnFlightRequired ? "text-accent" : "text-stone"}>
                      {returnFlightRequired ? t("verplicht") : t("optioneel")}
                    </span>
                  </label>
                  <input
                    id="f-return-flight"
                    value={returnFlightNumber}
                    onChange={(e) => setReturnFlightNumber(e.target.value.toUpperCase())}
                    placeholder="KL1234"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={8}
                    required={returnFlightRequired}
                    className={inputCls}
                  />
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

        {/* Adresdetectie */}
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3" aria-label={t("adresDetectie")}>
          {[
            { key: t("postcode"), value: meta?.postcode },
            { key: t("stad"), value: meta?.city },
            { key: t("stadsdeel"), value: meta?.district },
          ].map((pill) => (
            <div key={pill.key} className="rounded-xl border border-line bg-fog px-3 py-2.5">
              <small className="block text-[10px] uppercase tracking-[0.12em] text-stone">{pill.key}</small>
              <b className={`block truncate text-[13px] ${pill.value && pill.value !== "—" ? "text-accent" : "font-semibold text-stone"}`}>
                {pill.value ?? "—"}
              </b>
            </div>
          ))}
        </div>

        {/* Prijsvoorbeeld — bron: autoritatieve Pricing Engine (/api/pricing/quote) */}
        <div
          className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-[rgba(31,39,48,0.12)] bg-[linear-gradient(135deg,#FFFFFF,#F3F0EA)] p-4"
          role="region"
          aria-live="polite"
          aria-busy={quote.status === "loading"}
          aria-label={t("geschattePrijs")}
        >
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-stone">{t("geschattePrijs")}</div>
            <div className="mt-0.5 text-xs text-secondary">{priceNote}</div>
          </div>
          <div className={`shrink-0 font-display font-bold text-accent ${priceBig ? "text-[28px]" : "text-base"}`}>
            {priceAmount}
          </div>
        </div>

        {ready && (
          <p className="mt-3 rounded-xl border border-line bg-fog px-4 py-3 text-xs leading-relaxed text-secondary" aria-live="polite">
            <strong className="text-ink">{t("inclusiefKop")}</strong> {t("inclusiefTekst")}
          </p>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="f-name" className={labelCls}>{t("naam")}</label>
            <input id="f-name" name="naam" placeholder={t("naamPh")} autoComplete="name" required className={inputCls} />
          </div>
          <div>
            <label htmlFor="f-phone" className={labelCls}>{t("telefoon")} <span aria-hidden="true" className="text-accent">*</span></label>
            <input id="f-phone" name="telefoon" type="tel" placeholder="+31 6 ..." autoComplete="tel" required className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="f-email" className={labelCls}>{t("email")} <span aria-hidden="true" className="text-accent">*</span></label>
            <input id="f-email" name="email" type="email" placeholder={t("emailPh")} autoComplete="email" required className={inputCls} />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-md bg-accent px-8 font-display text-base font-medium text-white shadow-cta transition-all hover:-translate-y-0.5 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
          aria-label={t("verzenden")}
        >
          <Icon name="calendar-check" size={18} />
          {loading ? t("bezig") : t("verzenden")}
        </button>
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
