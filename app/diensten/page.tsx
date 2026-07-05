import type { Metadata } from "next";
import Button from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Diensten",
  description:
    "T4xi Ride, T4xi Business en Vaste Klant — premium elektrisch taxivervoer voor elke situatie.",
  alternates: { canonical: "/diensten" },
};

const diensten = [
  {
    title: "T4xi Ride",
    text: "Directe premium rit voor particulieren. Vaste prijs vooraf, 100% elektrische vloot en een chauffeur die op tijd is.",
  },
  {
    title: "T4xi Business",
    text: "Zakelijk vervoer met maandfacturatie, prioriteit bij drukte en vaste chauffeurs die uw voorkeuren kennen.",
  },
  {
    title: "Vaste Klant",
    text: "Terugkerende ritten tegen een afgesproken tarief — woon-werk, school of Schiphol. Eén afspraak, altijd geregeld.",
  },
];

export default function DienstenPage() {
  return (
    <section className="mx-auto max-w-site px-6 py-20 md:py-28">
      <p className="text-eyebrow font-medium uppercase text-accent">Diensten</p>
      <h1 className="mt-3 font-display text-display-lg font-semibold text-ink">
        Vervoer dat bij u past
      </h1>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {diensten.map((d) => (
          <article key={d.title} className="rounded-2xl border border-line bg-card p-8">
            <h2 className="font-display text-display-md font-medium text-ink">{d.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-secondary">{d.text}</p>
          </article>
        ))}
      </div>
      <div className="mt-12">
        <Button href="/boeken">Boek een rit</Button>
      </div>
    </section>
  );
}
