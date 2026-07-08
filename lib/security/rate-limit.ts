/**
 * In-memory rate limiting + client-IP helper (Stap 9f) — server-only.
 *
 * Vaste-venster teller per key. Bedoeld als dempende laag tegen spam/misbruik.
 *
 * SERVERLESS CAVEAT: de teller leeft per warme instance. Op Vercel/Netlify met
 * meerdere instances (of na een cold start) is dit GEEN harde garantie — het
 * dempt burst-misbruik per instance. Voor een harde, gedeelde limiet is Upstash
 * Redis of de platform-eigen rate limiting nodig (zie eindrapport).
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 20_000;

export type RateLimitResult = {
  limited: boolean;
  remaining: number;
  retryAfterSec: number;
};

/** Telt één poging voor `key`. Limited zodra `count > max` binnen `windowMs`. */
export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    if (buckets.size > MAX_TRACKED_KEYS) prune(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, remaining: max - 1, retryAfterSec: Math.ceil(windowMs / 1000) };
  }

  bucket.count += 1;
  const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  if (bucket.count > max) return { limited: true, remaining: 0, retryAfterSec };
  return { limited: false, remaining: Math.max(0, max - bucket.count), retryAfterSec };
}

function prune(now: number): void {
  buckets.forEach((v, k) => {
    if (now > v.resetAt) buckets.delete(k);
  });
  if (buckets.size > MAX_TRACKED_KEYS) buckets.clear();
}

/** Beste inschatting van het client-IP (eerste hop uit x-forwarded-for). */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || "unknown";
}
