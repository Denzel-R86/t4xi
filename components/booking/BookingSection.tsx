"use client";

import { useEffect, useMemo, useState } from "react";
import AddressAutocomplete, {
  type AddressSuggestion,
} from "@/components/booking/AddressAutocomplete";
import Icon from "@/components/ui/Icon";
import { inferAddressMeta, type RitType } from "@/lib/booking-meta";

const TABS: { key: RitType; label: string }[] = [
  { key: "enkel", label: "Enkele rit" },
  { key: "retour", label: "Retour" },
  { key: "luchthaven", label: "Luchthaven" },
  { key: "dagtocht", label: "Dagtocht" },
];

const VEHICLES = [
  "Lynk & Co 01 — Amsterdam",
  "Tesla Model Y — Amsterdam",
  "Tesla Model Y — Rotterdam",
];

const LUGGAGE = [
  { value: "handbagage", label: "Handbagage" },
  { value: "1-2-koffers", label: "1–2 koffers" },
  { value: "3-koffers", label: "3 koffers — alleen bij max. 3 passagiers" },
  { value: "overleg", label: "Meer bagage / grotere koffers — eerst afstemmen" },
];

const inputCls =
  "min-h-[52px] w-full rounded-field border border-[rgba(31,39,48,0.14)] bg-field px-4 text-[15px] font-medium text-ink placeholder:font-normal placeholder:text-stone focus:border-accent focus:bg-white focus:shadow-[0_0_0_4px_rgba(40,49,59,0.10)] focus:outline-none";
const labelCls = "mb-1.5 block text-xs font-bold text-secondary";

/**
 * Volledig boekingsformulier uit het v14-bronbestand (#boeken):
 * rit-type tabs, adressen met PDOK-autocomplete, datum/tijd/voertuig/
 * passagiers/bagage, adresdetectie-pillen, live richtprijs en contactvelden.
 */
export default function BookingSection() {
  const [tab, setTab] = useState<RitType>("enkel");
  const [pickup, setPickup] = useState<AddressSuggestion | null>(null);
  const [dropoff, setDropoff] = useState<AddressSuggestion | null>(null);
  const [persons, setPersons] = useState(1);
  const [luggage, setLuggage] = useState("handbagage");
  const [vehicle, setVehicle] = useState(VEHICLES[0]);

  type SubmitState =
    | { status: "idle" | "loading" }
    | { status: "success"; bookingRef: string; quoteOnRequest: boolean; price: number | null }
    | { status: "error"; message: string };
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });
  const loading = submit.status === "loading";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return; // geen dubbele submit
    if (!pickup || !dropoff) {
      setSubmit({ status: "error", message: "Vul een ophaaladres en bestemming in." });
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
      customerName: String(form.get("naam") ?? ""),
      customerPhone: String(form.get("telefoon") ?? ""),
      customerEmail: String(form.get("email") ?? ""),
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
          quoteOnRequest: Boolean(data.quoteOnRequest),
          price: typeof data.price === "number" ? data.price : null,
        });
      } else {
        setSubmit({
          status: "error",
          message: data.message ?? "Er ging iets mis. Probeer het opnieuw of bel ons.",
        });
      }
    } catch {
      setSubmit({
        status: "error",
        message: "Geen verbinding. Controleer je internet of bel ons.",
      });
    }
  }

  const meta = useMemo(
    () => (pickup ? inferAddressMeta(pickup.label) : null),
    [pickup]
  );
  const ready = pickup && dropoff;

  // Live richtprijs — UITSLUITEND uit de autoritatieve Pricing Engine
  // (/api/pricing/quote). Geen client-side prijslogica. Debounce + abort tegen
  // race-conditions bij snel typen/wisselen.
  type Quote =
    | { status: "idle" | "loading" | "onrequest" | "error" }
    | { status: "ready"; amount: string; note: string };
  const [quote, setQuote] = useState<Quote>({ status: "idle" });

  useEffect(() => {
    if (!pickup || !dropoff) {
      setQuote({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    setQuote({ status: "loading" });
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/pricing/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pickup: pickup.label,
            dropoff: dropoff.label,
            returnTrip: tab === "retour",
            passengers: persons,
          }),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.available) {
          setQuote({
            status: "ready",
            amount: `€${data.price}`,
            note: data.returnApplied ? "Retour — vaste prijs vooraf" : "Vaste prijs vooraf",
          });
        } else {
          setQuote({ status: "onrequest" });
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setQuote({ status: "error" });
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [pickup, dropoff, tab, persons]);

  const priceNote =
    quote.status === "idle"
      ? "Vul adressen in"
      : quote.status === "loading"
        ? "Prijs berekenen…"
        : quote.status === "ready"
          ? quote.note
          : quote.status === "onrequest"
            ? "Offerte op aanvraag"
            : "Prijs tijdelijk niet beschikbaar";
  const priceAmount =
    quote.status === "ready"
      ? quote.amount
      : quote.status === "loading"
        ? "…"
        : quote.status === "onrequest"
          ? "Op aanvraag"
          : "—";
  const priceBig = quote.status === "ready" || quote.status === "idle" || quote.status === "error";

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-line bg-card p-6 shadow-hero-card md:p-7">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-accent via-stone to-stone-subtle"
      />

      {submit.status === "success" && (
        <div className="mb-5 rounded-lg border border-green-600/30 bg-green-600/10 px-5 py-4 text-center text-sm text-green-700" role="status" aria-live="polite">
          <div className="flex items-center justify-center gap-2 font-semibold">
            <Icon name="check" size={16} />
            Boeking ontvangen — referentie {submit.bookingRef}
          </div>
          <p className="mt-1 text-green-700/90">
            {submit.quoteOnRequest
              ? "Deze route krijgt een offerte op aanvraag. Wij bevestigen prijs en tijd via WhatsApp of e-mail."
              : "Wij bevestigen uw rit via WhatsApp of e-mail."}
          </p>
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
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-accent bg-accent text-white"
                : "border-line bg-[#F4F1EB] text-[#4E565E] hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 grid gap-1 sm:grid-cols-2 sm:gap-4">
            <AddressAutocomplete label="Van" placeholder="Vertrekadres" onSelect={setPickup} />
            <AddressAutocomplete label="Naar" placeholder="Bestemming" onSelect={setDropoff} />
          </div>
          <div>
            <label htmlFor="f-date" className={labelCls}>Datum</label>
            <input id="f-date" name="datum" type="date" required className={inputCls} />
          </div>
          <div>
            <label htmlFor="f-time" className={labelCls}>Tijd</label>
            <input id="f-time" name="tijd" type="time" defaultValue="08:00" className={inputCls} />
          </div>
          <div>
            <label htmlFor="f-vehicle" className={labelCls}>Voertuig</label>
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
            <label htmlFor="f-persons" className={labelCls}>Passagiers</label>
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
            <label htmlFor="f-luggage" className={labelCls}>Bagage</label>
            <select
              id="f-luggage"
              value={luggage}
              onChange={(e) => setLuggage(e.target.value)}
              className={inputCls}
            >
              {LUGGAGE.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Adresdetectie */}
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3" aria-label="Automatisch herkende adresgegevens">
          {[
            { key: "Postcode", value: meta?.postcode },
            { key: "Stad", value: meta?.city },
            { key: "Stadsdeel", value: meta?.district },
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
          aria-label="Geschatte prijs"
        >
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-stone">Geschatte prijs</div>
            <div className="mt-0.5 text-xs text-secondary">{priceNote}</div>
          </div>
          <div className={`shrink-0 font-display font-bold text-accent ${priceBig ? "text-[28px]" : "text-base"}`}>
            {priceAmount}
          </div>
        </div>

        {ready && (
          <p className="mt-3 rounded-xl border border-line bg-fog px-4 py-3 text-xs leading-relaxed text-secondary" aria-live="polite">
            <strong className="text-ink">Inclusief:</strong> vaste prijs, maximaal 4
            passagiers exclusief chauffeur. Bij 4 passagiers adviseren wij 2 grote
            koffers + 2 handbagage.
          </p>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="f-name" className={labelCls}>Naam</label>
            <input id="f-name" name="naam" placeholder="Volledige naam" autoComplete="name" required className={inputCls} />
          </div>
          <div>
            <label htmlFor="f-phone" className={labelCls}>Telefoon</label>
            <input id="f-phone" name="telefoon" type="tel" placeholder="+31 6 ..." autoComplete="tel" className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="f-email" className={labelCls}>E-mail</label>
            <input id="f-email" name="email" type="email" placeholder="uw@email.nl" autoComplete="email" className={inputCls} />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-md bg-accent px-8 font-display text-base font-medium text-white shadow-cta transition-all hover:-translate-y-0.5 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
          aria-label="Boeking bevestigen"
        >
          <Icon name="calendar-check" size={18} />
          {loading ? "Bezig met verzenden…" : "Boeking bevestigen"}
        </button>
        <p className="mt-3 text-center text-[13px] text-secondary">
          Of bel{" "}
          <a href="tel:+31634744522" className="text-accent hover:underline">
            +31 6 34 74 45 22
          </a>
        </p>
      </form>
    </div>
  );
}
