import { pageMetadata } from "@/lib/seo-locale";
import BookingSection from "@/components/booking/BookingSection";
import { useTranslations } from "next-intl";
import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";

export function generateMetadata({ params }: { params: { locale: string } }) {
  return pageMetadata(params.locale, "/boeken", "boekenTitle", "boekenDesc");
}

const FEATURES = [
  { icon: "lock", key: "f1" },
  { icon: "shield-check", key: "f2" },
  { icon: "clock", key: "f3" },
  { icon: "credit-card", key: "f4" },
  { icon: "plane", key: "f5" },
] as const;

/**
 * Deep-linking: /boeken?pickup=…&dropoff=… vult beide adresvelden vooraf in,
 * rekent direct de vaste prijs en toont waar nodig het vluchtnummerveld.
 * Homepage-hero, tarievenpagina, SEO-pagina's en advertenties gebruiken zo
 * exact dezelfde boekingsflow. `van`/`naar` blijven als aliassen werken.
 */
export default function BoekenPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const first = (v: string | string[] | undefined): string | undefined =>
    (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  const initialPickup = first(searchParams?.pickup) ?? first(searchParams?.van);
  const initialDropoff = first(searchParams?.dropoff) ?? first(searchParams?.naar);
  const t = useTranslations("boekenPagina");
  return (
    <section className="mx-auto grid max-w-site items-start gap-12 px-6 py-16 md:py-24 lg:grid-cols-2">
      <div>
        <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
          <span aria-hidden="true" className="h-px w-4 bg-accent" />
          {t("kicker")}
        </p>
        <h1 className="mt-4 font-display text-display-lg font-bold text-ink">
          {t("kop1")}
          <br />
          <span className="italic text-stone">{t("kop2")}</span>
        </h1>
        <p className="mt-4 max-w-md text-secondary">
          {t("intro")}
        </p>
        <ul className="mt-8 flex flex-col gap-4">
          {FEATURES.map((f) => (
            <li key={f.key} className="flex items-center gap-3 text-sm text-ink">
              <Icon name={f.icon} size={18} className="shrink-0 text-accent" />
              {t(f.key)}
            </li>
          ))}
        </ul>
      </div>
      <ScrollReveal>
        <BookingSection initialPickup={initialPickup} initialDropoff={initialDropoff} />
      </ScrollReveal>
    </section>
  );
}
