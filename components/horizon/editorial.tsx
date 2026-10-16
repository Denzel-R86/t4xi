import { Reveal } from "@/components/horizon/motion";
import JourneyLine from "@/components/horizon/JourneyLine";

/**
 * HORIZON v2 — homepage editorial (Experience 2.0 PR 3.1, masterplan §3/§11).
 *
 *   QuietProofPattern — korte, vaststaande regels naast een verticale JourneyLine
 *   PrinciplesPattern — genummerde service principles: typografie + hairlines, geen kaarten
 *
 * Server-renderbaar. Beweging alleen via `Reveal` (werkwoord Reveal; reduced motion en
 * zonder JS = direct zichtbaar, horizon.css). Geen serif: dit zijn claims, geen Brand
 * Mode-koppen (B1, design-specs §13f). Welke regels hier komen bepaalt
 * `lib/home/editorial-claims.ts` (claims-check §0c). Regels: docs/design-system/README.md.
 */

export function QuietProofPattern({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <section data-editorial="quiet-proof" className="px-[5vw] py-16 md:py-24">
      <div className="mx-auto grid max-w-site grid-cols-[auto_minmax(0,1fr)] gap-x-6 md:grid-cols-12 md:gap-x-6">
        <Reveal className="flex md:col-start-2 md:justify-center">
          {/* De regels staan ernaast als tekst → lijn is decoratief (aria-hidden). */}
          <JourneyLine orientation="vertical" size="display" state="route" decorative className="h-full" />
        </Reveal>
        <ul className="flex flex-col gap-10 md:col-span-9 md:col-start-3 md:gap-14">
          {lines.map((line, i) => (
            <li key={line}>
              <Reveal delay={(Math.min(i + 1, 3) as 1 | 2 | 3)}>
                <p className="font-display text-display-statement font-semibold text-ink">{line}</p>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Kolommen per aantal principes: nooit een lege kolom of een wees-item (besluit #98). */
const PRINCIPLE_COLUMNS: Record<number, string> = {
  1: "",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-2 xl:grid-cols-4",
};

export function PrinciplesPattern({
  label,
  kicker,
  principles,
}: {
  /** Toegankelijke naam van de sectie. */
  label: string;
  /** Zichtbare sectiekop (h2), in kickerstijl. */
  kicker: string;
  principles: { title: string; text: string }[];
}) {
  if (principles.length === 0) return null;
  return (
    <section data-editorial="principles" aria-label={label} className="bg-overlay px-[5vw] py-16 md:py-24">
      <div className="mx-auto max-w-site">
        <Reveal>
          <h2 className="flex items-center gap-3.5 text-[11px] font-medium uppercase tracking-[0.16em] text-stone-text">
            <span aria-hidden="true" className="h-px w-8 bg-ink" />
            {kicker}
          </h2>
        </Reveal>
        <ol className={`mt-10 grid gap-x-8 gap-y-12 ${PRINCIPLE_COLUMNS[principles.length] ?? "md:grid-cols-2 xl:grid-cols-4"}`}>
          {principles.map((p, i) => (
            <li key={p.title}>
              <Reveal delay={(Math.min(i, 3) as 0 | 1 | 2 | 3)}>
                <div className="border-t border-ink pt-6">
                  {/* Volgorde staat al in <ol>; het cijfer is typografie. */}
                  <span aria-hidden="true" className="block text-meta text-stone-text [font-variant-numeric:tabular-nums]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-5 font-display text-display-md font-semibold text-ink">{p.title}</h3>
                  <p className="mt-4 max-w-sm text-[15px] leading-7 text-stone-text">{p.text}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
