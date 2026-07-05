"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";

const nav = [
  { href: "/#vloot", label: "Vloot", icon: "car" },
  { href: "/diensten", label: "Diensten", icon: "briefcase" },
  { href: "/tarieven", label: "Tarieven", icon: "credit-card" },
  { href: "/dagtochten", label: "Dagtochten", icon: "map-pin" },
  { href: "/partner", label: "Partner", icon: "users" },
  { href: "/over-ons", label: "Over ons", icon: "user" },
];

export default function Header() {
  const [open, setOpen] = useState(false);

  // Escape sluit het mobiele menu
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-fog/95 shadow-nav backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-site items-center gap-4 px-4 md:px-6 lg:h-[68px]">
        <Link
          href="/"
          className="font-display text-[22px] font-extrabold tracking-[3px] text-ink"
          aria-label="T4XI — naar homepage"
        >
          T<span className="text-stone">4</span>XI
        </Link>

        <nav className="hidden items-center gap-1 lg:flex lg:pl-6" aria-label="Hoofdnavigatie">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-sm text-secondary transition-colors hover:bg-ink/5 hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <a
            href="tel:+31634744522"
            className="hidden items-center gap-1.5 text-sm text-secondary transition-colors hover:text-ink sm:flex"
            aria-label="Bel T4XI"
          >
            <Icon name="phone" size={17} />
            <span className="hidden xl:inline">+31 6 34 74 45 22</span>
          </a>
          <a
            href="https://wa.me/31634744522"
            target="_blank"
            rel="noopener"
            aria-label="WhatsApp T4XI"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-whatsapp/10 text-whatsapp transition-transform hover:scale-110 hover:bg-whatsapp/20"
          >
            <Icon name="whatsapp" size={18} />
          </a>
          <Link
            href="/boeken"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-xs font-medium tracking-wide text-white shadow-cta transition-colors hover:bg-accent-hover"
          >
            <Icon name="calendar-check" size={15} />
            Boek een rit
          </Link>

          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-md text-ink hover:bg-ink/5 lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen(!open)}
          >
            <span className="sr-only">{open ? "Menu sluiten" : "Menu openen"}</span>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {open ? (
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.5" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.5" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          className="border-t border-line bg-card px-4 py-3 shadow-card lg:hidden"
          aria-label="Mobiele navigatie"
        >
          <ul className="flex flex-col gap-0.5">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 rounded-md px-3 py-3 text-secondary hover:bg-fog hover:text-ink"
                  onClick={() => setOpen(false)}
                >
                  <Icon name={item.icon} size={18} className="text-stone" />
                  {item.label}
                </Link>
              </li>
            ))}
            <li aria-hidden="true" className="my-2 h-px bg-line" />
            <li>
              <a
                href="tel:+31634744522"
                className="flex items-center gap-3 rounded-md px-3 py-3 text-sm text-secondary hover:bg-fog hover:text-ink"
              >
                <Icon name="phone" size={18} className="text-stone" />
                +31 6 34 74 45 22
              </a>
            </li>
            <li>
              <a
                href="https://wa.me/31634744522"
                target="_blank"
                rel="noopener"
                className="flex items-center gap-3 rounded-md px-3 py-3 text-sm text-whatsapp hover:bg-fog"
              >
                <Icon name="whatsapp" size={18} />
                WhatsApp ons
              </a>
            </li>
            <li className="py-3">
              <Link
                href="/boeken"
                className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-6 text-sm font-medium text-white shadow-cta"
                onClick={() => setOpen(false)}
              >
                <Icon name="calendar-check" size={16} />
                Boek een rit
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
