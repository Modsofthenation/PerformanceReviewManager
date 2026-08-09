/**
 * Workspace password policy + local auth rate limiting.
 * Loopback-bound API still needs attempt budgets (shared machines / local malware).
 */

export const MIN_PASSWORD_LENGTH = 8;
/** Demo-only password used by seed CLI / UI demo mode. Never apply as an API default. */
export const DEMO_PASSWORD = "workbench";

const RATE_WINDOW_MS = 15 * 60_000;
const RATE_MAX_FAILURES = 8;
const RATE_LOCKOUT_MS = 15 * 60_000;

type Bucket = { failures: number[]; lockedUntil: number };

const buckets = new Map<string, Bucket>();

export function validateWorkspacePassword(
  password: unknown,
): { ok: true; password: string } | { ok: false; error: string } {
  if (typeof password !== "string" || password.length === 0) {
    return { ok: false, error: "password required" };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    };
  }
  return { ok: true, password };
}

function prune(bucket: Bucket, now: number) {
  bucket.failures = bucket.failures.filter((t) => now - t < RATE_WINDOW_MS);
}

/** Returns an error message when locked out; otherwise null. */
export function checkAuthRateLimit(key: string): string | null {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket) return null;
  if (bucket.lockedUntil > now) {
    const secs = Math.max(1, Math.ceil((bucket.lockedUntil - now) / 1000));
    return `Too many attempts. Try again in ${secs}s.`;
  }
  prune(bucket, now);
  return null;
}

export function recordAuthFailure(key: string) {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { failures: [], lockedUntil: 0 };
  prune(bucket, now);
  bucket.failures.push(now);
  if (bucket.failures.length >= RATE_MAX_FAILURES) {
    bucket.lockedUntil = now + RATE_LOCKOUT_MS;
  }
  buckets.set(key, bucket);
}

export function clearAuthFailures(key: string) {
  buckets.delete(key);
}

/** Test helper — reset in-memory counters. */
export function resetAuthRateLimitsForTests() {
  buckets.clear();
}
