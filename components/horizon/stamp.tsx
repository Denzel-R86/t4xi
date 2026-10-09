import type { ReactNode } from "react";

/** Gegraveerde regel in de merkcode-opmaak (tijdstempel / feitregel). */
export function Stamp({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={`text-[11px] font-medium uppercase tracking-[0.14em] text-secondary [font-variant-numeric:tabular-nums] ${className}`}
    >
      {children}
    </p>
  );
}

/** Het kastlijntje in een Stamp. */
export function Dash() {
  return (
    <span aria-hidden="true" className="px-2 text-stone">
      —
    </span>
  );
}
