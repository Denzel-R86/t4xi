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
