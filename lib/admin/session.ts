const COOKIE_NAME = "t4xi_ops_session";
const MAX_AGE_SECONDS = 12 * 60 * 60;

function secret(): string | null {
  return process.env.OPS_DASHBOARD_PASSWORD || process.env.BRAIN_DASHBOARD_PASSWORD || null;
}

async function signature(timestamp: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(timestamp)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

export async function createOpsSession(now = Date.now()): Promise<string | null> {
  const key = secret();
  if (!key) return null;
  const timestamp = String(Math.floor(now / 1000));
  return `${timestamp}.${await signature(timestamp, key)}`;
}

export async function hasValidOpsSession(request: Request, now = Date.now()): Promise<boolean> {
  const key = secret();
  if (!key) return false;
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  if (!cookie) return false;
  const [timestamp, supplied, extra] = cookie.split(".");
  if (!timestamp || !supplied || extra) return false;
  const issuedAt = Number(timestamp);
  const age = Math.floor(now / 1000) - issuedAt;
  if (!Number.isInteger(issuedAt) || age < 0 || age > MAX_AGE_SECONDS) return false;
  return safeEqual(supplied, await signature(timestamp, key));
}

export const OPS_SESSION_COOKIE = {
  name: COOKIE_NAME,
  maxAge: MAX_AGE_SECONDS,
} as const;
