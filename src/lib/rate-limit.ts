export const MAX_CHECKOUTS_PER_HOUR = 10;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
export const MAX_SIGNUPS_PER_HOUR = 5;

const hits = new Map<string, number[]>();

export function rateLimitKey(eventId: string, ip: string): string {
  return `${eventId}:${ip}`;
}

export function isRateLimited(createdAts: Date[], now: number = Date.now()): boolean {
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const recent = createdAts.filter((d) => d.getTime() > windowStart);
  return recent.length >= MAX_CHECKOUTS_PER_HOUR;
}

export function checkMemoryRateLimit(eventId: string, ip: string, now: number = Date.now()): boolean {
  const key = rateLimitKey(eventId, ip);
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (hits.get(key) ?? []).filter((t) => t > windowStart);
  if (timestamps.length >= MAX_CHECKOUTS_PER_HOUR) {
    hits.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  hits.set(key, timestamps);
  return false;
}

export function clearRateLimitState(): void {
  hits.clear();
  signupHits.clear();
}

const signupHits = new Map<string, number[]>();

export function signupRateLimitKey(ip: string): string {
  return `signup:${ip}`;
}

export function checkSignupRateLimit(ip: string, now: number = Date.now()): boolean {
  const key = signupRateLimitKey(ip);
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (signupHits.get(key) ?? []).filter((t) => t > windowStart);
  if (timestamps.length >= MAX_SIGNUPS_PER_HOUR) {
    signupHits.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  signupHits.set(key, timestamps);
  return false;
}

export function clearSignupRateLimitState(): void {
  signupHits.clear();
}
