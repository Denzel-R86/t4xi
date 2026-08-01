import { pageMetadata } from "@/lib/seo-locale";
import Image from "next/image";
import interieur from "@/public/tesla-interieur.jpg";
import FairBand from "@/components/sections/FairBand";
import WhySection from "@/components/sections/WhySection";
import ReviewsSection from "@/components/sections/ReviewsSection";
import ScrollReveal from "@/components/ui/ScrollReveal";
import { useTranslations } from "next-intl";

export function generateMetadata({ params }: { params: { locale: string } }) {
  return pageMetadata(params.locale, "/over-ons", "overOnsTitle", "overOnsDesc");
}

export default function OverOnsPage() {
  const t = useTranslations("overOns");
  return (
    <>
      <section className="mx-auto max-w-site px-6 pb-4 pt-16 md:pt-24">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <ScrollReveal>
            <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
              <span aria-hidden="true" className="h-px w-4 bg-accent" />
              {t("kicker")}
            </p>
            <h1 className="mt-4 font-display text-display-lg font-bold text-ink">
              {t("kop1")}
              <br />
              <span className="italic text-stone">{t("kop2")}</span>
            </h1>
            <div className="mt-6 max-w-2xl space-y-4 text-secondary">
              <p>{t("alinea1")}</p>
              <p>{t("alinea2")}</p>
            </div>
          </ScrollReveal>
          {/* Interieur Tesla Model Y (gecureerd, T4XI): illustreert het "stil en
              comfortabel"-interieur uit de tekst. Eén dominante foto per sectie. */}
          <ScrollReveal delay={150}>
            <figure className="relative aspect-[4/5] overflow-hidden rounded-fleet border border-line shadow-card-lg">
              <Image
                src={interieur}
                alt={t("interieurAlt")}
                fill
                priority
                placeholder="blur"
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </figure>
          </ScrollReveal>
        </div>
      </section>
      <FairBand />
      <WhySection />
      <ReviewsSection />
    </>
  );
}
