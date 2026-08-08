"use client";

import { useCallback, useEffect, useState } from "react";

type InvoiceDetails = {
  billing_name: string; billing_address: string; billing_postal_code: string;
  billing_city: string; billing_country: string; executing_carrier_name: string;
  invoice_number: string | null; invoice_email_sent_at: string | null;
};
type Booking = {
  id: string; booking_ref: string; customer_name: string; customer_email: string;
  from_address: string; to_address: string; ride_date: string; ride_time: string;
  price_euros: number | null; payment_status: string; paid_at: string | null;
  invoice: InvoiceDetails | null;
};

const input = "min-h-11 w-full rounded-lg border border-line bg-field px-3 text-sm text-ink focus:border-accent focus:outline-none";

export default function InvoiceOperations() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/invoices", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const json = await response.json();
      setBookings(json.bookings ?? []); setState("ready");
    } catch { setState("error"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <main className="min-h-screen bg-fog px-4 py-10 text-ink md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-end justify-between border-b border-line pb-5">
          <div><p className="text-xs uppercase tracking-[0.18em] text-stone">T4XI operations</p><h1 className="mt-2 font-display text-3xl font-bold">Facturatie</h1></div>
          <button onClick={() => void load()} className="rounded-md border border-line bg-white px-4 py-2 text-sm">Vernieuwen</button>
        </div>
        {state === "loading" && <p>Boekingen laden...</p>}
        {state === "error" && <p className="rounded-xl bg-red-50 p-4 text-red-700">Boekingen konden niet worden geladen.</p>}
        <div className="grid gap-5">
          {bookings.map((booking) => <BookingInvoiceCard key={booking.id} booking={booking} onSaved={load} />)}
        </div>
      </div>
    </main>
  );
}

function BookingInvoiceCard({ booking, onSaved }: { booking: Booking; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const locked = Boolean(booking.invoice?.invoice_number);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/admin/invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, bookingId: booking.id }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Opslaan mislukt");
      setMessage(json.invoice?.status === "sent" ? "Factuur opgeslagen en verzonden." : json.invoice?.status === "not_ready" ? "Opgeslagen. Factuur volgt automatisch na betaling." : `Opgeslagen (${json.invoice?.status ?? "gereed"}).`);
      await onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Opslaan mislukt"); }
    finally { setBusy(false); }
  }
  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start gap-3">
        <div><p className="font-display text-lg font-bold">{booking.booking_ref}</p><p className="text-sm text-secondary">{booking.customer_name} - {booking.customer_email}</p></div>
        <div className="ml-auto text-right text-sm"><span className={`rounded-full px-3 py-1 font-semibold ${booking.payment_status === "paid" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>{booking.payment_status}</span><p className="mt-2 text-secondary">{booking.price_euros === null ? "Offerte" : `EUR ${Number(booking.price_euros).toFixed(2)}`}</p></div>
      </div>
      <p className="mt-4 rounded-xl bg-fog px-4 py-3 text-sm"><strong>{booking.ride_date} {booking.ride_time}</strong><br />{booking.from_address} → {booking.to_address}</p>
      {locked ? (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"><strong>{booking.invoice?.invoice_number}</strong><br />Uitvoerder: {booking.invoice?.executing_carrier_name}<br />{booking.invoice?.invoice_email_sent_at ? "Factuurmail verzonden" : "Factuur uitgegeven; verzending wordt opnieuw geprobeerd"}</div>
      ) : (
        <form onSubmit={save} className="mt-5 grid gap-3 md:grid-cols-2">
          <Field name="billingName" label="Factuurnaam" value={booking.invoice?.billing_name ?? booking.customer_name} />
          <Field name="executingCarrierName" label="Uitvoerend taxibedrijf" value={booking.invoice?.executing_carrier_name ?? ""} />
          <Field name="billingAddress" label="Factuuradres" value={booking.invoice?.billing_address ?? ""} />
          <div className="grid grid-cols-[120px_1fr] gap-3"><Field name="billingPostalCode" label="Postcode" value={booking.invoice?.billing_postal_code ?? ""} /><Field name="billingCity" label="Plaats" value={booking.invoice?.billing_city ?? ""} /></div>
          <Field name="billingCountry" label="Land" value={booking.invoice?.billing_country ?? "Nederland"} />
          <div className="flex items-end"><button disabled={busy} className="min-h-11 w-full rounded-md bg-accent px-5 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Bezig..." : booking.payment_status === "paid" ? "Opslaan en factuur verzenden" : "Toewijzing opslaan"}</button></div>
          {message && <p className="md:col-span-2 text-sm text-secondary">{message}</p>}
        </form>
      )}
    </section>
  );
}

function Field({ name, label, value }: { name: string; label: string; value: string }) {
  return <label className="text-xs font-semibold text-secondary">{label}<input required name={name} defaultValue={value} className={`mt-1.5 ${input}`} /></label>;
}
