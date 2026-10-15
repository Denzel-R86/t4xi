import crypto from "node:crypto";
import { peekRateLimit, rateLimit } from "@/lib/security/rate-limit";

/**
 * Brute-force-rem voor de ops-login (F-39), gebouwd op lib/security/rate-limit.ts.
 *
 * Twee lagen, elk per IP én per gebruikersnaam:
 *   1. Pogingenlimiet: elke loginpoging telt (ook geslaagde) → 429. Per IP doet de
 *      route dat zelf als eerste stap (vóór het lezen van de body); per
 *      gebruikersnaam gebeurt het hier.
 *   2. Lockout: alleen MISLUKTE pogingen tellen, in vaste vensters.
 *      · per IP progressief: 5 fouten in 15 min → dicht tot dat venster afloopt;
 *        10 in 1 uur → tot het uur om is; 20 in 24 uur → tot de dag om is.
 *      · per gebruikersnaam alleen de eerste stap: 5 fouten in 15 min, dus nooit
 *        langer dan 15 min dicht (eigenaarsbesluit #91: het ene gedeelde ops-account
 *        mag niet een uur of een dag te blokkeren zijn).
 *      De lockout wordt VÓÓR de wachtwoordcheck gelezen, dus ook het juiste
 *      wachtwoord helpt niet tijdens een lockout (anders blijft raden zinvol).
 *      Pogingen tijdens een lockout worden NIET als fout geteld en de vensters zijn
 *      vast (resetAt verschuift nooit): het einde van een lockout schuift niet op.
 *
 * Gebruikersnamen worden gehasht als sleutel: geen ruwe invoer in het geheugen en
 * een vaste sleutellengte. Bekende en onbekende namen gaan door exact hetzelfde
 * pad, zodat de lockout niet verraadt of een naam bestaat.
 *
 * IN-MEMORY PER INSTANCE (F-37, besluit B6): op Vercel heeft elke warme instance
 * eigen tellers en een cold start wist ze. Dit dempt brute force per instance; een
 * harde, gedeelde limiet vraagt de gedeelde store uit B6. MFA (Control Sprint 1)
 * blijft de compenserende maatregel voor Control; de legacy ops-login heeft die niet.
 */

export const LOGIN_ATTEMPTS = { max: 10, windowMs: 60_000 } as const;

/** Lockout-stappen per IP (progressief). */
export const IP_LOCKOUT_TIERS = [
  { max: 5, windowMs: 15 * 60_000 },
  { max: 10, windowMs: 60 * 60_000 },
  { max: 20, windowMs: 24 * 60 * 60_000 },
] as const;

/** Lockout per gebruikersnaam: één stap, maximaal 15 minuten. */
export const USER_LOCKOUT_TIERS = [{ max: 5, windowMs: 15 * 60_000 }] as const;
export const USER_LOCKOUT_MAX_MS = 15 * 60_000;

export type LoginGate = { allowed: true } | { allowed: false; retryAfterSec: number };

type Tier = { max: number; windowMs: number };

function userSubject(username: string): string {
  return `user:${crypto.createHash("sha256").update(username.trim().toLowerCase()).digest("hex").slice(0, 32)}`;
}

function lockouts(ip: string, username: string): { subject: string; tiers: readonly Tier[] }[] {
  return [
    { subject: `ip:${ip}`, tiers: IP_LOCKOUT_TIERS },
    { subject: userSubject(username), tiers: USER_LOCKOUT_TIERS },
  ];
}

/** Telt de poging per gebruikersnaam en kijkt of IP of gebruikersnaam in lockout zit. */
export function checkOpsLogin(ip: string, username: string): LoginGate {
  const attempt = rateLimit(`ops-login:${userSubject(username)}`, LOGIN_ATTEMPTS.max, LOGIN_ATTEMPTS.windowMs);
  let retryAfterSec = attempt.limited ? attempt.retryAfterSec : 0;
  for (const { subject, tiers } of lockouts(ip, username)) {
    tiers.forEach((tier, level) => {
      // peek: lezen telt niet, dus herhaald proberen tijdens een lockout verlengt niets.
      const lock = peekRateLimit(`ops-login-fail:${level}:${subject}`, tier.max);
      if (lock.limited) retryAfterSec = Math.max(retryAfterSec, lock.retryAfterSec);
    });
  }
  return retryAfterSec > 0 ? { allowed: false, retryAfterSec } : { allowed: true };
}

/** Registreert een mislukte login (alleen na een echte wachtwoordcheck) voor IP en naam. */
export function recordOpsLoginFailure(ip: string, username: string): void {
  for (const { subject, tiers } of lockouts(ip, username)) {
    tiers.forEach((tier, level) => {
      rateLimit(`ops-login-fail:${level}:${subject}`, tier.max, tier.windowMs);
    });
  }
}
