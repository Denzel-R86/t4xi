import { Link } from "@/i18n/navigation";
import type { ReactNode } from "react";

type ButtonProps = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "ghost";
  size?: "md" | "xl";
};

/**
 * v14 button-systeem:
 * - primary: accent (#28313B), witte tekst, zachte CTA-schaduw
 * - ghost:   subtiele border op semi-wit vlak
 */
export default function Button({
  href,
  children,
  variant = "primary",
  size = "md",
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 font-display font-medium tracking-wide rounded-md transition-all duration-200 ease-premium hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]";
  const sizing =
    size === "xl" ? "min-h-[52px] px-10 text-base" : "min-h-[44px] px-6 text-sm";
  const styles =
    variant === "primary"
      ? "bg-accent text-white shadow-cta hover:bg-accent-hover"
      : "border border-line-strong bg-white/60 text-ink hover:bg-white";

  return (
    <Link href={href} className={`${base} ${sizing} ${styles}`}>
      {children}
    </Link>
  );
}
