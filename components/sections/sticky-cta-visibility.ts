"use client";

import { useEffect, type RefObject } from "react";
import {
  anyHidesStickyCta,
  blockUnderStickyBar,
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
/** De balk zelf (voor zijn hoogte) en de metingen die opnieuw moeten als hij verschijnt. */
let barElement: HTMLElement | null = null;
const remeasurers = new Set<() => void>();

/** Mobiele zin (PR 2.6): onder deze breedte telt ook het zinsblok achter de balk. */
const MOBILE_SENTENCE_QUERY = "(max-width: 767px)";

/** StickyCtaBar meldt zich aan, zodat zinnen zijn hoogte kunnen meten. */
export function registerStickyCtaBar(el: HTMLElement | null): void {
  barElement = el;
  remeasurers.forEach((m) => m());
}

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
 * @param blockRef  PR 2.6: het hele zinsblok. Onder 768px wijkt de balk zolang
 *   een deel ervan achter de balk zou liggen (F-14-rest), zodat geen veld en de
 *   hero-knop nooit afgedekt worden. Gemeten bij scroll/resize (passief, één
 *   keer per frame); verbergen verandert de layout niet, dus geen terugkoppeling.
 */
export function useHidesStickyCta(
  actionRef: RefObject<HTMLElement | null>,
  blockRef?: RefObject<HTMLElement | null>
) {
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

    const block = blockRef?.current ?? null;
    const mobile = block && typeof window.matchMedia === "function" ? window.matchMedia(MOBILE_SENTENCE_QUERY) : null;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const under =
        !!block &&
        !!mobile?.matches &&
        !!barElement &&
        blockUnderStickyBar(block.getBoundingClientRect(), window.innerHeight, barElement.offsetHeight);
      if (under !== (state.blockUnderBar === true)) {
        state.blockUnderBar = under;
        emit();
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    if (block) {
      measure();
      remeasurers.add(measure);
      window.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", schedule);
      mobile?.addEventListener("change", schedule);
    }

    return () => {
      io?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      remeasurers.delete(measure);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      mobile?.removeEventListener("change", schedule);
      hiders.delete(id);
      emit();
    };
  }, [actionRef, blockRef]);
}
