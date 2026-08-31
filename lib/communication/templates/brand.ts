/**
 * Merkbasis voor alle uitgaande communicatie.
 *
 * Palet, contactgegevens en afzenders stonden los in `booking-email.ts`,
 * `lead-email.ts` en `invoice-email.ts` — drie kopieën die uit elkaar konden
 * gaan lopen. Eén bron zorgt dat een contactformulier, een boekingsbevestiging
 * en een factuur van hetzelfde merk blijven klinken.
 *
 * Puur en server-veilig: leest alleen env in de functies onderaan, nooit bij
 * import, zodat de renderers offline testbaar blijven.
 */

export const BRAND = {
  name: "T4XI",
  site: "t4xi.nl",
  monogramUrl: "https://www.t4xi.nl/t4xi-monogram-navy.png",
  phoneDisplay: "+31 6 34 74 45 22",
  phoneHref: "+31634744522",
  whatsapp: "https://wa.me/31634744522",
  email: "booking@t4xi.nl",
} as const;

/** Horizon-palet. Licht thema is definitief; mails hebben geen donkere variant. */
export const PALETTE = {
  ink: "#1F2730",
  accent: "#28313B",
  fog: "#F5F3F1",
  overlay: "#EEEAE5",
  stone: "#999694",
  muted: "#5F666D",
  border: "#E6E2DC",
  /** Uitsluitend voor interne urgentie; komt nooit in klantcommunicatie. */
  alarm: "#9B2C1B",
} as const;

/**
 * Sandbox-afzender. Resend levert hiermee alleen aan het eigen account-adres;
 * echte klantlevering vereist `RESEND_FROM` op het geverifieerde domein.
 */
export const DEFAULT_FROM = "T4XI <onboarding@resend.dev>";
export const DEFAULT_OPS = "booking@t4xi.nl";

export function fromAddress(): string {
  return process.env.RESEND_FROM || DEFAULT_FROM;
}

export function opsAddress(): string {
  return process.env.OPS_EMAIL || DEFAULT_OPS;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
