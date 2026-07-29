import { loadStripe, type Stripe } from "@stripe/stripe-js";

/**
 * DE centrale browser-Stripe-loader (stap 7.3). CLIENT-ONLY.
 *
 *   · `loadStripe()` wordt maximaal ÉÉN keer aangeroepen (gememoïseerd).
 *   · Uitsluitend de PUBLISHABLE key (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY). Er komt
 *     nooit een secret key in de browser.
 *   · Ontbreekt de key in DEVELOPMENT → afwijzende promise met een duidelijke
 *     melding, zodat de ontwikkelaar het meteen ziet (niet gecachet, zodat het na
 *     het toevoegen van de key opnieuw lukt).
 *   · Ontbreekt de key in PRODUCTIE → `resolve(null)`: de UI toont een nette
 *     configuratiefout in plaats van te crashen met een stacktrace.
 *   · Nooit op de server initialiseren: dit hoort in client components.
 *
 * ── Client-side env/mode-guard (Sprint 7.5 — FASE 3) ─────────────────────────
 * Defense-in-depth: een LIVE publishable key (pk_live_) buiten productie wordt
 * geweigerd. Deze module is BEWUST zelfstandig — hij importeert geen server-guard
 * en kent alleen NODE_ENV (client-side beschikbaar) en de niet-geheime publishable
 * key. Zo lekt er nooit een server-secret naar de browser-bundle.
 *
 * BEPERKING: in een staging-deploy is NODE_ENV=production in de browser, dus deze
 * client-check ziet staging als productie en vangt daar géén pk_live. Die situatie
 * wordt HARD server-side afgevangen door assertStripeEnvironment (APP_ENV is daar
 * de autoriteit). De client-check dekt de lokale `next dev`-vergissing (NODE_ENV=
 * development) + pk_live af. De primaire bescherming is dus de server-bootstrap;
 * dit is de aanvullende laag met de kleinste kans op secret-leakage.
 *
 * De factory is los getest; `getStripe` is de productie-instantie.
 */
export function createStripeLoader(
  load: (key: string) => Promise<Stripe | null>,
  getKey: () => string | undefined,
  isProduction: boolean
): () => Promise<Stripe | null> {
  let cached: Promise<Stripe | null> | null = null;
  return () => {
    if (cached) return cached;
    const key = getKey();
    // Onveilige combinatie: live publishable key buiten productie. Niet cachen,
    // zodat het na correctie van de env opnieuw kan slagen. Geen keywaarde in de
    // melding.
    if (key && !isProduction && key.startsWith("pk_live_")) {
      return Promise.reject(new Error("Unsafe Stripe environment configuration."));
    }
    if (!key) {
      if (!isProduction) {
        return Promise.reject(
          new Error(
            "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ontbreekt. Zet de publishable test-key in .env.local (zie .env.example)."
          )
        );
      }
      console.error("[stripe-client] publishable key ontbreekt in productie — betaalscherm valt terug op een configuratiefout.");
      cached = Promise.resolve(null);
      return cached;
    }
    cached = load(key);
    return cached;
  };
}

/** Gememoïseerde loader voor de app. Eén `loadStripe` per browsersessie. */
export const getStripe = createStripeLoader(
  loadStripe,
  () => process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  process.env.NODE_ENV === "production"
);
