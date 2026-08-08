/**
 * T4XI — officieel monogram.
 *
 * Geometrie is 1:1 overgenomen uit het goedgekeurde masterbestand in de
 * T4XI Brand Guide 2026 (Fase 1: Core Identity — 01_Master_Monogram).
 * Volgens de guide ("Gebruik altijd het masterbestand. Nooit reconstrueren.")
 * wordt deze path-data nooit met de hand aangepast. Monochroom op
 * `currentColor`, zodat de omringende tekstkleur bepaalt welke kleurvariant
 * (navy / zwart / wit) wordt getoond.
 *
 * Sitebreed is dit de enige logo-weergave: het monogram staat overal los,
 * zonder ernaast herhaald woordmerk — dat voorkomt een "dubbel logo"-gevoel
 * in smalle contexten zoals de sticky nav.
 */

const MARK_PATHS = [
  "M52 74L92 34H382L342 74Z",
  "M132 88H196V258L132 322Z",
  "M132 362L378 116V312H438L398 352H378V414H314V352H232L272 312H314V220L196 338L172 362Z",
];

type MonogramProps = {
  className?: string;
  /** Toegankelijke naam; als leeg → decoratief (aria-hidden). */
  title?: string;
};

export default function Monogram({ className, title = "T4XI" }: MonogramProps) {
  const a11y = title
    ? { role: "img" as const, "aria-label": title }
    : { "aria-hidden": true as const };

  return (
    <svg viewBox="0 0 512 512" className={className} fill="currentColor" {...a11y}>
      {MARK_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
