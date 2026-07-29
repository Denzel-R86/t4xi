import Stripe from "stripe";
import { assertStripeEnvironment, getAppEnv } from "@/lib/config/environment";

/**
 * DE centrale server-side Stripe-client (betalingen — sprint 1, fundering).
 *
 * SERVER-ONLY: leest STRIPE_SECRET_KEY (geen NEXT_PUBLIC). Nooit importeren in
 * een client component. De sleutel blijft server-side en komt nooit in de
 * client-bundle. (De idiomatische guard `import "server-only"` kan later, net
 * als bij de booking-email-laag.)
 *
 * Lazy singleton op `globalThis`: de client wordt pas bij het eerste gebruik
 * geconstrueerd, niet bij import. Zo breekt een build of een pagina zonder
 * betaling niet wanneer de env (nog) ontbreekt — dezelfde degradatie als de
 * notificatielaag.
 *
 * Waarom `globalThis` en niet een module-scoped `let`: bij Fast Refresh/HMR in
 * development herevalueert Next.js modules, wat bij een module-scoped cache elke
 * reload een nieuwe Stripe-client zou opleveren. `globalThis` overleeft die
 * herevaluatie, dus er blijft één instance. In serverless krijgt elke cold start
 * zijn eigen `globalThis` → precies één client per instance, wat gewenst is.
 *
 * De apiVersion is bewust gepind op de versie waarop deze SDK (stripe v22.3.2)
 * is gebouwd, zodat gedrag reproduceerbaar blijft en niet meebeweegt met de
 * account-default. Testmodus volgt automatisch uit een `sk_test_`-sleutel; deze
 * laag maakt geen onderscheid en bevat geen live/test-schakelaar.
 *
 * Er staat bewust GEEN `as`-cast op deze waarde: het type is `Stripe.ApiVersion`,
 * dus de compiler dwingt af dat de gepinde string een geldige versie van déze
 * SDK is. Een cast zou een verkeerde of verouderde pin stil maskeren.
 */

const API_VERSION: Stripe.LatestApiVersion = "2026-06-24.dahlia";

const globalForStripe = globalThis as unknown as { __t4xiStripe?: Stripe };

/** De centrale Stripe-client. Gooit met een duidelijke melding als de env mist. */
export function getStripeServer(): Stripe {
  const existing = globalForStripe.__t4xiStripe;
  if (existing) return existing;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY ontbreekt. Zet de testsleutel in .env.local (zie .env.example)."
    );
  }
  // Omgevings-guard: weiger een onveilige APP_ENV/secret/publishable-combinatie
  // (bv. live-sleutel in staging, of secret/publishable-modus die uiteenloopt)
  // voordat er ook maar één Stripe-call vertrekt (Sprint 7.5 — FASE D).
  assertStripeEnvironment(getAppEnv(), key, process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  const client = new Stripe(key, {
    apiVersion: API_VERSION,
    typescript: true,
    appInfo: { name: "T4XI", url: "https://t4xi.nl" },
  });
  globalForStripe.__t4xiStripe = client;
  return client;
}

/** Zachte check: is de server-side Stripe-sleutel geconfigureerd? */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
