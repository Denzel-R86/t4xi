"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";

type InvoiceDetails = {
  billing_name: string;
  billing_address: string;
  billing_postal_code: string;
  billing_city: string;
  billing_country: string;
  executing_carrier_id: string | null;
  executing_carrier_name: string;
  invoice_number: string | null;
  invoice_email_sent_at: string | null;
};

type Booking = {
  id: string;
  booking_ref: string;
  customer_name: string;
  customer_email: string;
  from_address: string;
  to_address: string;
  ride_date: string;
  ride_time: string;
  price_euros: number | null;
  payment_status: string;
  paid_at: string | null;
  invoice: InvoiceDetails | null;
};

type Carrier = {
  id: string;
  name: string;
  active: boolean;
  onboarding_completed_at: string;
};

type ViewState = "loading" | "ready" | "unauthenticated" | "error";

const input = "min-h-11 w-full rounded-lg border border-line bg-field px-3 text-sm text-ink focus:border-accent focus:bg-white focus:outline-none focus:ring-4 focus:ring-accent/10";
const button = "min-h-11 rounded-md bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60";

export default function InvoiceOperations() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [state, setState] = useState<ViewState>("loading");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/invoices", { cache: "no-store" });
      if (response.status === 401) {
        setBookings([]);
        setCarriers([]);
        setState("unauthenticated");
        return;
      }
      if (!response.ok) throw new Error();
      const json = await response.json();
      setBookings(json.bookings ?? []);
      setCarriers(json.carriers ?? []);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function logout() {
    await fetch("/api/admin/session", { method: "DELETE" }).catch(() => null);
    setBookings([]);
    setCarriers([]);
    setState("unauthenticated");
  }

  if (state === "loading") return <LoadingScreen />;
  if (state === "unauthenticated") return <LoginScreen onLogin={load} />;

  return (
    <main className="min-h-screen bg-fog px-4 py-8 text-ink md:px-8 md:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-end gap-4 border-b border-line pb-5">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-stone">T4XI operations</p>
            <h1 className="mt-2 font-display text-3xl font-bold">Facturatie</h1>
          </div>
          <div className="ml-auto flex gap-2">
            <button onClick={() => void load()} className="min-h-10 rounded-md border border-line bg-white px-4 text-sm hover:bg-fog">
              Vernieuwen
            </button>
            <button onClick={() => void logout()} className="flex min-h-10 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm hover:bg-fog">
              <Icon name="logout" size={14} />
              Afmelden
            </button>
          </div>
        </header>

        {state === "error" ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            Boekingen konden niet worden geladen. Probeer het opnieuw.
          </div>
        ) : (
          <>
            <CarrierOnboarding carriers={carriers} onSaved={load} />
            <div className="mb-4 mt-9 flex items-baseline justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone">Openstaande administratie</p>
                <h2 className="mt-1 font-display text-2xl font-bold">Boekingen</h2>
              </div>
              <span className="text-sm text-secondary">{bookings.length} boekingen</span>
            </div>
            {bookings.length === 0 ? (
              <p className="rounded-2xl border border-line bg-white p-6 text-sm text-secondary shadow-card">Er zijn nog geen boekingen.</p>
            ) : (
              <div className="grid gap-5">
                {bookings.map((booking) => (
                  <BookingInvoiceCard key={booking.id} booking={booking} carriers={carriers} onSaved={load} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function LoadingScreen() {
  return <main className="grid min-h-screen place-items-center bg-fog text-sm text-secondary">Beheeromgeving laden...</main>;
}

function LoginScreen({ onLogin }: { onLogin: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
      });
      if (!response.ok) {
        setMessage(response.status === 401 ? "Gebruikersnaam of wachtwoord is niet juist." : "Aanmelden is tijdelijk niet mogelijk.");
        return;
      }
      await onLogin();
    } catch {
      setMessage("Aanmelden is tijdelijk niet mogelijk.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-fog px-4 py-12 text-ink">
      <section className="w-full max-w-md overflow-hidden rounded-[28px] border border-line bg-white shadow-hero-card">
        <div className="h-1.5 bg-accent" />
        <div className="p-7 md:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone">T4XI operations</p>
          <h1 className="mt-3 font-display text-3xl font-bold">Welkom terug</h1>
          <p className="mt-2 text-sm leading-6 text-secondary">Meld u aan om boekingen, vervoerders en facturen te beheren.</p>
          <form onSubmit={login} className="mt-7 grid gap-4">
            <Field name="username" label="Gebruikersnaam" value="" autoComplete="username" />
            <Field name="password" label="Wachtwoord" value="" type="password" autoComplete="current-password" />
            <button disabled={busy} className={`${button} mt-2`}>{busy ? "Aanmelden..." : "Aanmelden"}</button>
            {message && <p role="alert" className="text-sm text-red-700">{message}</p>}
          </form>
        </div>
      </section>
    </main>
  );
}

function CarrierOnboarding({ carriers, onSaved }: { carriers: Carrier[]; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function onboard(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/admin/carriers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name") }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(json.error === "already_exists" ? "Dit taxibedrijf staat al in de lijst." : "Taxibedrijf kon niet worden toegevoegd.");
        return;
      }
      formElement.reset();
      setMessage(`${json.carrier.name} is gekoppeld aan ID ${shortId(json.carrier.id)}.`);
      await onSaved();
    } catch {
      setMessage("Taxibedrijf kon niet worden toegevoegd.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-card md:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:items-start">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone">Onboarding</p>
          <h2 className="mt-1 font-display text-xl font-bold">Uitvoerende taxibedrijven</h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-secondary">
            Voeg een vervoerder één keer toe. Het systeem maakt automatisch een vaste ID aan; daarna verschijnt het bedrijf direct in iedere factuurdropdown.
          </p>
          <form onSubmit={onboard} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1"><Field name="name" label="Officiële bedrijfsnaam" value="" /></div>
            <button disabled={busy} className={button}>{busy ? "Toevoegen..." : "Bedrijf onboarden"}</button>
          </form>
          {message && <p role="status" className="mt-3 text-sm text-secondary">{message}</p>}
        </div>
        <div className="rounded-xl border border-line bg-fog p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold">Actieve bedrijven</p>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs text-secondary">{carriers.length}</span>
          </div>
          {carriers.length === 0 ? (
            <p className="mt-3 text-sm text-secondary">Nog geen uitvoerende bedrijven gekoppeld.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {carriers.map((carrier) => (
                <li key={carrier.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="text-sm font-semibold text-ink">{carrier.name}</span>
                  <span className="font-mono text-[11px] uppercase tracking-wider text-stone">ID {shortId(carrier.id)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function BookingInvoiceCard({ booking, carriers, onSaved }: { booking: Booking; carriers: Carrier[]; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const locked = Boolean(booking.invoice?.invoice_number);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/admin/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, bookingId: booking.id }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Opslaan mislukt");
      setMessage(json.invoice?.status === "sent" ? "Factuur opgeslagen en verzonden." : json.invoice?.status === "not_ready" ? "Opgeslagen. Factuur volgt automatisch na betaling." : `Opgeslagen (${json.invoice?.status ?? "gereed"}).`);
      await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Opslaan mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <p className="font-display text-lg font-bold">{booking.booking_ref}</p>
          <p className="text-sm text-secondary">{booking.customer_name} - {booking.customer_email}</p>
        </div>
        <div className="ml-auto text-right text-sm">
          <span className={`rounded-full px-3 py-1 font-semibold ${booking.payment_status === "paid" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>{booking.payment_status}</span>
          <p className="mt-2 text-secondary">{booking.price_euros === null ? "Offerte" : `EUR ${Number(booking.price_euros).toFixed(2)}`}</p>
        </div>
      </div>
      <p className="mt-4 rounded-xl bg-fog px-4 py-3 text-sm"><strong>{booking.ride_date} {booking.ride_time}</strong><br />{booking.from_address} → {booking.to_address}</p>
      {locked ? (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <strong>{booking.invoice?.invoice_number}</strong><br />
          Uitvoerder: {booking.invoice?.executing_carrier_name}<br />
          {booking.invoice?.invoice_email_sent_at ? "Factuurmail verzonden" : "Factuur uitgegeven; verzending wordt opnieuw geprobeerd"}
        </div>
      ) : (
        <form onSubmit={save} className="mt-5 grid gap-3 md:grid-cols-2">
          <Field name="billingName" label="Factuurnaam" value={booking.invoice?.billing_name ?? booking.customer_name} />
          <CarrierSelect carriers={carriers} value={booking.invoice?.executing_carrier_id ?? ""} />
          <Field name="billingAddress" label="Factuuradres" value={booking.invoice?.billing_address ?? ""} />
          <div className="grid grid-cols-[120px_1fr] gap-3"><Field name="billingPostalCode" label="Postcode" value={booking.invoice?.billing_postal_code ?? ""} /><Field name="billingCity" label="Plaats" value={booking.invoice?.billing_city ?? ""} /></div>
          <Field name="billingCountry" label="Land" value={booking.invoice?.billing_country ?? "Nederland"} />
          <div className="flex items-end"><button disabled={busy || carriers.length === 0} className={`${button} w-full`}>{busy ? "Bezig..." : booking.payment_status === "paid" ? "Opslaan en factuur verzenden" : "Toewijzing opslaan"}</button></div>
          {carriers.length === 0 && <p className="md:col-span-2 text-sm text-amber-700">Onboard eerst een uitvoerend taxibedrijf.</p>}
          {message && <p className="md:col-span-2 text-sm text-secondary">{message}</p>}
        </form>
      )}
    </section>
  );
}

function CarrierSelect({ carriers, value }: { carriers: Carrier[]; value: string }) {
  return (
    <label className="text-xs font-semibold text-secondary">
      Uitvoerend taxibedrijf
      <select required name="carrierId" defaultValue={value} className={`mt-1.5 ${input}`}>
        <option value="" disabled>Selecteer een uitvoerende partij</option>
        {carriers.map((carrier) => <option key={carrier.id} value={carrier.id}>{carrier.name}</option>)}
      </select>
    </label>
  );
}

function Field({ name, label, value, type = "text", autoComplete }: { name: string; label: string; value: string; type?: string; autoComplete?: string }) {
  return (
    <label className="text-xs font-semibold text-secondary">
      {label}
      <input required name={name} type={type} defaultValue={value} autoComplete={autoComplete} className={`mt-1.5 ${input}`} />
    </label>
  );
}

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}
