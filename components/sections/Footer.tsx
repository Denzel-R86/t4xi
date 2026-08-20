import { Link } from "@/i18n/navigation";
import Icon from "@/components/ui/Icon";
import Monogram from "@/components/ui/Monogram";
import { BEDRIJF } from "@/lib/legal";
import { useTranslations } from "next-intl";

export default function Footer() {
  const t = useTranslations("footer");
  const tn = useTranslations("nav");
  const socials = [
    { href: "https://wa.me/31634744522", label: tn("whatsapp"), icon: "whatsapp", external: true },
    { href: "https://www.instagram.com/t4xi.nl/", label: t("instagram"), icon: "instagram", external: true },
    { href: "tel:+31634744522", label: tn("bel"), icon: "phone" },
    { href: "mailto:booking@t4xi.nl", label: t("email"), icon: "mail" },
  ];
  return (
    <footer className="bg-ink text-fog pb-[calc(72px_+_env(safe-area-inset-bottom))] lg:pb-0">
      {/* Bodem-clearance voor de vaste mobiele StickyCta (fixed bottom-0, lg:hidden):
          zonder deze ruimte dekt de balk de laatste footerregels (KvK, juridisch) af.
          Vervalt op lg, waar de StickyCta niet bestaat. */}
      <div className="mx-auto max-w-site px-6 pb-10 pt-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <Monogram className="h-10 w-auto" title="T4XI" />
            <p className="mt-4 text-sm tracking-[0.02em] text-stone-subtle">{t("tagline")}</p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-stone-subtle">
              {t("omschrijving")}
            </p>
            <div className="mt-5 flex gap-2.5">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  {...(s.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-stone-subtle transition-colors hover:border-white/25 hover:text-white"
                >
                  <Icon name={s.icon} size={18} />
                </a>
              ))}
            </div>
            {/*
              Beoordelingscijfer verwijderd (Sprint 11, Fase 0): er is geen verifieerbare
              bron voor "4.9 — 127 reviews". Komt terug zodra een Google-reviewkoppeling
              bestaat. Zie components/sections/ReviewsSection.tsx.
            */}
            <p className="mt-5 text-sm text-stone-subtle">
              {t("vastePrijs")}
            </p>
          </div>

          <nav aria-label={t("dienstenKop")}>
            <p className="text-eyebrow font-medium uppercase text-stone">{t("dienstenKop")}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><Link href="/diensten" className="text-stone-subtle hover:text-white">{t("schiphol")}</Link></li>
              <li><Link href="/zakelijk-vervoer" className="text-stone-subtle hover:text-white">{t("zakelijk")}</Link></li>
              <li><Link href="/diensten" className="text-stone-subtle hover:text-white">{t("prive")}</Link></li>
              <li><Link href="/diensten" className="text-stone-subtle hover:text-white">{t("evenementen")}</Link></li>
              <li><Link href="/dagtochten" className="text-stone-subtle hover:text-white">{t("dagtochten")}</Link></li>
              <li><Link href="/producten" className="text-stone-subtle hover:text-white">{t("memberships")}</Link></li>
            </ul>
          </nav>

          <nav aria-label="T4XI">
            <p className="text-eyebrow font-medium uppercase text-stone">T4XI</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><Link href="/#vloot" className="text-stone-subtle hover:text-white">{t("wagenpark")}</Link></li>
              <li><Link href="/zakelijk-vervoer" className="text-stone-subtle hover:text-white">{t("bedrijven")}</Link></li>
              <li><Link href="/partner" className="text-stone-subtle hover:text-white">{t("partnerWorden")}</Link></li>
              {/* "Mijn account" verwijderd: /klant is afgesloten tot er echte
                  authenticatie is (Sprint 11, Fase 0 — zie proxy.ts). */}
              <li><Link href="/tarieven" className="text-stone-subtle hover:text-white">{t("tarieven")}</Link></li>
              <li><Link href="/over-ons" className="text-stone-subtle hover:text-white">{t("overOns")}</Link></li>
              <li><Link href="/boeken" className="text-stone-subtle hover:text-white">{t("boeken")}</Link></li>
            </ul>
          </nav>

          <div>
            <p className="text-eyebrow font-medium uppercase text-stone">{t("contactKop")}</p>
            <ul className="mt-4 space-y-2.5 text-sm text-stone-subtle">
              <li className="flex items-start gap-2 leading-relaxed">
                <Icon name="map-pin" size={15} className="mt-0.5 shrink-0 text-stone" />
                <span>{t("steden")}</span>
              </li>
              <li>
                <a href="tel:+31634744522" className="flex items-center gap-2 hover:text-white">
                  <Icon name="phone" size={15} className="shrink-0 text-stone" />
                  +31 6 34 74 45 22
                </a>
              </li>
              <li>
                <a href="mailto:booking@t4xi.nl" className="flex items-center gap-2 hover:text-white">
                  <Icon name="mail" size={15} className="shrink-0 text-stone" />
                  booking@t4xi.nl
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Icon name="clock" size={15} className="shrink-0 text-stone" />
                {t("beschikbaar")}
              </li>
              <li className="flex items-center gap-2">
                <Icon name="building" size={15} className="shrink-0 text-stone" />
                KVK: 80673813
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-stone sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} T4XI.nl — {t("rechten")} ·
            {t("onderdeelVan")} {BEDRIJF.rechtspersoon} · KvK {BEDRIJF.kvk}
            {BEDRIJF.btw ? ` · Btw ${BEDRIJF.btw}` : ""}
          </p>
          <nav aria-label={t("juridisch")} className="flex gap-4">
            <Link href="/privacy" className="hover:text-white">{t("privacy")}</Link>
            <Link href="/voorwaarden" className="hover:text-white">{t("voorwaarden")}</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
