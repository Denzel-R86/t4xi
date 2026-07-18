/**
 * T4XI — Interval-woordmerk (definitieve masters, 1:1 gereproduceerd).
 *
 * Geometrie, verhoudingen en spatiëring zijn EXACT overgenomen uit de officiële
 * masters (t4xi-wordmark-compact-master.svg / t4xi-wordmark-hero-master.svg) en
 * worden niet aangepast. Het merk is monochroom lijnwerk op `currentColor`, dus
 * het neemt de omringende tekstkleur over (semantische kleurvariabelen) — geen
 * hardcoded kleuren.
 *
 *   • compact (default) — zonder horizon; header, footer, kleine toepassingen.
 *   • withHorizon       — hero-lockup mét horizon; alleen als aparte variant
 *                         voor expliciete merkmomenten.
 */

type WordmarkProps = {
  className?: string;
  /** Hero-lockup mét horizon. Default = compact (zonder horizon). */
  withHorizon?: boolean;
  /** Toegankelijke naam; als leeg → decoratief (aria-hidden). */
  title?: string;
};

export default function Wordmark({ className, withHorizon = false, title = "T4XI" }: WordmarkProps) {
  const a11y = title
    ? { role: "img" as const, "aria-label": title }
    : { "aria-hidden": true as const };

  if (withHorizon) {
    // Hero lockup master — viewBox 0 0 400 150, translate(46,22). Exact.
    return (
      <svg viewBox="0 0 400 150" className={className} fill="none" {...a11y}>
        <g transform="translate(46,22)" stroke="currentColor">
          <line x1="0" y1="4.2" x2="62" y2="4.2" strokeWidth="8.4" />
          <line x1="31" y1="0" x2="31" y2="98.5" strokeWidth="9" />
          <line x1="136" y1="0" x2="68.35" y2="100" strokeWidth="8.7" />
          <line x1="90" y1="68" x2="153" y2="68" strokeWidth="8.4" />
          <line x1="136" y1="0" x2="136" y2="98.5" strokeWidth="9" />
          <line x1="186.5" y1="0" x2="243" y2="98.5" strokeWidth="8.7" />
          <line x1="239.5" y1="0" x2="183" y2="98.5" strokeWidth="8.7" />
          <line x1="272" y1="0" x2="272" y2="98.5" strokeWidth="9" />
          <line x1="68.35" y1="100" x2="306.5" y2="100" strokeWidth="3" />
        </g>
      </svg>
    );
  }

  // Compact master — viewBox 0 0 400 140, translate(46,20). Exact (diagonaal tot 84%).
  return (
    <svg viewBox="0 0 400 140" className={className} fill="none" {...a11y}>
      <g transform="translate(46,20)" stroke="currentColor">
        <line x1="0" y1="4.2" x2="62" y2="4.2" strokeWidth="8.4" />
        <line x1="31" y1="0" x2="31" y2="100" strokeWidth="9" />
        <line x1="136" y1="0" x2="79.2" y2="84" strokeWidth="8.7" />
        <line x1="90" y1="68" x2="153" y2="68" strokeWidth="8.4" />
        <line x1="136" y1="0" x2="136" y2="100" strokeWidth="9" />
        <line x1="186.5" y1="0" x2="243" y2="100" strokeWidth="8.7" />
        <line x1="239.5" y1="0" x2="183" y2="100" strokeWidth="8.7" />
        <line x1="272" y1="0" x2="272" y2="100" strokeWidth="9" />
      </g>
    </svg>
  );
}
