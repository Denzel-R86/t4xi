"use client";

import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";

/*
 * Gedeelde basis van de mobiele bottom sheets in de boekingszin (PR 2.6 adres,
 * PR 2.6b datum/tijd/passagiers/bagage; masterplan §6.5). Native <dialog> via
 * showModal(): de rest van de pagina is inert, Escape sluit (cancel → close).
 * De pagina scrolt niet mee (booking-sentence.css: html:has(.hz-sheet[open]));
 * bij sluiten keert de scrollpositie en de focus terug op de regel.
 */
export function useSheetDialog({
  open,
  dialogRef,
  initialFocusRef,
  returnFocusRef,
  onClosed,
}: {
  open: boolean;
  dialogRef: RefObject<HTMLDialogElement | null>;
  /** Krijgt de focus bij openen (zonder dat de pagina erheen scrolt). */
  initialFocusRef: RefObject<HTMLElement | null>;
  returnFocusRef: RefObject<HTMLElement | null>;
  /** Elke sluiting (Escape, sluitknop, keuze, bevestigen): de sheet is dicht. */
  onClosed: () => void;
}) {
  const savedScroll = useRef<number | null>(null);
  const onClosedRef = useRef(onClosed);
  useEffect(() => {
    onClosedRef.current = onClosed;
  }, [onClosed]);

  // Synchroniseert de open-toestand met de native dialog (extern DOM-systeem).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      savedScroll.current = window.scrollY;
      dialog.showModal();
      // showModal() focust het eerste element (de sluitknop); het bedoelde
      // element krijgt de focus, zonder dat de pagina erheen scrolt.
      initialFocusRef.current?.focus({ preventScroll: true });
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, dialogRef, initialFocusRef]);

  // Native 'close' vuurt voor elke sluitroute (ook Escape → cancel → close).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => {
      const y = savedScroll.current;
      savedScroll.current = null;
      if (y !== null && Math.abs(window.scrollY - y) > 1) window.scrollTo({ top: y, behavior: "instant" });
      returnFocusRef.current?.focus({ preventScroll: true });
      onClosedRef.current();
    };
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [dialogRef, returnFocusRef]);
}

/**
 * Focus-trap: Tab en Shift+Tab blijven binnen de sheet (ook in WebKit, waar
 * Tab knoppen standaard overslaat).
 */
export function trapSheetTab(e: KeyboardEvent<HTMLDialogElement>, dialog: HTMLDialogElement | null) {
  if (e.key !== "Tab") return;
  const items = Array.from(
    dialog?.querySelectorAll<HTMLElement>("input, select, button:not([disabled])") ?? []
  );
  if (items.length === 0) return;
  e.preventDefault();
  const i = items.indexOf(document.activeElement as HTMLElement);
  const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : i >= items.length - 1 ? 0 : i + 1;
  items[next]?.focus();
}
