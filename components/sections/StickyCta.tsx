import { Link } from "@/i18n/navigation";
import Icon from "@/components/ui/Icon";
import { useTranslations } from "next-intl";

/** Sticky mobiele actiebalk uit het v14-bronbestand — verborgen op desktop. */
export default function StickyCta() {
  const t = useTranslations("sticky");
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-2.5 border-t border-line bg-fog/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur-lg lg:hidden"
      role="complementary"
      aria-label={t("label")}
    >
      <Link
        href="/boeken"
        className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-accent text-sm font-medium text-white shadow-cta"
      >
        <Icon name="calendar-check" size={16} />
        {t("boeken")}
      </Link>
      <a
        href="tel:+31634744522"
        className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border border-line-strong bg-white/70 text-sm font-medium text-ink"
      >
        <Icon name="phone" size={16} />
        {t("bellen")}
      </a>
      <a
        href="https://wa.me/31634744522"
        target="_blank"
        rel="noopener"
        aria-label={t("whatsapp")}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-whatsapp/15 text-whatsapp"
      >
        <Icon name="whatsapp" size={20} />
      </a>
    </div>
  );
}
