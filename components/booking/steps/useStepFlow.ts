import { useCallback, useEffect, useRef, useState } from "react";
import {
  BOOKING_FIELD_ID,
  BOOKING_FIELD_STEP,
  fieldForElementId,
  nativeValidityKey,
  type BookingField,
  type BookingStep,
  type FieldMessageKey,
} from "@/lib/booking/steps";
import type { FieldErrorState } from "./fields";

/** Focusbaar element van een veld (adresvelden: het invoerveld binnen de wrapper). */
function focusableFor(field: BookingField): HTMLElement | null {
  const el = document.getElementById(BOOKING_FIELD_ID[field]);
  if (!el) return null;
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) return el;
  return el.querySelector<HTMLElement>("input, select");
}

type FocusTarget = { kind: "field"; field: BookingField } | { kind: "heading" } | null;

/**
 * Stapweergave + veldfouten van het boekingsformulier (PR 2.4). Raakt geen
 * boekingsdata: alleen welke stap zichtbaar is, welke fout bij welk veld staat
 * en waar de focus heen gaat (F-13: na een fout naar het eerste foutieve veld).
 */
export function useStepFlow({
  initialStep,
  translate,
  onFieldError,
}: {
  initialStep: BookingStep;
  translate: (key: FieldMessageKey) => string;
  /** Wordt aangeroepen zodra een veldfout getoond wordt (bv. algemene melding wissen). */
  onFieldError: () => void;
}) {
  const [step, setStep] = useState<BookingStep>(initialStep);
  // Pas na de eerste stapwissel animeren (niet bij het laden van de pagina).
  const [animate, setAnimate] = useState(false);
  const [fieldError, setFieldError] = useState<FieldErrorState>(null);
  // Focusdoel als ref (geen render nodig); de teller laat het effect na render lopen.
  const focusTarget = useRef<FocusTarget>(null);
  const [focusTick, setFocusTick] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const headingRefs = useRef<Partial<Record<BookingStep, HTMLHeadingElement | null>>>({});
  const panelRefs = useRef<Partial<Record<BookingStep, HTMLDivElement | null>>>({});

  /** Veldfout tonen: naar de stap van dat veld, melding bij het veld, focus erop. */
  const showFieldError = useCallback(
    (field: BookingField, message: string) => {
      onFieldError();
      setFieldError({ field, message });
      setStep(BOOKING_FIELD_STEP[field]);
      focusTarget.current = { kind: "field", field };
      setFocusTick((n) => n + 1);
    },
    [onFieldError]
  );

  const goTo = useCallback((target: BookingStep) => {
    setAnimate(true);
    setStep(target);
    focusTarget.current = { kind: "heading" };
    setFocusTick((n) => n + 1);
  }, []);

  // Focus volgt de stap of de eerste fout. Synchronisatie met de DOM ná render
  // (het veld kan net zichtbaar zijn geworden) — daarom een effect.
  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    focusTarget.current = null;
    const el = target.kind === "field" ? focusableFor(target.field) : headingRefs.current[step] ?? null;
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "center" });
    }
  }, [focusTick, step]);

  // Native constraint-validatie (`required`, `type=email`, `min`/`max`) blijft de
  // browser doen; we vangen alleen de melding af en tonen die bij het veld. Het
  // `invalid`-event bubbelt niet, dus een capture-listener op het formulier.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    let batch: HTMLInputElement[] = [];
    function onInvalid(e: Event) {
      e.preventDefault(); // geen browserballon: de fout staat bij het veld
      if (batch.length === 0) {
        queueMicrotask(() => {
          const first = batch[0];
          batch = [];
          const field = first ? fieldForElementId(first.id) : null;
          if (!first || !field) return;
          const key = nativeValidityKey(first.validity, field);
          showFieldError(field, key ? translate(key) : first.validationMessage);
        });
      }
      batch.push(e.target as HTMLInputElement);
    }
    form.addEventListener("invalid", onInvalid, true);
    return () => form.removeEventListener("invalid", onInvalid, true);
  }, [showFieldError, translate]);

  /** Typen in het foutieve veld haalt de melding weg. */
  function clearFieldErrorOnInput(e: React.FormEvent<HTMLFormElement>) {
    if (!fieldError) return;
    const el = document.getElementById(BOOKING_FIELD_ID[fieldError.field]);
    if (el && (el === e.target || el.contains(e.target as Node))) setFieldError(null);
  }

  /** Native constraints van de velden in een stap; `false` = er is een fout getoond. */
  function stepControlsValid(target: BookingStep): boolean {
    const controls = panelRefs.current[target]?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select") ?? [];
    // checkValidity vuurt `invalid` → de listener hierboven toont en focust.
    return Array.from(controls).every((control) => control.checkValidity());
  }

  return {
    step,
    animate,
    fieldError,
    formRef,
    headingRefs,
    panelRefs,
    showFieldError,
    goTo,
    clearFieldErrorOnInput,
    stepControlsValid,
  };
}
