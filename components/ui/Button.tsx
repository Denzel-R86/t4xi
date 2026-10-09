import { Link } from "@/i18n/navigation";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import {
  BUTTON_ARROW_CLASS,
  buttonClassName,
  isPlainHref,
  type ButtonSize,
  type ButtonVariant,
} from "./button-styles";

/**
 * Button v2 — de enige knop van Experience 2.0 (§3 REPLACE, §5b).
 *
 * Polymorf: met `href` een link (interne paden via de locale-bewuste `Link`,
 * `tel:`/`mailto:`/`https:`/`#…` als gewone `<a>`), zonder `href` een `<button>`.
 * Varianten: `primary` (gevuld in rust), `secondary` (omlijnd), `text`
 * (onderstreping + optionele pijl). Klassen: `./button-styles.ts`; welke actie
 * welke variant krijgt: docs/experience-2.0/design-specs.md §13e.
 *
 * Geadopteerd: hero-boekingszin (PR 2.1, components/booking-sentence/).
 */

type CommonProps = {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Toont een pijl die bij hover/focus 4px meebeweegt; standaard aan bij `text`. */
  arrow?: boolean;
  className?: string;
};

type LinkOnlyProps = Omit<ComponentProps<typeof Link>, "href" | "className" | "children">;
type AnchorOnlyProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className" | "children">;

export type ButtonAsLinkProps = CommonProps & { href: string } & LinkOnlyProps & AnchorOnlyProps;

export type ButtonAsButtonProps = CommonProps & {
  href?: undefined;
  /** Bezig: `aria-busy`, niet klikbaar, label blijft staan (geen spinner). */
  loading?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

export type ButtonProps = ButtonAsLinkProps | ButtonAsButtonProps;

function Content({ children, arrow }: { children: ReactNode; arrow: boolean }) {
  return (
    <>
      <span>{children}</span>
      {arrow ? (
        <span aria-hidden="true" className={BUTTON_ARROW_CLASS}>
          →
        </span>
      ) : null}
    </>
  );
}

export default function Button(props: ButtonProps) {
  if (props.href !== undefined) {
    const { children, variant = "primary", size = "md", fullWidth, arrow, className, href, ...rest } = props;
    // Een link kan niet `disabled` zijn; `aria-disabled` geeft hem de inactieve
    // vorm (§13e). De aanroeper voorkomt zelf de navigatie (onClick).
    const ariaDisabled = rest["aria-disabled"];
    const inactive = ariaDisabled === true || ariaDisabled === "true";
    const classes = buttonClassName({ variant, size, fullWidth, inactive, className });
    const content = <Content arrow={arrow ?? variant === "text"}>{children}</Content>;
    if (isPlainHref(href)) {
      return (
        <a href={href} className={classes} {...(rest as AnchorOnlyProps)}>
          {content}
        </a>
      );
    }
    return (
      <Link href={href} className={classes} {...(rest as LinkOnlyProps)}>
        {content}
      </Link>
    );
  }

  const {
    children,
    variant = "primary",
    size = "md",
    fullWidth,
    arrow,
    className,
    loading = false,
    disabled = false,
    type = "button",
    href: _href,
    ...rest
  } = props;
  void _href;
  const inactive = disabled || loading;
  return (
    <button
      type={type}
      disabled={inactive}
      aria-busy={loading || undefined}
      className={buttonClassName({ variant, size, fullWidth, inactive, className })}
      {...rest}
    >
      <Content arrow={arrow ?? variant === "text"}>{children}</Content>
    </button>
  );
}
