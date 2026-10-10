/**
 * View Transition hero → /boeken (masterplan §7). JourneyLine en prijs dragen op
 * beide pagina's dezelfde `view-transition-name` (handoff.css), zodat ze van de
 * zin naar het formulier "doorlopen" in plaats van te verdwijnen.
 *
 * De hero navigeert client-side (next-intl `Link`/router), dus de CSS-regel
 * `@view-transition { navigation: auto; }` dekt alleen volledige navigaties.
 * Voor de client-side navigatie wikkelen we de router-push in
 * `document.startViewTransition`; de nieuwe toestand wordt vastgelegd zodra
 * /boeken met handoff gemount is (`signalHandoffLanded`) of na een plafond.
 * Zonder ondersteuning of bij reduced motion: gewone navigatie.
 */
const LANDING_CAP_MS = 1500;

type VTDocument = Document & { startViewTransition?: (update: () => Promise<void>) => unknown };

let pending: (() => void) | null = null;

export function navigateWithHandoffTransition(navigate: () => void): void {
  const doc = document as VTDocument;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (typeof doc.startViewTransition !== "function" || reduce) {
    navigate();
    return;
  }
  doc.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        const timer = window.setTimeout(done, LANDING_CAP_MS);
        function done() {
          window.clearTimeout(timer);
          pending = null;
          resolve();
        }
        pending = done;
        navigate();
      })
  );
}

/** Door /boeken aangeroepen zodra de handoff-weergave in de DOM staat. */
export function signalHandoffLanded(): void {
  pending?.();
}
