import Button from "@/components/ui/Button";
import ScrollReveal from "@/components/ui/ScrollReveal";

const diensten = [
  {
    title: "T4xi Ride",
    text: "Directe premium rit, 100% elektrisch. Vaste prijs vooraf, geen verrassingen achteraf.",
  },
  {
    title: "T4xi Business",
    text: "Zakelijk vervoer met facturatie, prioriteit bij drukte en een vaste chauffeurspool.",
  },
  {
    title: "Vaste Klant",
    text: "Terugkerende ritten — school, werk, Schiphol — tegen een afgesproken vast tarief.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-site px-6 py-24 md:py-36">
          <p className="text-eyebrow font-medium uppercase text-stone-text">
            100% elektrisch · Regio Almere &amp; Amsterdam
          </p>
          <h1 className="mt-5 max-w-3xl font-display text-display-xl font-semibold text-ink">
            Arrive with confidence.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-secondary">
            Premium taxivervoer met vaste tarieven, professionele chauffeurs en
            een volledig elektrische vloot. Boek in dertig seconden.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Button href="/boeken">Boek een rit</Button>
            <Button href="/tarieven" variant="ghost">
              Bekijk tarieven
            </Button>
          </div>
        </div>
      </section>

      {/* Diensten */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-site px-6 py-20 md:py-28">
          <ScrollReveal>
            <p className="text-eyebrow font-medium uppercase text-stone-text">
              Diensten
            </p>
            <h2 className="mt-3 font-display text-display-lg font-semibold text-ink">
              Drie manieren om te rijden
            </h2>
          </ScrollReveal>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {diensten.map((d, i) => (
              <ScrollReveal key={d.title} delay={i * 100}>
                <article className="h-full rounded-2xl border border-line bg-card p-8 transition-colors hover:border-stone">
                  <h3 className="font-display text-display-md font-medium text-ink">
                    {d.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-secondary">
                    {d.text}
                  </p>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-stone-subtle/40">
        <div className="mx-auto max-w-site px-6 py-20 text-center md:py-28">
          <ScrollReveal>
            <h2 className="font-display text-display-lg font-semibold text-ink">
              Klaar om te vertrekken?
            </h2>
            <p className="mx-auto mt-4 max-w-md text-secondary">
              Vul je adres in en zie direct je vaste prijs — transparant en
              binnen de wettelijke maximumtarieven.
            </p>
            <div className="mt-8">
              <Button href="/boeken">Boek een rit</Button>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
