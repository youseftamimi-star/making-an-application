// Simple in-memory fixed-window limiter. Fine for a single server process;
// use Redis or similar if you run several app instances.
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  h.count++;
  return h.count <= max;
}

// Failure counter: blocks a key after `max` failures within `windowMs` (successes don't count).
const failures = new Map<string, { count: number; resetAt: number }>();

export function isBlocked(key: string, max: number): boolean {
  const f = failures.get(key);
  return !!f && f.resetAt > Date.now() && f.count >= max;
}

export function recordFailure(key: string, windowMs: number) {
  const now = Date.now();
  const f = failures.get(key);
  if (!f || f.resetAt < now) failures.set(key, { count: 1, resetAt: now + windowMs });
  else f.count++;
}

export function clearFailures(key: string) {
  failures.delete(key);
}
