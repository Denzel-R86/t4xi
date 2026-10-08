/**
 * Button v2 — klassen als data (Experience 2.0 §3, §5, §5b).
 *
 * Staat in `components/` (niet `lib/`) omdat Tailwind alleen `app/` en
 * `components/` scant; klassen moeten hier volledig uitgeschreven staan.
 *
 * Regels:
 * - Precies drie stijlen: primary · secondary · text (§5b: max. 3 knopstijlen).
 * - Geen `hover:-translate-y`, geen `scale` (§3, §5b).
 * - Primary is GEVULD in rust (ink, fog-tekst); omlijnd is alleen secondary
 *   (besluit eigenaar, PR #60). Vulling bij hover/focus horizontaal (links →
 *   rechts) via `scaleX`, 280ms (`--hz-ui`) op `--hz-ease`.
 * - Kleuren alleen tokens (ink/fog/overlay/accent-light/line-strong); tekst
 *   nooit `text-stone` (F-11). Mapping actie → variant:
 *   docs/experience-2.0/design-specs.md § "Button-varianten".
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
  // Gevuld in rust (ook op touch, zonder hover): fog op ink = 13,64:1.
  // Hover/focus/active: horizontale vulling links → rechts met accent-light
  // (fog op #3A4652 = 8,71:1). Tekst blijft fog, dus contrast nooit < 8,71:1.
  primary: [
    "overflow-hidden border border-ink bg-ink text-fog",
    "before:absolute before:inset-0 before:-z-10 before:origin-left before:scale-x-0 before:bg-accent-light",
    "before:transition-transform before:duration-[var(--hz-ui,280ms)]",
    "before:ease-[var(--hz-ease,cubic-bezier(0.22,1,0.36,1))]",
    "hover:before:scale-x-100 focus-visible:before:scale-x-100 active:before:scale-x-100",
    "motion-reduce:before:transition-none",
  ].join(" "),
  // Omlijnd = alleen secundair: ink-kader, ink-tekst (13,64:1 op fog). Hover:
  // lichte horizontale vulling (overlay, ink-tekst 12,61:1) — nooit donker,
  // zodat secondary nooit op een primary gaat lijken.
  secondary: [
    "overflow-hidden border border-ink text-ink",
    "before:absolute before:inset-0 before:-z-10 before:origin-left before:scale-x-0 before:bg-overlay",
    "before:transition-transform before:duration-[var(--hz-ui,280ms)]",
    "before:ease-[var(--hz-ease,cubic-bezier(0.22,1,0.36,1))]",
    "hover:before:scale-x-100 focus-visible:before:scale-x-100 active:before:scale-x-100",
    "motion-reduce:before:transition-none",
  ].join(" "),
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

/** Uitgeschakeld/bezig: vervangt de variantklassen (geen vulling-animatie,
 *  geen hover). Duidelijk anders dan actief — primary verliest zijn donkere
 *  vulling — maar leesbaar: `stone-text` op overlay 4,86:1, op fog 5,26:1.
 *  Nooit `text-stone` (F-11). */
const INACTIVE: Record<ButtonVariant, string> = {
  primary: "cursor-not-allowed border border-line-strong bg-overlay text-stone-text",
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
