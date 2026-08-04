"use client";

import { useEffect, useMemo, useState } from "react";
import AddressAutocomplete, {
  type AddressSuggestion,
} from "@/components/shared/AddressAutocomplete";
import { useRouteQuote } from "@/components/shared/useRouteQuote";
import PaymentStep from "@/components/booking/PaymentStep";
import Icon from "@/components/ui/Icon";
import { inferAddressMeta, type RitType } from "@/lib/booking-meta";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";

const TABS: { key: RitType; labelKey: "tabEnkel" | "tabRetour" | "tabLuchthaven" | "tabDagtocht" }[] = [
  { key: "enkel", labelKey: "tabEnkel" },
  { key: "retour", labelKey: "tabRetour" },
  { key: "luchthaven", labelKey: "tabLuchthaven" },
  { key: "dagtocht", labelKey: "tabDagtocht" },
];

const VEHICLES = [
  "Lynk & Co 01 — Amsterdam",
  "Tesla Model Y — Amsterdam",
  "Tesla Model Y — Rotterdam",
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
 * rit-type tabs, adressen met PDOK-autocomplete, datum/tijd/voertuig/
 * passagiers/bagage, adresdetectie-pillen, live richtprijs en contactvelden.
 */
export default function BookingSection({
  initialPickup,
  initialDropoff,
  initialReturn,
  initialPersons,
}: {
  /** Deep-link (?pickup=…): veld vooraf gevuld, prijs rekent direct. */
  initialPickup?: string;
  /** Deep-link (?dropoff=…). */
  initialDropoff?: string;
  /** Deep-link (?retour=1): start op de retour-tab. */
  initialReturn?: boolean;
  /** Deep-link (?persons=…): aantal passagiers vooraf ingevuld (1–4). */
  initialPersons?: number;
} = {}) {
  const t = useTranslations("booking");
  const locale = useLocale();
  const [tab, setTab] = useState<RitType>(initialReturn ? "retour" : "enkel");
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
  const [vehicle, setVehicle] = useState(VEHICLES[0]);

  type SubmitState =
    | { status: "idle" | "loading" }
    | { status: "success"; bookingRef: string; bookingId: string | null; quoteOnRequest: boolean; price: number | null }
    | { status: "error"; message: string };
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });
  const loading = submit.status === "loading";

  // Anti-stale betaling: zodra prijsbepalende ritdata wijzigt ná een geslaagde
  // boeking, is de aangemaakte boeking (bookingRef) én de betaalstap verouderd.
  // We resetten dan naar "idle" zodat de klant opnieuw boekt en een verse
  // PaymentIntent op de nieuwe gegevens ontstaat — nooit stilzwijgend het oude
  // bedrag/bookingRef hergebruiken.
  useEffect(() => {
    setSubmit((s) => (s.status === "success" ? { status: "idle" } : s));
    // Alleen de velden die de serverprijs bepalen (create-intent herberekent
    // op pickup/dropoff/returnTrip/passengers).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup?.label, dropoff?.label, tab, persons]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return; // geen dubbele submit
    if (!pickup || !dropoff) {
      setSubmit({ status: "error", message: t("valAdres") });
      return;
    }
    if (needsFlight && flightNumber.trim() === "") {
      setSubmit({
        status: "error",
        message: isArrival ? t("valVluchtAankomst") : t("valVluchtVertrek"),
      });
      return;
    }

    const form = new FormData(e.currentTarget);
    const payload = {
      rideType: tab,
      pickup: pickup.label,
      dropoff: dropoff.label,
      date: String(form.get("datum") ?? ""),
      time: String(form.get("tijd") ?? ""),
      vehicle,
      persons,
      luggage,
      flightNumber: needsFlight ? flightNumber.trim() : "",
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
  const quote = useRouteQuote(pickup, dropoff, { returnTrip: tab === "retour", passengers: persons });
  const [flightNumber, setFlightNumber] = useState("");

  // Het vluchtnummerveld verschijnt zodra de engine zegt dat één zijde een
  // luchthaven is — ook bij "offerte op aanvraag". Ritten vanaf Schiphol hebben nog
  // geen vaste route, maar de aankomst moet wél gevolgd kunnen worden.
  const airport = quote.airport;
  const needsFlight = Boolean(airport?.isTransfer);
  const isArrival = airport?.direction === "arrival";

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

      {/* Rit-type tabs */}
      <div className="mb-5 flex flex-wrap gap-2" role="tablist">
        {TABS.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={tab === x.key}
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
            <input id="f-date" name="datum" type="date" required className={inputCls} />
          </div>
          <div>
            <label htmlFor="f-time" className={labelCls}>{t("tijd")}</label>
            <input id="f-time" name="tijd" type="time" defaultValue="08:00" className={inputCls} />
          </div>
          <div>
            <label htmlFor="f-vehicle" className={labelCls}>{t("voertuig")}</label>
            <select
              id="f-vehicle"
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
              className={inputCls}
            >
              {VEHICLES.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
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
          <div className="sm:col-span-2">
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
                <span className="text-accent">{t("verplicht")}</span>
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
                required
                aria-describedby="f-flight-help"
                className={inputCls}
              />
              <p id="f-flight-help" className="mt-1.5 text-[12px] text-secondary">
                {isArrival ? t("vluchtHelpAankomst") : t("vluchtHelpVertrek")}
              </p>

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
            <label htmlFor="f-phone" className={labelCls}>{t("telefoon")}</label>
            <input id="f-phone" name="telefoon" type="tel" placeholder="+31 6 ..." autoComplete="tel" className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="f-email" className={labelCls}>{t("email")}</label>
            <input id="f-email" name="email" type="email" placeholder={t("emailPh")} autoComplete="email" className={inputCls} />
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
          {t("ofBel")}{" "}
          <a href="tel:+31634744522" className="text-accent hover:underline">
            +31 6 34 74 45 22
          </a>
        </p>
      </form>
    </div>
  );
}
