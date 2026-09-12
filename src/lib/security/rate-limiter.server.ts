// Upstash Redis-backed rate limiter with circuit breaker (server-only).
//
// The .server.ts extension guarantees this module never reaches the client
// bundle (TanStack import-protection).
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;
function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

type LimiterKey = "ai" | "api" | "auth" | "iot";

const _cache: Partial<Record<LimiterKey, Ratelimit>> = {};

function buildLimiter(key: LimiterKey): Ratelimit | null {
  if (_cache[key]) return _cache[key]!;
  const redis = getRedis();
  if (!redis) return null;
  const config: Record<
    LimiterKey,
    { limiter: ReturnType<typeof Ratelimit.slidingWindow>; prefix: string }
  > = {
    ai: { limiter: Ratelimit.slidingWindow(10, "10 s"), prefix: "eletricai:rl:ai" },
    api: { limiter: Ratelimit.slidingWindow(60, "60 s"), prefix: "eletricai:rl:api" },
    auth: { limiter: Ratelimit.slidingWindow(5, "15 m"), prefix: "eletricai:rl:auth" },
    iot: { limiter: Ratelimit.slidingWindow(120, "60 s"), prefix: "eletricai:rl:iot" },
  };
  const cfg = config[key];
  const rl = new Ratelimit({ redis, limiter: cfg.limiter, analytics: true, prefix: cfg.prefix });
  _cache[key] = rl;
  return rl;
}

// ---- Circuit breaker (per-instance) ----
const BREAKER_THRESHOLD = 3; // consecutive Upstash errors → open
const BREAKER_OPEN_MS = 30_000; // stay open 30s before half-open retry

interface BreakerState {
  failures: number;
  openedAt: number; // 0 = closed
}
const _breaker: BreakerState = { failures: 0, openedAt: 0 };

export function getRateLimiterBreaker(): {
  state: "closed" | "open" | "half-open";
  failures: number;
  openedAt: number;
  msUntilRetry: number;
} {
  if (_breaker.openedAt === 0) {
    return { state: "closed", failures: _breaker.failures, openedAt: 0, msUntilRetry: 0 };
  }
  const elapsed = Date.now() - _breaker.openedAt;
  if (elapsed >= BREAKER_OPEN_MS) {
    return {
      state: "half-open",
      failures: _breaker.failures,
      openedAt: _breaker.openedAt,
      msUntilRetry: 0,
    };
  }
  return {
    state: "open",
    failures: _breaker.failures,
    openedAt: _breaker.openedAt,
    msUntilRetry: BREAKER_OPEN_MS - elapsed,
  };
}

function breakerIsOpen(): boolean {
  if (_breaker.openedAt === 0) return false;
  if (Date.now() - _breaker.openedAt >= BREAKER_OPEN_MS) return false; // half-open: try again
  return true;
}
function breakerOnSuccess() {
  _breaker.failures = 0;
  _breaker.openedAt = 0;
}
function breakerOnFailure() {
  _breaker.failures += 1;
  if (_breaker.failures >= BREAKER_THRESHOLD) {
    _breaker.openedAt = Date.now();
  }
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
  limit: number;
  /** True when Upstash is not configured / breaker open / errored — caller falls back. */
  bypassed: boolean;
  source: "upstash" | "unconfigured" | "breaker-open" | "upstash-error";
}

export async function checkRateLimit(
  key: LimiterKey,
  identifier: string,
): Promise<RateLimitResult> {
  const rl = buildLimiter(key);
  if (!rl) {
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: -1,
      limit: -1,
      bypassed: true,
      source: "unconfigured",
    };
  }
  if (breakerIsOpen()) {
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: -1,
      limit: -1,
      bypassed: true,
      source: "breaker-open",
    };
  }
  try {
    const { success, reset, remaining, limit } = await rl.limit(identifier);
    breakerOnSuccess();
    return {
      allowed: success,
      retryAfterSeconds: success ? 0 : Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
      remaining,
      limit,
      bypassed: false,
      source: "upstash",
    };
  } catch (err) {
    breakerOnFailure();
    console.error("[rate-limiter] Upstash error (breaker tripping):", err);
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: -1,
      limit: -1,
      bypassed: true,
      source: "upstash-error",
    };
  }
}
