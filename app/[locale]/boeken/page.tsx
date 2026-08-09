import { pageMetadata } from "@/lib/seo-locale";
import BookingSection from "@/components/booking/BookingSection";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, "/boeken", "boekenTitle", "boekenDesc");
}

const FEATURES = [
  { icon: "lock", key: "f1" },
  { icon: "shield-check", key: "f2" },
  { icon: "clock", key: "f3" },
  { icon: "credit-card", key: "f4" },
  { icon: "plane", key: "f5" },
] as const;

/**
 * Deep-linking: /boeken?pickup=…&dropoff=… vult de bekende ritgegevens vooraf in,
 * rekent direct de vaste prijs en toont waar nodig het vluchtnummerveld.
 * Homepage-hero, tarievenpagina, SEO-pagina's en advertenties gebruiken zo
 * exact dezelfde boekingsflow. `van`/`naar` blijven als aliassen werken.
 */
export default async function BoekenPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);
  const first = (v: string | string[] | undefined): string | undefined =>
    (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  const initialPickup = first(query?.pickup) ?? first(query?.van);
  const initialDropoff = first(query?.dropoff) ?? first(query?.naar);
  const initialReturn = first(query?.retour) === "1";
  const personsRaw = first(query?.persons);
  const initialPersons = personsRaw && /^\d+$/.test(personsRaw) ? Number(personsRaw) : undefined;
  const dateRaw = first(query?.date);
  const timeRaw = first(query?.time);
  const returnDateRaw = first(query?.returnDate);
  const returnTimeRaw = first(query?.returnTime);
  const initialDate = dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : undefined;
  const initialTime = timeRaw && /^([01]\d|2[0-3]):[0-5]\d$/.test(timeRaw) ? timeRaw : undefined;
  const initialReturnDate = returnDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(returnDateRaw) ? returnDateRaw : undefined;
  const initialReturnTime = returnTimeRaw && /^([01]\d|2[0-3]):[0-5]\d$/.test(returnTimeRaw) ? returnTimeRaw : undefined;
  const t = await getTranslations({ locale, namespace: "boekenPagina" });
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
        <BookingSection
          initialPickup={initialPickup}
          initialDropoff={initialDropoff}
          initialReturn={initialReturn}
          initialPersons={initialPersons}
          initialDate={initialDate}
          initialTime={initialTime}
          initialReturnDate={initialReturnDate}
          initialReturnTime={initialReturnTime}
        />
      </ScrollReveal>
    </section>
  );
}
