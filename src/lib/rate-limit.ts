/**
 * Small in-memory rate limiter for login attempts.
 *
 * The server runs a single `next start` process under PM2, so one process-local map
 * covers every request. If the app is ever scaled to multiple instances this has to
 * move to a shared store (the DB or Redis) — until then this keeps password guessing
 * down to a few tries per minute without adding a dependency.
 */

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();

// Stale keys would otherwise accumulate for every IP that ever logged in.
const SWEEP_EVERY_MS = 10 * 60 * 1000;
let lastSweep = Date.now();

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.hits.every((t) => now - t >= windowMs)) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds the caller should wait before trying again. Only meaningful when blocked. */
  retryAfter: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now, windowMs);

  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    const oldest = bucket.hits[0];
    return { allowed: false, retryAfter: Math.ceil((windowMs - (now - oldest)) / 1000) };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { allowed: true, retryAfter: 0 };
}

/** Successful logins shouldn't count against the attempt budget. */
export function clearRateLimit(key: string) {
  buckets.delete(key);
}

/**
 * Best-effort client IP. Behind the nginx reverse proxy the real address arrives in
 * X-Forwarded-For; the leftmost entry is the client. Falls back to a shared bucket so a
 * missing header throttles rather than bypasses.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
