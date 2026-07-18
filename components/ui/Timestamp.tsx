/**
 * T4XI — Tijdstempel-merkcode (kleine kapitalen, letter-spacing, kastlijntje).
 *
 * Beschikbaar component, bewust NIET decoratief geplaatst. Gebruik het alleen
 * waar echte context bestaat: een route, tijd, geverifieerde reis of
 * boekingsbevestiging (bv. "23:41 — SCHIPHOL → CITY CENTRE").
 *
 * Kleur volgt de semantische variabelen: de tekst neemt `currentColor` over; het
 * kastlijntje gebruikt `text-accent` (huidige navy). Geen Sodium zolang het
 * kleurenschema bevroren is — dat is de light-scheme adaptation, niet de
 * officiële Asphalt/Sodium-master.
 */

type TimestampProps = {
  /** Bv. een tijd "23:41" of label "Geverifieerde reis". */
  time: string;
  /** Bv. een route of plaats "Schiphol → City Centre". */
  context: string;
  className?: string;
};

export default function Timestamp({ time, context, className }: TimestampProps) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.1em] ${className ?? ""}`}
    >
      <span>{time}</span>
      <span aria-hidden="true" className="text-accent">
        —
      </span>
      <span>{context}</span>
    </span>
  );
}
