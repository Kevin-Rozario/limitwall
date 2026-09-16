/**
 * limitwall - rate limiting middleware for Hono, backed by Redis.
 * Supports fixed window, sliding window, token bucket, and leaky
 * bucket (GCRA) algorithms behind one config-driven middleware.
 */

export { rateLimiter } from "./middleware";
export type { RateLimiterConfig } from "./middleware";

export { RedisStore } from "./store/redis-store";
export { UpstashStore } from "./store/upstash-store";
export type { RateLimitStore } from "./store/types";

export type {
  RateLimitResult,
  RateLimitAlgorithmConfig,
  TokenBucketConfig,
  FixedWindowConfig,
  SlidingWindowConfig,
  LeakyBucketConfig,
} from "./types";

export type { HeaderStyle } from "./headers";
