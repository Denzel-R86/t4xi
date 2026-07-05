import type { Metadata } from "next";
import Button from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Tarieven",
  description:
    "Transparante vaste tarieven binnen de wettelijke maximumtarieven. Geen verrassingen achteraf.",
  alternates: { canonical: "/tarieven" },
};

export default function TarievenPage() {
  return (
    <section className="mx-auto max-w-site px-6 py-20 md:py-28">
      <p className="text-eyebrow font-medium uppercase text-accent">Tarieven</p>
      <h1 className="mt-3 font-display text-display-lg font-semibold text-ink">
        Vaste prijzen, geen verrassingen
      </h1>
      <p className="mt-4 max-w-lg text-secondary">
        Alle T4XI-tarieven vallen binnen de Nederlandse wettelijke
        maximumtarieven. Je ziet de vaste prijs vóór je boekt — die prijs
        verandert niet, ook niet bij file of omrijden.
      </p>
      {/*
        TODO Fase 3: tarieventabel (Ride / Business / Vaste Klant) uit
        Sanity CMS laden, benchmarked tegen wettelijk maximum en Uber/Bolt.
      */}
      <div className="mt-12">
        <Button href="/boeken">Bereken je prijs</Button>
      </div>
    </section>
  );
}
