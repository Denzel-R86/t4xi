import type { Metadata } from "next";
import BookingForm from "@/components/booking/BookingForm";

export const metadata: Metadata = {
  title: "Boek een rit",
  description:
    "Boek uw premium elektrische taxi. Vul ophaal- en bestemmingsadres in en zie direct uw vaste prijs.",
  alternates: { canonical: "/boeken" },
};

export default function BoekenPage() {
  return (
    <section className="mx-auto max-w-site px-6 py-20 md:py-28">
      <p className="text-eyebrow font-medium uppercase text-accent">Boeken</p>
      <h1 className="mt-3 font-display text-display-lg font-semibold text-ink">
        Waar mag de rit naartoe?
      </h1>
      <p className="mt-4 max-w-md text-secondary">
        Vul je ophaal- en bestemmingsadres in. Je ziet direct een vaste prijs
        voordat je bevestigt.
      </p>
      <BookingForm />
    </section>
  );
}
