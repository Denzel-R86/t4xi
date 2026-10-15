import crypto from "node:crypto";
import { hasValidOpsSession } from "@/lib/admin/session";

export async function isAuthorizedAdminRequest(request: Request): Promise<boolean> {
  return hasValidOpsSession(request);
}

export function hasValidOpsCredentials(username: string, password: string): boolean {
  const expectedUser = process.env.OPS_DASHBOARD_USERNAME || process.env.BRAIN_DASHBOARD_USERNAME;
  const expectedPass = process.env.OPS_DASHBOARD_PASSWORD || process.env.BRAIN_DASHBOARD_PASSWORD;
  if (!expectedUser || !expectedPass) return false;
  // Beide vergelijkingen altijd uitvoeren (geen `&&`-kortsluiting): een fout
  // gebruikersnaam mag niet sneller falen dan een fout wachtwoord (F-39).
  const userOk = safeEqual(username, expectedUser);
  const passOk = safeEqual(password, expectedPass);
  return userOk && passOk;
}

/**
 * Constant-time vergelijking zonder lengtelek: beide kanten eerst naar een
 * SHA-256-digest van vaste lengte, dan `timingSafeEqual`. Een directe
 * lengtecheck zou via de responstijd de lengte van het geheim prijsgeven.
 */
function safeEqual(a: string, b: string): boolean {
  const aa = crypto.createHash("sha256").update(a).digest();
  const bb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(aa, bb);
}
