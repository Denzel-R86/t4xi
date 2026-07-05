"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const nav = [
  { href: "/diensten", label: "Diensten" },
  { href: "/tarieven", label: "Tarieven" },
  { href: "/over-ons", label: "Over ons" },
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
    <header className="sticky top-0 z-50 bg-ink text-white">
      <div className="mx-auto flex h-16 max-w-site items-center justify-between px-6">
        <Link
          href="/"
          className="font-display text-xl font-semibold tracking-tight"
          aria-label="T4XI — naar homepage"
        >
          T4<span className="text-stone">X</span>I
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Hoofdnavigatie">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-stone-subtle transition-colors hover:text-white"
            >
              {item.label}
            </Link>
          ))}
          <a
            href="tel:+31634744522"
            className="text-sm font-medium text-white transition-colors hover:text-stone-subtle"
          >
            0634 74 45 22
          </a>
          <Link
            href="/boeken"
            className="inline-flex items-center rounded-full bg-white px-6 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-stone-subtle"
          >
            Boek een rit
          </Link>
        </nav>

        <button
          type="button"
          className="md:hidden text-stone-subtle hover:text-white"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen(!open)}
        >
          <span className="sr-only">{open ? "Menu sluiten" : "Menu openen"}</span>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.5" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.5" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          className="border-t border-ink-hover px-6 py-4 md:hidden"
          aria-label="Mobiele navigatie"
        >
          <ul className="flex flex-col gap-4">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block py-1 text-stone-subtle hover:text-white"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <a href="tel:+31634744522" className="block py-1 font-medium text-white">
                Bel 0634 74 45 22
              </a>
            </li>
            <li className="pt-2">
              <Link
                href="/boeken"
                className="inline-flex items-center rounded-full bg-white px-6 py-2.5 text-sm font-medium text-ink"
                onClick={() => setOpen(false)}
              >
                Boek een rit
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
