/**
 * Button v2 — klassen als data (Experience 2.0 §3, §5, §5b).
 *
 * Staat in `components/` (niet `lib/`) omdat Tailwind alleen `app/` en
 * `components/` scant; klassen moeten hier volledig uitgeschreven staan.
 *
 * Regels:
 * - Precies drie stijlen: primary · secondary · text (§5b: max. 3 knopstijlen).
 * - Geen `hover:-translate-y`, geen `scale` (§3, §5b).
 * - Primary: de Confirm-vulling van `.hz-confirm-btn`, maar horizontaal
 *   (links → rechts) via `scaleX`, 280ms (`--hz-ui`) op `--hz-ease`.
 * - Kleuren alleen `ink`/`fog`/`line-strong`; tekst nooit `text-stone` (F-11).
 * - Aanraakdoel ≥ 44px (`min-h-11`), focus altijd zichtbaar.
 * - Reduced motion: vulling en pijl springen direct, geen transitie.
 */

export type ButtonVariant = "primary" | "secondary" | "text";
export type ButtonSize = "md" | "lg";

const EASE = "ease-[var(--hz-ease,cubic-bezier(0.22,1,0.36,1))]";

const BASE = [
  "group relative isolate inline-flex min-h-11 items-center justify-center gap-2",
  "font-medium uppercase tracking-[0.14em] no-underline",
  "transition-colors duration-[var(--hz-ui,280ms)]",
  EASE,
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
  "motion-reduce:transition-none",
].join(" ");

const VARIANTS: Record<ButtonVariant, string> = {
  primary: [
    "overflow-hidden border border-ink text-ink",
    "before:absolute before:inset-0 before:-z-10 before:origin-left before:scale-x-0 before:bg-ink",
    "before:transition-transform before:duration-[var(--hz-ui,280ms)]",
    "before:ease-[var(--hz-ease,cubic-bezier(0.22,1,0.36,1))]",
    "hover:text-fog hover:before:scale-x-100",
    "focus-visible:text-fog focus-visible:before:scale-x-100",
    "active:text-fog active:before:scale-x-100",
    "motion-reduce:before:transition-none",
  ].join(" "),
  secondary: "border border-line-strong text-ink hover:border-ink focus-visible:border-ink",
  text: [
    "text-ink",
    "after:absolute after:inset-x-0 after:bottom-2 after:h-px after:origin-left after:scale-x-0 after:bg-ink",
    "after:transition-transform after:duration-[var(--hz-micro,160ms)]",
    "after:ease-[var(--hz-ease,cubic-bezier(0.22,1,0.36,1))]",
    "hover:after:scale-x-100 focus-visible:after:scale-x-100",
    "motion-reduce:after:transition-none",
  ].join(" "),
};

const SIZES: Record<ButtonVariant, Record<ButtonSize, string>> = {
  primary: { md: "px-7 py-3 text-[12px]", lg: "min-h-[52px] px-10 py-4 text-[13px]" },
  secondary: { md: "px-7 py-3 text-[12px]", lg: "min-h-[52px] px-10 py-4 text-[13px]" },
  // Geen kader: horizontale ruimte klein, hoogte blijft 44px voor touch.
  text: { md: "px-1 text-[12px]", lg: "px-1 text-[13px]" },
};

/** Uitgeschakeld/bezig: vervangt de variantklassen (geen vulling, geen
 *  onderstreping, geen hover). WCAG 1.4.3 zondert inactieve bediening uit,
 *  maar de tekst blijft `stone-text` (5,3:1) zodat hij leesbaar is. */
const INACTIVE: Record<ButtonVariant, string> = {
  primary: "cursor-not-allowed border border-line-strong text-stone-text",
  secondary: "cursor-not-allowed border border-line-strong text-stone-text",
  text: "cursor-not-allowed text-stone-text",
};

/** Pijl bij `text` (en optioneel elders): 4px richting bij hover/focus (§5 micro). */
export const BUTTON_ARROW_CLASS =
  "inline-block transition-transform duration-[var(--hz-micro,160ms)] ease-[var(--hz-ease,cubic-bezier(0.22,1,0.36,1))] group-hover:translate-x-1 group-focus-visible:translate-x-1 motion-reduce:transition-none";

export function buttonClassName({
  variant = "primary",
  size = "md",
  fullWidth = false,
  inactive = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  inactive?: boolean;
  className?: string;
} = {}): string {
  return [
    BASE,
    inactive ? INACTIVE[variant] : VARIANTS[variant],
    SIZES[variant][size],
    fullWidth ? "w-full" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Alles met een schema (`tel:`, `https:`), protocol-relatief of een anker gaat
 *  buiten de locale-router om en wordt een gewone `<a>`. */
export function isPlainHref(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#") || href.startsWith("//");
}
