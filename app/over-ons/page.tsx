import type { Metadata } from "next";
import FairBand from "@/components/sections/FairBand";
import WhySection from "@/components/sections/WhySection";
import ReviewsSection from "@/components/sections/ReviewsSection";
import ScrollReveal from "@/components/ui/ScrollReveal";

export const metadata: Metadata = {
  title: "Over ons",
  description:
    "T4XI is een initiatief van Noir Driving Services — premium elektrisch vervoer. Eerlijk voor de klant én voor de chauffeur.",
  alternates: { canonical: "/over-ons" },
};

export default function OverOnsPage() {
  return (
    <>
      <section className="mx-auto max-w-site px-6 pb-4 pt-16 md:pt-24">
        <ScrollReveal>
          <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
            <span aria-hidden="true" className="h-px w-4 bg-accent" />
            Over ons
          </p>
          <h1 className="mt-4 font-display text-display-lg font-bold text-ink">
            Premium vervoer,
            <br />
            <span className="italic text-stone">elektrisch gedreven</span>
          </h1>
          <div className="mt-6 max-w-2xl space-y-4 text-secondary">
            <p>
              T4XI is onderdeel van Noir Driving Services, opgericht in Almere.
              We rijden uitsluitend elektrisch en geloven dat premium vervoer
              transparant hoort te zijn: een vaste prijs vooraf, een chauffeur
              die op tijd is en een auto die stil en comfortabel rijdt.
            </p>
            <p>Arrive with confidence — dat is geen slogan, dat is de afspraak.</p>
          </div>
        </ScrollReveal>
      </section>
      <FairBand />
      <WhySection />
      <ReviewsSection />
    </>
  );
}
