import Link from "next/link";
import Icon from "@/components/ui/Icon";

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
            <p className="font-display text-[22px] font-extrabold tracking-[3px]">
              T<span className="text-stone">4</span>XI
            </p>
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
            <p className="mt-5 flex items-center gap-2 text-sm text-stone-subtle" aria-label="Google beoordeling">
              <span className="tracking-[2px] text-stone-subtle">★★★★★</span>
              4.9 — 127 reviews
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
              <li><Link href="/klant" className="text-stone-subtle hover:text-white">Mijn account</Link></li>
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

        <p className="mt-14 border-t border-white/10 pt-6 text-xs text-stone">
          © {new Date().getFullYear()} T4XI.nl — Alle rechten voorbehouden ·
          Onderdeel van Noir Driving Services
        </p>
      </div>
    </footer>
  );
}
