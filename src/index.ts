/**
 * limitwall - rate limiting middleware for Hono, backed by Redis.
 * Supports fixed window, sliding window, token bucket, and leaky
 * bucket (GCRA) algorithms behind one config-driven middleware.
 */

export { rateLimiter } from "./middleware";
export type { RateLimiterConfig } from "./middleware";

export { NodeRedisStore } from "./store/redis-store";
export { UpstashRedisStore } from "./store/upstash-store";
export type { RateLimitStore } from "./store/types";

// The algorithm check functions themselves have no Hono dependency -
// they only need a store and an identifier string - so they're exported
// directly for use outside Hono (plain Node scripts, other frameworks,
// background jobs, etc.), not just through the `rateLimiter` middleware.
export { checkTokenBucket } from "./algorithms/token-bucket";
export { checkFixedWindow } from "./algorithms/fixed-window";
export { checkSlidingWindow } from "./algorithms/sliding-window";
export { checkLeakyBucket } from "./algorithms/leaky-bucket";

export type {
  RateLimitResult,
  RateLimitAlgorithmConfig,
  TokenBucketConfig,
  FixedWindowConfig,
  SlidingWindowConfig,
  LeakyBucketConfig,
} from "./types";

export type { HeaderStyle } from "./headers";
