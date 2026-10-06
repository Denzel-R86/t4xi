"use client";

import { useEffect, type RefObject } from "react";

/**
 * Wanneer wijkt de mobiele StickyCta (F-14)? Zolang een element dat zelf de
 * boekingshandeling draagt (de hero-zin) in beeld is. Dat element meldt zich
 * hier aan via `useHidesStickyCta`; StickyCtaBar luistert mee.
 *
 * Een net gemount element telt meteen als "in beeld" tot de IntersectionObserver
 * zijn eerste meting geeft, zodat de balk bij hydratie of terugnavigatie niet
 * eerst verschijnt en dan wegschuift.
 */
const inView = new Map<symbol, boolean>();
const listeners = new Set<(hidden: boolean) => void>();

function isHidden() {
  for (const v of inView.values()) if (v) return true;
  return false;
}
function emit() {
  const hidden = isHidden();
  listeners.forEach((l) => l(hidden));
}

export function subscribeStickyCtaHidden(listener: (hidden: boolean) => void): () => void {
  listeners.add(listener);
  listener(isHidden());
  return () => {
    listeners.delete(listener);
  };
}

export function useHidesStickyCta(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const id = Symbol("sticky-cta-hider");
    inView.set(id, true);
    emit();
    const io = new IntersectionObserver(([entry]) => {
      inView.set(id, entry.isIntersecting);
      emit();
    });
    io.observe(el);
    return () => {
      io.disconnect();
      inView.delete(id);
      emit();
    };
  }, [ref]);
}
