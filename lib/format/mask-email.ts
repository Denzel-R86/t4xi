/**
 * E-mailadres gemaskeerd tonen (Experience 2.0 §8): `ro••••@gmail.com`.
 *
 * Doel: de klant herkent zijn adres, een meekijker of schermafbeelding leest het
 * niet volledig. Regels:
 *   · lokaal deel: hoogstens de eerste 2 tekens zichtbaar; bij 1–2 tekens alleen
 *     het eerste, zodat een kort adres nooit volledig zichtbaar is;
 *   · altijd precies 4 maskeertekens, zodat de lengte niet uitlekt;
 *   · domein (ook subdomeinen) blijft staan: daaraan herkent de klant het adres;
 *   · ongeldige invoer → `null` (de aanroeper toont dan niets, nooit de ruwe invoer).
 */

export const MASK = "••••";

const SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function maskEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim();
  if (!SHAPE.test(email)) return null;
  const at = email.lastIndexOf("@");
  const local = Array.from(email.slice(0, at));
  const domain = email.slice(at + 1);
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return null;
  const visible = local.slice(0, local.length <= 2 ? 1 : 2).join("");
  return `${visible}${MASK}@${domain}`;
}
