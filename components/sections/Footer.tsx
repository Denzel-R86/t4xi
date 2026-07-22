import { Link } from "@/i18n/navigation";
import Icon from "@/components/ui/Icon";
import Wordmark from "@/components/ui/Wordmark";
import { BEDRIJF } from "@/lib/legal";

const socials = [
  { href: "https://wa.me/31634744522", label: "WhatsApp T4XI", icon: "whatsapp", external: true },
  { href: "tel:+31634744522", label: "Bel T4XI", icon: "phone" },
  { href: "mailto:booking@t4xi.nl", label: "E-mail T4XI", icon: "mail" },
];

export default function Footer() {
  return (
    <footer className="bg-ink text-fog">
      <div className="mx-auto max-w-site px-6 pb-10 pt-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <Wordmark className="h-[26px] w-auto" title="T4XI" />
            <p className="mt-2.5 text-sm tracking-[0.02em] text-stone-subtle">Arrive composed.</p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-stone-subtle">
              Premium taxivervoer in Amsterdam en Rotterdam. Tesla Model Y en
              Lynk &amp; Co 01. Vaste prijzen, 24/7 beschikbaar.
            </p>
            <div className="mt-5 flex gap-2.5">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  {...(s.external ? { target: "_blank", rel: "noopener" } : {})}
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
              Vaste prijs vooraf — geen taxameter, geen surge pricing.
            </p>
          </div>

          <nav aria-label="Diensten">
            <p className="text-eyebrow font-medium uppercase text-stone">Diensten</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><Link href="/diensten" className="text-stone-subtle hover:text-white">Schiphol vervoer</Link></li>
              <li><Link href="/diensten" className="text-stone-subtle hover:text-white">Zakelijk vervoer</Link></li>
              <li><Link href="/diensten" className="text-stone-subtle hover:text-white">Privéritten</Link></li>
              <li><Link href="/diensten" className="text-stone-subtle hover:text-white">Evenementen</Link></li>
              <li><Link href="/dagtochten" className="text-stone-subtle hover:text-white">Dagtochten</Link></li>
              <li><Link href="/producten" className="text-stone-subtle hover:text-white">Memberships</Link></li>
            </ul>
          </nav>

          <nav aria-label="T4XI">
            <p className="text-eyebrow font-medium uppercase text-stone">T4XI</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><Link href="/#vloot" className="text-stone-subtle hover:text-white">Ons wagenpark</Link></li>
              <li><Link href="/diensten" className="text-stone-subtle hover:text-white">Voor bedrijven</Link></li>
              <li><Link href="/partner" className="text-stone-subtle hover:text-white">Partner worden</Link></li>
              {/* "Mijn account" verwijderd: /klant is afgesloten tot er echte
                  authenticatie is (Sprint 11, Fase 0 — zie middleware.ts). */}
              <li><Link href="/tarieven" className="text-stone-subtle hover:text-white">Tarieven</Link></li>
              <li><Link href="/over-ons" className="text-stone-subtle hover:text-white">Over ons</Link></li>
              <li><Link href="/boeken" className="text-stone-subtle hover:text-white">Boek een rit</Link></li>
            </ul>
          </nav>

          <div>
            <p className="text-eyebrow font-medium uppercase text-stone">Contact</p>
            <ul className="mt-4 space-y-2.5 text-sm text-stone-subtle">
              <li className="flex items-center gap-2">
                <Icon name="map-pin" size={15} className="shrink-0 text-stone" />
                Amsterdam &amp; Rotterdam
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
                24/7 beschikbaar
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
            © {new Date().getFullYear()} T4XI.nl — Alle rechten voorbehouden ·
            Onderdeel van {BEDRIJF.rechtspersoon} · KvK {BEDRIJF.kvk}
            {BEDRIJF.btw ? ` · Btw ${BEDRIJF.btw}` : ""}
          </p>
          <nav aria-label="Juridisch" className="flex gap-4">
            <Link href="/privacy" className="hover:text-white">Privacyverklaring</Link>
            <Link href="/voorwaarden" className="hover:text-white">Algemene voorwaarden</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
