import type { Metadata } from "next";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import PriceTables from "@/components/sections/PriceTables";
import FairBand from "@/components/sections/FairBand";
import ScrollReveal from "@/components/ui/ScrollReveal";

export const metadata: Metadata = {
  title: "Tarieven",
  description:
    "Vaste T4XI-tarieven vanuit Amsterdam, Rotterdam, Almere en Utrecht. Enkele rit, retour en all-in dagtochten — geen verrassingen.",
  alternates: { canonical: "/tarieven" },
};

export default function TarievenPage() {
  return (
    <>
      <section className="py-16 md:py-24" aria-labelledby="prijzen-title">
        <div className="mx-auto max-w-site px-6">
          <ScrollReveal>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-px w-4 bg-accent" />
              Vaste tarieven
            </p>
            <h1 id="prijzen-title" className="mt-4 font-display text-display-lg font-bold text-ink">
              Geen verrassingen,
              <br />
              <span className="italic text-stone">altijd vaste prijs</span>
            </h1>
            <p className="mt-4 max-w-2xl text-secondary">
              Onderstaande prijzen zijn voor enkele rit. Retour = ×1,8.
              Nachttarief (23:00–06:00) = +15%.
            </p>
          </ScrollReveal>
          <ScrollReveal>
            <div className="mt-12">
              <PriceTables />
            </div>
          </ScrollReveal>
          <div className="mt-10">
            <Button href="/boeken" size="xl">
              <Icon name="calendar-check" size={19} />
              Bereken uw prijs
            </Button>
          </div>
        </div>
      </section>
      <FairBand />
    </>
  );
}
