"use client";

import { useEffect, type RefObject } from "react";
import {
  anyHidesStickyCta,
  STICKY_CTA_THRESHOLDS,
  type StickyCtaHiderState,
} from "@/lib/hero/hero-visibility";

/**
 * Wanneer wijkt de mobiele StickyCta (F-14)? Alleen als de hero-boekingsactie
 * zichtbaar én bruikbaar is — zie `shouldHideStickyCta`. Een zin meldt zich hier
 * aan via `useHidesStickyCta`; StickyCtaBar luistert mee.
 *
 * Startwaarde = niet verbergen: een net gemounte zin telt pas mee na de eerste
 * meting van de IntersectionObserver of een focus-event.
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

/**
 * @param actionRef de resultaatregel met de hero-CTA (prijs + "Bevestig")
 * @param scopeRef  de hele boekingszin (voor focus binnen de zin)
 */
export function useHidesStickyCta(
  actionRef: RefObject<HTMLElement | null>,
  scopeRef: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    const action = actionRef.current;
    const scope = scopeRef.current;
    if (!action || !scope) return;
    const id = Symbol("sticky-cta-hider");
    const state: StickyCtaHiderState = { resultRatio: 0, focusWithin: scope.contains(document.activeElement) };
    hiders.set(id, state);
    emit();

    const io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            ([entry]) => {
              state.resultRatio = entry.isIntersecting ? entry.intersectionRatio : 0;
              emit();
            },
            { threshold: STICKY_CTA_THRESHOLDS }
          );
    io?.observe(action);

    const onFocusIn = () => {
      state.focusWithin = true;
      emit();
    };
    const onFocusOut = (e: FocusEvent) => {
      state.focusWithin = e.relatedTarget instanceof Node && scope.contains(e.relatedTarget);
      emit();
    };
    scope.addEventListener("focusin", onFocusIn);
    scope.addEventListener("focusout", onFocusOut);

    return () => {
      io?.disconnect();
      scope.removeEventListener("focusin", onFocusIn);
      scope.removeEventListener("focusout", onFocusOut);
      hiders.delete(id);
      emit();
    };
  }, [actionRef, scopeRef]);
}
