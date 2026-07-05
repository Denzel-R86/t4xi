import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-ink text-white">
      <div className="mx-auto max-w-site px-6 py-14">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <p className="font-display text-lg font-semibold">
              T4<span className="text-stone">X</span>I
            </p>
            <p className="mt-2 max-w-xs text-sm text-stone-subtle">
              Premium taxi &amp; elektrische mobiliteit. Arrive with confidence.
            </p>
          </div>
          <nav aria-label="Footer navigatie">
            <p className="text-eyebrow font-medium uppercase text-stone">Menu</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link href="/diensten" className="text-stone-subtle hover:text-white">Diensten</Link></li>
              <li><Link href="/tarieven" className="text-stone-subtle hover:text-white">Tarieven</Link></li>
              <li><Link href="/over-ons" className="text-stone-subtle hover:text-white">Over ons</Link></li>
              <li><Link href="/boeken" className="text-stone-subtle hover:text-white">Boek een rit</Link></li>
            </ul>
          </nav>
          <div>
            <p className="text-eyebrow font-medium uppercase text-stone">Contact</p>
            <ul className="mt-3 space-y-2 text-sm text-stone-subtle">
              <li>Almere, Nederland</li>
              <li><a href="tel:+31634744522" className="hover:text-white">0634 74 45 22</a></li>
              <li><a href="mailto:info@t4xi.nl" className="hover:text-white">info@t4xi.nl</a></li>
            </ul>
          </div>
        </div>
        <p className="mt-12 text-xs text-stone">
          © {new Date().getFullYear()} T4XI · Onderdeel van Noir Driving Services
        </p>
      </div>
    </footer>
  );
}
