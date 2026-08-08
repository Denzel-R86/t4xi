import crypto from "node:crypto";
import { hasValidOpsSession } from "@/lib/admin/session";

export async function isAuthorizedAdminRequest(request: Request): Promise<boolean> {
  return hasValidOpsSession(request);
}

export function hasValidOpsCredentials(username: string, password: string): boolean {
  const expectedUser = process.env.OPS_DASHBOARD_USERNAME || process.env.BRAIN_DASHBOARD_USERNAME;
  const expectedPass = process.env.OPS_DASHBOARD_PASSWORD || process.env.BRAIN_DASHBOARD_PASSWORD;
  if (!expectedUser || !expectedPass) return false;
  return safeEqual(username, expectedUser) && safeEqual(password, expectedPass);
}

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}
