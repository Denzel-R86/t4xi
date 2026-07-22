import type { Metadata } from "next";
import ContactSection from "@/components/sections/ContactSection";
import FaqList from "@/components/sections/FaqList";
import ScrollReveal from "@/components/ui/ScrollReveal";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Neem contact op met T4XI: bel, mail of WhatsApp. Dag en nacht bereikbaar voor vragen en boekingen.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <ContactSection />
      <section className="py-16 md:py-24" aria-labelledby="faq-title">
        <div className="mx-auto max-w-site px-6">
          <ScrollReveal>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-px w-4 bg-accent" />
              Veelgestelde vragen
            </p>
            <h2 id="faq-title" className="mb-12 mt-4 font-display text-display-lg font-bold text-ink">
              Heeft u <span className="italic text-stone">vragen?</span>
            </h2>
          </ScrollReveal>
          <FaqList />
        </div>
      </section>
    </>
  );
}
