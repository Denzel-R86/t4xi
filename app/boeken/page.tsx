import type { Metadata } from "next";
import BookingSection from "@/components/booking/BookingSection";
import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";

export const metadata: Metadata = {
  title: "Boek een rit",
  description:
    "Boek uw premium elektrische taxi. Vul ophaal- en bestemmingsadres in en zie direct uw vaste prijs.",
  alternates: { canonical: "/boeken" },
};

const FEATURES = [
  { icon: "lock", text: "Vaste prijs vooraf — geen taxameter" },
  { icon: "shield-check", text: "Geldige Nederlandse taxichauffeurskaart" },
  { icon: "clock", text: "Bevestiging via WhatsApp of e-mail" },
  { icon: "credit-card", text: "iDEAL, pin of contant" },
  { icon: "plane", text: "Wij volgen uw vluchtstatus bij vertraging" },
];

export default function BoekenPage() {
  return (
    <section className="mx-auto grid max-w-site items-start gap-12 px-6 py-16 md:py-24 lg:grid-cols-2">
      <div>
        <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
          <span aria-hidden="true" className="h-px w-4 bg-accent" />
          Direct reserveren
        </p>
        <h1 className="mt-4 font-display text-display-lg font-bold text-ink">
          Plan uw
          <br />
          <span className="italic text-stone">rit nu</span>
        </h1>
        <p className="mt-4 max-w-md text-secondary">
          Vaste prijs vooraf, inclusief btw. Geen taxameter, geen verrassingen.
        </p>
        <ul className="mt-8 flex flex-col gap-4">
          {FEATURES.map((f) => (
            <li key={f.text} className="flex items-center gap-3 text-sm text-ink">
              <Icon name={f.icon} size={18} className="shrink-0 text-accent" />
              {f.text}
            </li>
          ))}
        </ul>
      </div>
      <ScrollReveal>
        <BookingSection />
      </ScrollReveal>
    </section>
  );
}
