"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import AddressAutocomplete, {
  type AddressSuggestion,
} from "@/components/shared/AddressAutocomplete";
import { useRouteQuote } from "@/components/shared/useRouteQuote";
import Icon from "@/components/ui/Icon";
import TariffComparison from "@/components/tarieven/TariffComparison";
import { useTranslations } from "next-intl";
import { track } from "@/lib/analytics";
import {
  buildBookingHref,
  buildMailtoHref,
  buildQuoteRequestText,
  buildWhatsappHref,
  formatDuration,
  isRouteFinderDetailsComplete,
  matchSchipholRoute,
  resolveRouteFinderView,
  routeSummary,
  type StopInput,
} from "@/lib/tarieven/route-finder";

/**
 * Routezoeker — de begeleide, conversiegerichte kern van /tarieven.
 *
 * Eén prijsbron: de autoritatieve Pricing Engine via de GEDEELDE quote-hook
 * (components/shared/useRouteQuote → /api/pricing/quote → fixed_route_prices).
 * Er is GEEN client-side of tweede prijsberekening. Tussenstops en niet-vaste
 * routes kennen (in v1) geen automatisch tarief; die lopen bewust via een
 * offerteaanvraag, niet via een verzonnen bedrag. "Boek deze rit" deep-linkt
 * naar /boeken, waar de server de prijs altijd opnieuw valideert.
 */

const MAX_STOPS = 3;
const MAX_PASSENGERS = 4;

const inputCls =
  "min-h-[52px] w-full rounded-field border border-[rgba(31,39,48,0.14)] bg-field px-4 text-[15px] font-medium text-ink placeholder:font-normal placeholder:text-stone focus:border-accent focus:bg-white focus:shadow-[0_0_0_4px_rgba(40,49,59,0.10)] focus:outline-none";
const labelCls = "mb-1.5 block text-xs font-bold text-secondary";

type StopState = { id: string; selection: AddressSuggestion | null; text: string; waitRequested: boolean };

/**
 * 2026-08-19 (hotfix): dezelfde bagagecategorieën als de homepagehero en
 * /boeken (zie components/horizon/patterns.tsx / components/booking/
 * BookingSection.tsx) — bewust een eigen `LUGGAGE_CATEGORIES`-constante i.p.v.
 * gedeeld, om deze drie losstaande UI's niet onnodig aan elkaar te koppelen;
 * de WAARDEN (en dus wat de server accepteert via lib/pricing/luggage.ts)
 * blijven wél identiek.
 */
const LUGGAGE_CATEGORIES = [
  { value: "geen-bagage", labelKey: "bagageOptieGeen" },
  { value: "handbagage", labelKey: "bagageOptieHand" },
  { value: "1-2-koffers", labelKey: "bagageOptie12" },
  { value: "3-koffers", labelKey: "bagageOptie3" },
  { value: "overleg", labelKey: "bagageOptieOverleg" },
] as const;

/** Effectief bruikbaar adres: gekozen suggestie of vrije tekst (≥3 tekens). */
function effectiveAddress(
  selection: AddressSuggestion | null,
  text: string
): AddressSuggestion | null {
  if (selection) return selection;
  const trimmed = text.trim();
  return trimmed.length >= 3 ? { id: "free", label: trimmed, source: "free" } : null;
}

let stopSeq = 0;
const newStop = (): StopState => ({ id: `stop-${stopSeq++}`, selection: null, text: "", waitRequested: false });

export default function RouteFinder() {
  const t = useTranslations("routezoeker");
  const ids = useId();

  const [pickupSel, setPickupSel] = useState<AddressSuggestion | null>(null);
  const [pickupText, setPickupText] = useState("");
  const [dropoffSel, setDropoffSel] = useState<AddressSuggestion | null>(null);
  const [dropoffText, setDropoffText] = useState("");

  const [showStops, setShowStops] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [stops, setStops] = useState<StopState[]>([]);

  const [returnTrip, setReturnTrip] = useState(false);
  const [passengers, setPassengers] = useState(1);
  const [bigLuggage, setBigLuggage] = useState(1);
  const [handLuggage, setHandLuggage] = useState(1);
  // 2026-08-19 (hotfix): bewuste bagagecategorie voor de Pricing Engine (los van
  // bigLuggage/handLuggage hierboven, die uitsluitend de capaciteitsvermelding in
  // de resultaatkaart/offerteaanvraag voeden). Leeg — GEEN stille default zoals
  // "handbagage" — zodat de keuze net als in de hero/boekingsformulier altijd
  // bewust gemaakt wordt.
  const [luggage, setLuggage] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("08:00");
  const [returnDate, setReturnDate] = useState("");
  const [returnTime, setReturnTime] = useState("18:00");
  const [flightNumber, setFlightNumber] = useState("");

  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);

  // Stabiele referenties: useRouteQuote vergelijkt op objectidentiteit. Zonder
  // memo levert effectiveAddress elke render een NIEUW object, waardoor de
  // debounce in de quote-hook zichzelf blijft resetten en de fetch nooit vuurt.
  const pickup = useMemo(() => effectiveAddress(pickupSel, pickupText), [pickupSel, pickupText]);
  const dropoff = useMemo(() => effectiveAddress(dropoffSel, dropoffText), [dropoffSel, dropoffText]);

  const resolvedStops: StopInput[] = useMemo(
    () =>
      stops
        .map((s) => {
          const a = effectiveAddress(s.selection, s.text);
          return a ? { label: a.label, waitRequested: s.waitRequested } : null;
        })
        .filter((s): s is StopInput => s !== null),
    [stops]
  );
  const hasStops = resolvedStops.length > 0;

  // 2026-08-19 (hotfix): datum, tijd én een bewuste bagagecategorie zijn nu
  // verplicht vóórdat useRouteQuote() ook maar een quote-API-call doet — zelfde
  // regel, zelfde `ready`-mechanisme als de hero en /boeken (zie
  // components/shared/useRouteQuote.ts). Vóór complete invoer blijft de hook op
  // "idle" staan: geen prijs, geen offerte-op-aanvraag, geen quote-API-call.
  // Puur/apart getest — zie lib/tarieven/route-finder.test.ts.
  const detailsComplete = isRouteFinderDetailsComplete(date, time, luggage);

  // Live, autoritatieve richtprijs + luchthavencontext — exact dezelfde keten als
  // de homepagehero en /boeken. Het resultaat wordt pas getóónd na "Bereken".
  const quote = useRouteQuote(pickup, dropoff, { returnTrip, passengers, date, time, luggage, ready: detailsComplete });
  const airport = quote.airport;
  const needsFlight = Boolean(airport?.isTransfer);
  const isArrival = airport?.direction === "arrival";

  // Prijswijzigende invoer maakt een eerder resultaat verouderd: opnieuw berekenen.
  useEffect(() => {
    setSubmitted(false);
  }, [pickup?.label, dropoff?.label, returnTrip, passengers, hasStops]);

  function addStop() {
    setStops((s) => (s.length >= MAX_STOPS ? s : [...s, newStop()]));
    setShowStops(true);
    track("tussenstop_toegevoegd", { total: Math.min(stops.length + 1, MAX_STOPS) });
  }
  function removeStop(id: string) {
    setStops((s) => s.filter((x) => x.id !== id));
  }
  function updateStop(id: string, patch: Partial<StopState>) {
    setStops((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  function compute() {
    if (!startedRef.current) {
      startedRef.current = true;
      track("routezoeker_gestart");
    }
    if (!pickup || !dropoff) {
      setError(t("valAdres"));
      setSubmitted(false);
      return;
    }
    setError(null);
    setSubmitted(true);
  }

  // Resultaatstatus afleiden — puur/apart getest, zie
  // lib/tarieven/route-finder.test.ts (resolveRouteFinderView).
  const view = resolveRouteFinderView({
    submitted,
    hasPickup: Boolean(pickup),
    hasDropoff: Boolean(dropoff),
    detailsComplete,
    quoteStatus: quote.status,
    hasStops,
  });

  // Analytics op het getoonde resultaat (geen adressen — alleen kenmerken).
  const reported = useRef<string>("");
  useEffect(() => {
    if (view !== "ready" && view !== "onrequest") return;
    const key = `${view}-${quote.status}-${hasStops}`;
    if (reported.current === key) return;
    reported.current = key;
    if (view === "ready") track("prijs_gevonden", { airport: needsFlight, stops: resolvedStops.length });
    else track("prijs_op_aanvraag", { airport: needsFlight, stops: resolvedStops.length });
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [view, quote.status, hasStops, needsFlight, resolvedStops.length]);

  const tripForRequest = {
    pickup: pickup?.label ?? "",
    dropoff: dropoff?.label ?? "",
    stops: resolvedStops,
    returnTrip,
    passengers,
    bigLuggage,
    handLuggage,
    date: date || undefined,
    time: time || undefined,
    returnDate: returnTrip ? returnDate || undefined : undefined,
    returnTime: returnTrip ? returnTime || undefined : undefined,
    flightNumber: needsFlight ? flightNumber.trim() || undefined : undefined,
  };
  const requestText = buildQuoteRequestText(tripForRequest);
  const summary = routeSummary(pickup?.label ?? "", resolvedStops, dropoff?.label ?? "");
  const schipholRoute = airport?.direction === "departure" ? matchSchipholRoute(pickup?.label ?? "") : null;

  const stepNum = "min-h-11 w-full rounded-field border border-[rgba(31,39,48,0.14)] bg-field px-4 text-[15px] font-medium text-ink focus:border-accent focus:bg-white focus:shadow-[0_0_0_4px_rgba(40,49,59,0.10)] focus:outline-none";

  return (
    <div>
      {/* ── Zoekmodule: alleen ophalen + bestemming + primaire knop ── */}
      <div className="rounded-[28px] border border-line bg-card p-6 shadow-card md:p-7">
        <div className="grid gap-4 sm:grid-cols-2">
          <AddressAutocomplete
            label={t("van")}
            placeholder={t("vanPh")}
            onSelect={setPickupSel}
            onTextChange={setPickupText}
          />
          <AddressAutocomplete
            label={t("naar")}
            placeholder={t("naarPh")}
            onSelect={setDropoffSel}
            onTextChange={setDropoffText}
          />
          {/* 2026-08-19 (hotfix): direct zichtbaar, niet achter "+ Datum, tijd &
              bagage" verstopt — bewust dezelfde toegankelijkheid als Van/Naar
              hierboven, zodat de vereiste bewuste bagagekeuze niet per ongeluk
              overgeslagen wordt. */}
          <div className="sm:col-span-2 sm:max-w-xs">
            <label htmlFor={`${ids}-luggage-primary`} className={labelCls}>{t("bagageKopLabel")}</label>
            <select
              id={`${ids}-luggage-primary`}
              value={luggage}
              required
              onChange={(e) => setLuggage(e.target.value)}
              className={inputCls}
            >
              <option value="" disabled>{t("bagageKiesPlaceholder")}</option>
              {LUGGAGE_CATEGORIES.map((l) => (
                <option key={l.value} value={l.value}>{t(l.labelKey)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Tussenstops — subtiel uitklapbaar */}
        {showStops && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-secondary">
              {t("tussenstopsKop")}
            </p>
            <ul className="mt-3 space-y-3">
              {stops.map((s, i) => (
                <li key={s.id} className="rounded-field border border-line bg-fog p-3">
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <AddressAutocomplete
                        label={t("tussenstopNr", { nr: i + 1 })}
                        placeholder={t("tussenstopPh")}
                        onSelect={(sel) => updateStop(s.id, { selection: sel })}
                        onTextChange={(text) => updateStop(s.id, { text })}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeStop(s.id)}
                      className="mb-[26px] flex h-11 w-11 shrink-0 items-center justify-center rounded-field border border-line bg-card text-secondary transition-colors hover:text-ink"
                      aria-label={t("tussenstopVerwijder", { nr: i + 1 })}
                    >
                      <Icon name="x" size={16} />
                    </button>
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-[13px] text-secondary">
                    <input
                      type="checkbox"
                      checked={s.waitRequested}
                      onChange={(e) => updateStop(s.id, { waitRequested: e.target.checked })}
                      className="h-4 w-4 accent-accent"
                    />
                    {t("tussenstopWacht")}
                  </label>
                </li>
              ))}
            </ul>
            {stops.length < MAX_STOPS && (
              <button
                type="button"
                onClick={addStop}
                className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink hz-guide-line"
              >
                <span aria-hidden="true">＋</span> {t("nogTussenstop")}
              </button>
            )}
            <p className="mt-3 text-[12px] text-secondary">{t("tussenstopsPrijs")}</p>
          </div>
        )}

        {/* Progressieve ritgegevens */}
        {showDetails && (
          <div className="mt-4 border-t border-line pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`${ids}-date`} className={labelCls}>{t("datum")}</label>
                <input id={`${ids}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor={`${ids}-time`} className={labelCls}>{t("tijd")}</label>
                <input id={`${ids}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
              </div>

              <fieldset className="sm:col-span-2">
                <legend className={labelCls}>{t("ritType")}</legend>
                <div className="flex gap-2" role="radiogroup" aria-label={t("ritType")}>
                  {([["enkel", false], ["retour", true]] as const).map(([key, val]) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={returnTrip === val}
                      onClick={() => setReturnTrip(val)}
                      className={`min-h-11 flex-1 rounded-field border px-4 text-sm font-medium transition-colors ${
                        returnTrip === val
                          ? "border-accent bg-accent text-white"
                          : "border-line bg-fog text-secondary hover:text-ink"
                      }`}
                    >
                      {t(key === "enkel" ? "enkeleReis" : "retour")}
                    </button>
                  ))}
                </div>
              </fieldset>

              {returnTrip && (
                <>
                  <div>
                    <label htmlFor={`${ids}-rdate`} className={labelCls}>{t("retourDatum")}</label>
                    <input id={`${ids}-rdate`} type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor={`${ids}-rtime`} className={labelCls}>{t("retourTijd")}</label>
                    <input id={`${ids}-rtime`} type="time" value={returnTime} onChange={(e) => setReturnTime(e.target.value)} className={inputCls} />
                  </div>
                </>
              )}

              <div>
                <label htmlFor={`${ids}-pax`} className={labelCls}>{t("passagiers")}</label>
                <input id={`${ids}-pax`} type="number" min={1} max={MAX_PASSENGERS} value={passengers}
                  onChange={(e) => setPassengers(Math.min(MAX_PASSENGERS, Math.max(1, Number(e.target.value) || 1)))} className={stepNum} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor={`${ids}-big`} className={labelCls}>{t("groteKoffers")}</label>
                  <input id={`${ids}-big`} type="number" min={0} max={4} value={bigLuggage}
                    onChange={(e) => setBigLuggage(Math.min(4, Math.max(0, Number(e.target.value) || 0)))} className={stepNum} />
                </div>
                <div>
                  <label htmlFor={`${ids}-hand`} className={labelCls}>{t("handbagage")}</label>
                  <input id={`${ids}-hand`} type="number" min={0} max={4} value={handLuggage}
                    onChange={(e) => setHandLuggage(Math.min(4, Math.max(0, Number(e.target.value) || 0)))} className={stepNum} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Vluchtnummer — alleen bij een luchthavenrit (engine bevestigt dit) */}
        {needsFlight && (
          <div className="mt-4 border-t border-line pt-4">
            <label htmlFor={`${ids}-flight`} className={labelCls}>
              {isArrival ? t("vluchtAankomend") : t("vluchtVertrekkend")}
            </label>
            <input
              id={`${ids}-flight`}
              value={flightNumber}
              onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
              placeholder="KL1234"
              autoComplete="off"
              spellCheck={false}
              maxLength={8}
              aria-describedby={`${ids}-flight-help`}
              className={inputCls}
            />
            <p id={`${ids}-flight-help`} className="mt-1.5 flex items-center gap-1.5 text-[12px] text-secondary">
              <Icon name="plane" size={13} className="shrink-0 text-accent" />
              {t("vluchtHelp")}
            </p>
          </div>
        )}

        {/* Primaire actie */}
        <button
          type="button"
          onClick={compute}
          className="mt-5 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-md bg-accent px-8 font-display text-base font-medium text-white shadow-cta transition-all hover:-translate-y-0.5 hover:bg-accent-hover"
        >
          {t("bereken")} <span aria-hidden="true">→</span>
        </button>

        {error && (
          <p className="mt-3 flex items-center justify-center gap-2 text-sm text-red-600" role="alert" aria-live="assertive">
            <Icon name="info-circle" size={15} /> {error}
          </p>
        )}

        {/* Compacte progressieve acties */}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          <button
            type="button"
            onClick={() => { setShowStops(true); if (stops.length === 0) addStop(); }}
            aria-expanded={showStops}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-secondary transition-colors hover:text-ink"
          >
            <span aria-hidden="true">＋</span> {t("actieTussenstop")}
          </button>
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-secondary transition-colors hover:text-ink"
          >
            <span aria-hidden="true">＋</span> {t("actieDetails")}
          </button>
        </div>
      </div>

      {/* Vertrouwensregel onder de zoekmodule */}
      <p className="mt-4 text-center text-[13px] text-secondary">{t("trust")}</p>

      {/* ── Resultaat ── */}
      <div ref={resultRef} aria-live="polite" className="mt-8 scroll-mt-24">
        {view === "incomplete" && (
          <div className="rounded-[28px] border border-line bg-card p-6 text-center text-sm text-secondary shadow-card">
            {t("incompleteMelding")}
          </div>
        )}

        {view === "loading" && (
          <div className="rounded-[28px] border border-line bg-card p-6 text-center text-sm text-secondary shadow-card">
            {t("berekenen")}
          </div>
        )}

        {view === "ready" && quote.status === "ready" && (
          <ResultCard
            summary={summary}
            price={quote.price}
            returnApplied={quote.returnApplied}
            distanceKm={quote.distanceKm}
            durationMin={quote.estimatedDurationMin}
            passengers={passengers}
            stopsCount={resolvedStops.length}
            needsFlight={needsFlight}
            isArrival={isArrival}
            bookingHref={buildBookingHref({
              pickup: pickup!.label,
              dropoff: dropoff!.label,
              returnTrip,
              passengers,
              date: date || undefined,
              time: time || undefined,
              returnDate: returnDate || undefined,
              returnTime: returnTime || undefined,
            })}
            schipholRoute={schipholRoute}
            onBook={() => track("boeking_geklikt", { airport: needsFlight, stops: resolvedStops.length })}
          />
        )}

        {view === "onrequest" && (
          <OnRequestCard
            summary={summary}
            whatsappHref={buildWhatsappHref(requestText)}
            mailtoHref={buildMailtoHref(t("mailOnderwerp"), requestText)}
            needsFlight={needsFlight}
            hasStops={hasStops}
          />
        )}
      </div>
    </div>
  );
}

/* ── Prijsresultaat: premium ritkaart ── */
function ResultCard({
  summary, price, returnApplied, distanceKm, durationMin, passengers, stopsCount,
  needsFlight, isArrival, bookingHref, schipholRoute, onBook,
}: {
  summary: string;
  price: number;
  returnApplied: boolean;
  distanceKm: number;
  durationMin: number;
  passengers: number;
  stopsCount: number;
  needsFlight: boolean;
  isArrival: boolean;
  bookingHref: string;
  schipholRoute: { slug: string; naam: string } | null;
  onBook: () => void;
}) {
  const t = useTranslations("routezoeker");
  const facts: { label: string; value: string }[] = [
    { label: t("factReistijd"), value: formatDuration(durationMin) || "—" },
    { label: t("factAfstand"), value: distanceKm > 0 ? `${distanceKm} km` : "—" },
    { label: t("factVoertuig"), value: t("voertuigKlasse") },
    { label: t("factPassagiers"), value: t("passagiersMax", { max: 4, gekozen: passengers }) },
    { label: t("factBagage"), value: t("bagageCapaciteit") },
    { label: t("factWachttijd"), value: isArrival ? t("wachttijdLucht") : t("wachttijdStandaard") },
  ];
  if (stopsCount > 0) facts.push({ label: t("factTussenstops"), value: String(stopsCount) });

  const proofs = [
    "bewijsVaste", "bewijsChauffeur", "bewijsVoertuig", "bewijsBagage",
    ...(needsFlight ? (["bewijsVlucht"] as const) : []), "bewijsGeenVerrassing",
  ] as const;

  return (
    <div className="hz-reveal hz-in overflow-hidden rounded-[28px] border border-line-strong bg-card shadow-card-lg">
      <div className="border-b border-line bg-fog px-6 py-5 md:px-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">{t("kaartKop")}</p>
        <p className="mt-2 font-display text-lg font-semibold leading-snug text-ink md:text-xl">{summary}</p>
      </div>
      <div className="px-6 py-6 md:px-8">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-display text-[40px] font-extrabold leading-none text-ink [font-variant-numeric:tabular-nums] md:text-[52px]">
            € {price}
          </span>
          <span className="text-sm text-secondary">
            {returnApplied ? t("vastRetour") : t("vastEnkel")} · {t("inclBtw")} · {t("geenSurge")}
          </span>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          {facts.map((f) => (
            <div key={f.label} className="border-t border-line pt-3">
              <dt className="text-[10px] uppercase tracking-[0.12em] text-stone">{f.label}</dt>
              <dd className="mt-0.5 text-sm font-semibold text-ink [font-variant-numeric:tabular-nums]">{f.value}</dd>
            </div>
          ))}
        </dl>

        <TariffComparison distanceKm={distanceKm} durationMin={durationMin} price={price} />

        <ul className="mt-6 grid gap-2 sm:grid-cols-2">
          {proofs.map((k) => (
            <li key={k} className="flex items-start gap-2 text-[13px] text-secondary">
              <Icon name="circle-check" size={15} className="mt-0.5 shrink-0 text-accent" />
              {t(k)}
            </li>
          ))}
        </ul>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href={bookingHref}
            onClick={onBook}
            className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-md bg-accent px-8 font-display text-base font-medium text-white shadow-cta transition-all hover:-translate-y-0.5 hover:bg-accent-hover"
          >
            <Icon name="calendar-check" size={18} /> {t("boekDezeRit")}
          </Link>
          {schipholRoute && (
            <Link
              href={`/${schipholRoute.slug}`}
              className="inline-flex min-h-[52px] items-center justify-center gap-1.5 rounded-md border border-line-strong bg-white px-6 font-display text-sm font-medium text-ink transition-colors hover:bg-fog"
            >
              {t("bekijkRoute", { stad: schipholRoute.naam })} <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Geen automatisch tarief: bruikbare aanvraagflow ── */
function OnRequestCard({
  summary, whatsappHref, mailtoHref, needsFlight, hasStops,
}: {
  summary: string;
  whatsappHref: string;
  mailtoHref: string;
  needsFlight: boolean;
  hasStops: boolean;
}) {
  const t = useTranslations("routezoeker");
  return (
    <div className="hz-reveal hz-in rounded-[28px] border border-line-strong bg-card p-6 shadow-card md:p-8">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">{t("kaartKop")}</p>
      <p className="mt-2 font-display text-lg font-semibold leading-snug text-ink">{summary}</p>
      <p className="mt-4 max-w-xl text-secondary">
        {t("opAanvraagUitleg")}
        {hasStops ? ` ${t("opAanvraagStops")}` : ""}
        {needsFlight ? ` ${t("opAanvraagVlucht")}` : ""}
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-md bg-accent px-8 font-display text-base font-medium text-white shadow-cta transition-all hover:-translate-y-0.5 hover:bg-accent-hover"
        >
          <Icon name="whatsapp" size={18} /> {t("vraagWhatsapp")}
        </a>
        <a
          href={mailtoHref}
          className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-md border border-line-strong bg-white px-8 font-display text-base font-medium text-ink transition-colors hover:bg-fog"
        >
          <Icon name="message-check" size={18} /> {t("vraagEmail")}
        </a>
      </div>
      <p className="mt-4 text-center text-[13px] text-secondary">
        {t("ofBel")}{" "}
        <a href="tel:+31634744522" className="text-accent hover:underline">+31 6 34 74 45 22</a>
      </p>
    </div>
  );
}
