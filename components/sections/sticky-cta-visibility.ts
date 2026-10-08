"use client";

import { useEffect, type RefObject } from "react";
import {
  anyHidesStickyCta,
  latestResultRatio,
  STICKY_CTA_THRESHOLDS,
  type StickyCtaHiderState,
} from "@/lib/hero/hero-visibility";

/**
 * Wanneer wijkt de mobiele StickyCta (F-14)? Alleen als de hero-boekingsactie
 * (resultaatregel met de hero-knop) grotendeels in beeld is — zie
 * `shouldHideStickyCta`. Een zin meldt zich hier
 * aan via `useHidesStickyCta`; StickyCtaBar luistert mee.
 *
 * Startwaarde = niet verbergen: een net gemounte zin telt pas mee na de eerste
 * meting van de IntersectionObserver.
 */
const hiders = new Map<symbol, StickyCtaHiderState>();
const listeners = new Set<(hidden: boolean) => void>();

function emit() {
  const hidden = anyHidesStickyCta(hiders.values());
  listeners.forEach((l) => l(hidden));
}

export function subscribeStickyCtaHidden(listener: (hidden: boolean) => void): () => void {
  listeners.add(listener);
  listener(anyHidesStickyCta(hiders.values()));
  return () => {
    listeners.delete(listener);
  };
}

/** @param actionRef de resultaatregel met de hero-CTA (prijs + "Bevestig") */
export function useHidesStickyCta(actionRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const action = actionRef.current;
    if (!action) return;
    const id = Symbol("sticky-cta-hider");
    const state: StickyCtaHiderState = { resultRatio: 0 };
    hiders.set(id, state);
    emit();

    const io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              state.resultRatio = latestResultRatio(entries, state.resultRatio);
              emit();
            },
            { threshold: STICKY_CTA_THRESHOLDS }
          );
    io?.observe(action);

    return () => {
      io?.disconnect();
      hiders.delete(id);
      emit();
    };
  }, [actionRef]);
}
