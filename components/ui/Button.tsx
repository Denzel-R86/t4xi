import Link from "next/link";
import type { ReactNode } from "react";

type ButtonProps = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "ghost";
};

/**
 * Primaire CTA: ink (#28313B) met hover #1F2730 en witte tekst.
 * Ghost: border in lijnkleur, ink-tekst.
 */
export default function Button({ href, children, variant = "primary" }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center px-7 py-3.5 text-sm font-medium tracking-wide rounded-full transition-colors duration-200 ease-premium";
  const styles =
    variant === "primary"
      ? "bg-ink text-white hover:bg-ink-hover"
      : "border border-line bg-card text-ink hover:border-stone";

  return (
    <Link href={href} className={`${base} ${styles}`}>
      {children}
    </Link>
  );
}
