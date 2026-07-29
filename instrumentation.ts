/**
 * Next.js instrumentation — boot-tijd environment-guard.
 *
 * Roept `assertSafeEnvironment()` aan zodra de Node.js-server-runtime start, zodat
 * een fout-geconfigureerde deploy meteen fail-closed weigert te draaien (i.p.v.
 * stil naar de verkeerde Stripe-modus of Supabase-omgeving te praten).
 *
 * BUILD-VEILIG: draait uitsluitend op de Node.js-server-runtime en NIET tijdens
 * `next build`. Zo blijft een lokale build zonder productie-secrets gewoon slagen;
 * de strikte productie-eisen gelden alleen bij een draaiende (productie-)server.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { assertSafeEnvironment } = await import("@/lib/config/environment");
  assertSafeEnvironment();
}
