"use client";

import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import { useTranslations } from "next-intl";
import Icon from "@/components/ui/Icon";
import type { AddressSuggestion } from "@/components/shared/AddressAutocomplete";
import {
  SUGGESTION_KIND_LABEL_KEY,
  suggestionKind,
  suggestionParts,
} from "@/components/shared/address-suggestions";

/*
 * Mobiele boekingszin (Experience 2.0 PR 2.6, masterplan §6.5): gestapelde
 * "Van / Naar"-regels die een bottom sheet openen met de gedeelde suggesties
 * (PR 2.2). De sheet is een native <dialog> via showModal(): de rest van de
 * pagina is dan inert (HTML "blocked by a modal dialog"), Escape sluit
 * (cancel → close). Alleen presentatie: de waarde, de suggestiebron en de
 * keuze-afhandeling komen van SentencePattern.
 */

/** Type-label + titel + adresregel van één suggestie (zelfde opbouw als AddressAutocomplete). */
export function SuggestionText({ s, active }: { s: AddressSuggestion; active: boolean }) {
  const t = useTranslations("autocomplete");
  const { title, detail } = suggestionParts(s);
  return (
    <>
      <span className={`block text-meta font-semibold uppercase ${active ? "text-white/80" : "text-stone-text"}`}>
        {t(SUGGESTION_KIND_LABEL_KEY[suggestionKind(s)])}
      </span>
      <span className="mt-1 block break-words text-sm font-medium">{title}</span>
      {detail && (
        <span className={`mt-0.5 block break-words text-xs ${active ? "text-white/80" : "text-stone-text"}`}>
          {detail}
        </span>
      )}
    </>
  );
}

/** Eén gestapelde regel ("Van" + waarde) die de sheet opent; alleen < 768px. */
export function SheetTrigger({
  id,
  label,
  value,
  placeholder,
  expanded,
  controls,
  onOpen,
  triggerRef,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  expanded: boolean;
  controls: string;
  onOpen: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const filled = value.trim().length > 0;
  return (
    <button
      ref={triggerRef}
      type="button"
      className="hz-sheet-trigger block w-full border-b border-ink/30 py-2 text-left md:hidden"
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-controls={controls}
      aria-labelledby={filled ? `${id}-label ${id}-value` : `${id}-label`}
      onClick={onOpen}
    >
      <span id={`${id}-label`} className="block font-sans text-xs font-normal leading-5 text-stone-text">
        {label}
      </span>
      {filled ? (
        <span id={`${id}-value`} className="block truncate font-medium text-ink">
          {value}
        </span>
      ) : (
        <span className="block truncate font-normal text-stone-text" aria-hidden="true">
          {placeholder}
        </span>
      )}
    </button>
  );
}

export function AddressSheet({
  id,
  open,
  title,
  inputLabel,
  value,
  placeholder,
  suggestions,
  activeIndex,
  onInput,
  onKeyDown,
  onChoose,
  onClosed,
  returnFocusRef,
}: {
  id: string;
  open: boolean;
  title: string;
  inputLabel: string;
  value: string;
  placeholder: string;
  suggestions: AddressSuggestion[];
  activeIndex: number;
  onInput: (text: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onChoose: (s: AddressSuggestion) => void;
  /** Elke sluiting (Escape, sluitknop, keuze, Enter): de sheet is dicht. */
  onClosed: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const tr = useTranslations("routes");
  const ta = useTranslations("autocomplete");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
      // showModal() focust het eerste element (de sluitknop); het zoekveld
      // hoort de focus te krijgen, zonder dat de pagina erheen scrolt.
      inputRef.current?.focus({ preventScroll: true });
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

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
  }, [returnFocusRef]);

  // Focus-trap: Tab en Shift+Tab blijven binnen de sheet (ook in WebKit, waar
  // Tab knoppen standaard overslaat).
  function trapTab(e: KeyboardEvent<HTMLDialogElement>) {
    if (e.key !== "Tab") return;
    const items = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>("input, button:not([disabled])") ?? []
    );
    if (items.length === 0) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : i >= items.length - 1 ? 0 : i + 1;
    items[next]?.focus();
  }

  const listId = `${id}-listbox`;
  const expanded = open && suggestions.length > 0;

  return (
    <dialog
      ref={dialogRef}
      id={id}
      className="hz-sheet bg-card text-ink shadow-card"
      aria-labelledby={`${id}-title`}
      onKeyDown={trapTab}
    >
      <span className="hz-sheet-handle" aria-hidden="true" />
      <div className="flex items-center justify-between">
        <h2 id={`${id}-title`} className="font-sans text-[17px] font-semibold">
          {title}
        </h2>
        <button
          type="button"
          className="-mr-2 flex h-11 w-11 items-center justify-center rounded-field text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          aria-label={tr("sluiten")}
          onClick={() => dialogRef.current?.close()}
        >
          <Icon name="x" size={20} />
        </button>
      </div>
      <input
        ref={inputRef}
        type="text"
        className="mt-2 min-h-[52px] w-full rounded-field border border-[rgba(31,39,48,0.14)] bg-field px-4 font-display text-[18px] font-medium text-ink placeholder:font-normal placeholder:text-stone-text focus:border-accent focus:bg-white focus:outline-none"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && activeIndex < 0) {
            // Vrije tekst blijft toegestaan: Enter zonder keuze neemt de tekst over.
            e.preventDefault();
            dialogRef.current?.close();
            return;
          }
          onKeyDown(e);
        }}
        aria-label={inputLabel}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
        autoComplete="off"
        enterKeyHint="done"
      />
      <ul
        id={listId}
        role="listbox"
        aria-label={ta("lijstLabel")}
        hidden={!expanded}
        className="hz-sheet-list mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {expanded &&
          suggestions.map((s, i) => {
            const active = i === activeIndex;
            return (
              <li
                key={s.id}
                id={`${listId}-option-${i}`}
                role="option"
                aria-selected={active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChoose(s)}
                className={`flex min-h-11 cursor-pointer flex-col justify-center rounded-field px-4 py-2.5 text-left ${
                  active ? "bg-accent text-white" : "text-ink"
                }`}
              >
                <SuggestionText s={s} active={active} />
              </li>
            );
          })}
      </ul>
    </dialog>
  );
}
