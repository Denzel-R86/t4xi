import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Over ons",
  description:
    "T4XI is een initiatief van Noir Driving Services — premium elektrisch vervoer vanuit Almere.",
  alternates: { canonical: "/over-ons" },
};

export default function OverOnsPage() {
  return (
    <section className="mx-auto max-w-site px-6 py-20 md:py-28">
      <p className="text-eyebrow font-medium uppercase text-stone-text">Over ons</p>
      <h1 className="mt-3 font-display text-display-lg font-semibold text-ink">
        Premium vervoer, elektrisch gedreven
      </h1>
      <div className="mt-6 max-w-2xl space-y-4 text-secondary">
        <p>
          T4XI is onderdeel van Noir Driving Services, opgericht in Almere.
          We rijden uitsluitend elektrisch en geloven dat premium vervoer
          transparant hoort te zijn: een vaste prijs vooraf, een chauffeur
          die op tijd is en een auto die stil en comfortabel rijdt.
        </p>
        <p>
          Arrive with confidence — dat is geen slogan, dat is de afspraak.
        </p>
      </div>
    </section>
  );
}
