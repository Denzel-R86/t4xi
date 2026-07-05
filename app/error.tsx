"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Alleen digest loggen — geen stack traces of gebruikersdata naar console in productie
    console.error("Onverwachte fout", error.digest ?? "");
  }, [error]);

  return (
    <section className="mx-auto max-w-site px-6 py-24 text-center">
      <p className="text-eyebrow font-medium uppercase text-stone-text">Fout</p>
      <h1 className="mt-3 font-display text-display-lg font-semibold text-ink">
        Er ging iets mis
      </h1>
      <p className="mx-auto mt-4 max-w-md text-secondary">
        Probeer het opnieuw. Blijft het misgaan, bel ons dan — we helpen je
        direct verder.
      </p>
      <div className="mt-8 flex justify-center gap-4">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-ink px-7 py-3.5 text-sm font-medium text-white transition-colors hover:bg-ink-hover"
        >
          Probeer opnieuw
        </button>
        <a
          href="tel:+31634744522"
          className="rounded-full border border-line bg-card px-7 py-3.5 text-sm font-medium text-ink hover:border-stone"
        >
          Bel 0634 74 45 22
        </a>
      </div>
    </section>
  );
}
