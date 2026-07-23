import Icon from "@/components/ui/Icon";
import ScrollReveal from "@/components/ui/ScrollReveal";
import { useTranslations } from "next-intl";

/** Contactsectie + WhatsApp-band uit het v14-bronbestand (#contact). */
export default function ContactSection() {
  const t = useTranslations("contact");
  const CARDS = [
    { icon: "phone", title: t("belOns"), value: "+31 6 34 74 45 22", href: "tel:+31634744522" },
    { icon: "mail", title: t("emailKop"), value: "booking@t4xi.nl", href: "mailto:booking@t4xi.nl" },
    { icon: "clock", title: t("beschikbaarheid"), value: t("dagNacht") },
  ];
  return (
    <section id="contact" className="border-t border-line bg-card/60" aria-labelledby="contact-title">
      <div className="mx-auto max-w-site px-6 pb-12 pt-16 md:pt-24">
        <ScrollReveal>
          <p className="flex items-center gap-2.5 text-eyebrow font-medium uppercase text-accent">
            <span aria-hidden="true" className="h-px w-4 bg-accent" />
            {t("kicker")}
          </p>
          <h1 id="contact-title" className="mt-4 font-display text-display-lg font-bold text-ink">
            {t("kop1")} <span className="italic text-stone">{t("kop2")}</span>
          </h1>
        </ScrollReveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {CARDS.map((c, i) => (
            <ScrollReveal key={c.title} delay={i * 100}>
              <div className="h-full rounded-card border border-line bg-card p-6 text-center shadow-card">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-line bg-accent/5 text-accent">
                  <Icon name={c.icon} size={22} />
                </span>
                <h3 className="mt-3.5 font-display text-base font-semibold text-ink">{c.title}</h3>
                {c.href ? (
                  <a href={c.href} className="mt-1 block text-sm text-secondary hover:text-accent">
                    {c.value}
                  </a>
                ) : (
                  <p className="mt-1 text-sm text-secondary">{c.value}</p>
                )}
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>

      {/* WhatsApp-band */}
      <div className="bg-ink py-14 text-center">
        <p className="mb-4 text-[11px] uppercase tracking-[4px] text-whatsapp/60">
          {t("snelste")}
        </p>
        <a
          href={`https://wa.me/31634744522?text=${encodeURIComponent(t("waText"))}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="WhatsApp T4XI"
          className="inline-flex min-h-[52px] items-center gap-2.5 rounded-md bg-whatsapp px-10 font-display text-base font-semibold text-[#0b3d22] transition-transform hover:-translate-y-0.5"
        >
          <Icon name="whatsapp" size={22} />
          {t("whatsappCta")}
        </a>
        <p className="mt-3.5 text-[13px] text-white/30">{t("dagNachtBereikbaar")}</p>
      </div>
    </section>
  );
}
