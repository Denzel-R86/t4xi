import crypto from "node:crypto";
import { hasValidOpsSession } from "@/lib/admin/session";

export async function isAuthorizedAdminRequest(request: Request): Promise<boolean> {
  if (await hasValidOpsSession(request)) return true;
  const expectedUser = process.env.OPS_DASHBOARD_USERNAME || process.env.BRAIN_DASHBOARD_USERNAME;
  const expectedPass = process.env.OPS_DASHBOARD_PASSWORD || process.env.BRAIN_DASHBOARD_PASSWORD;
  if (!expectedUser || !expectedPass) return false;
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return false;
  let decoded = "";
  try { decoded = Buffer.from(header.slice(6), "base64").toString("utf8"); } catch { return false; }
  const separator = decoded.indexOf(":");
  if (separator < 0) return false;
  return safeEqual(decoded.slice(0, separator), expectedUser) && safeEqual(decoded.slice(separator + 1), expectedPass);
}

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}
