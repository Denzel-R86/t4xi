"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { registerStickyCtaBar, subscribeStickyCtaHidden } from "@/components/sections/sticky-cta-visibility";

/**
 * Schil van de mobiele StickyCta (F-14). De balk wijkt als de
 * hero-boekingsactie zelf grotendeels in beeld is, en onder 768px ook zolang de
 * hero-zin achter de balk zou liggen (zie `useHidesStickyCta`): de balk dekt
 * nooit een veld, de prijs of "Bevestig" af.
 * Startwaarde (SSR en vóór de eerste meting) = zichtbaar.
 */
export default function StickyCtaBar({
  label,
  className,
  children,
}: {
  label: string;
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Synchronisatie met een externe bron, geen React-state: het attribuut stuurt
  // alleen CSS aan en hoeft geen her-render te veroorzaken.
  useEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    registerStickyCtaBar(bar);
    const unsubscribe = subscribeStickyCtaHidden((hidden) => {
      bar.dataset.hidden = String(hidden);
    });
    return () => {
      unsubscribe();
      registerStickyCtaBar(null);
    };
  }, []);

  // Verborgen = visibility:hidden (via CSS): de links verlaten dan ook de
  // tabvolgorde en de toegankelijkheidsboom, er is geen onzichtbare focus.
  return (
    <div ref={ref} className={`sticky-cta ${className}`} role="complementary" aria-label={label}>
      {children}
    </div>
  );
}
