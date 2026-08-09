import { pageMetadata } from "@/lib/seo-locale";
import ContactSection from "@/components/sections/ContactSection";
import FaqList from "@/components/sections/FaqList";
import ScrollReveal from "@/components/ui/ScrollReveal";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, "/contact", "contactTitle", "contactDesc");
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "contact" });
  return (
    <>
      <ContactSection />
      <section className="py-16 md:py-24" aria-labelledby="faq-title">
        <div className="mx-auto max-w-site px-6">
          <ScrollReveal>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-px w-4 bg-accent" />
              {t("faqKicker")}
            </p>
            <h2 id="faq-title" className="mb-12 mt-4 font-display text-display-lg font-bold text-ink">
              {t("faqKop1")} <span className="italic text-stone">{t("faqKop2")}</span>
            </h2>
          </ScrollReveal>
          <FaqList />
        </div>
      </section>
    </>
  );
}
