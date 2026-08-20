import { pageMetadata } from "@/lib/seo-locale";
import ContactSection from "@/components/sections/ContactSection";
import ContactLeadForm from "@/components/contact/ContactLeadForm";
import FaqList from "@/components/sections/FaqList";
import ScrollReveal from "@/components/ui/ScrollReveal";
import { contactPrefill } from "@/lib/contact/prefill";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, "/contact", "contactTitle", "contactDesc");
}

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ audience?: string | string[]; topic?: string | string[] }>;
}) {
  const { locale } = await params;
  const prefill = contactPrefill(await searchParams);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "contact" });
  return (
    <>
      <ContactSection />
      <ContactLeadForm initialAudience={prefill.audience} initialTopic={prefill.topic} />
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
