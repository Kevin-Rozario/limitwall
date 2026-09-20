/**
 * limitwall - rate limiting middleware for Hono, backed by Redis.
 * Supports fixed window, sliding window, token bucket, and leaky
 * bucket (GCRA) algorithms behind one config-driven middleware.
 */

export { checkFixedWindow } from "./algorithms/fixed-window";
export { checkLeakyBucket } from "./algorithms/leaky-bucket";

export { checkSlidingWindow } from "./algorithms/sliding-window";
// The algorithm check functions themselves have no Hono dependency -
// they only need a store and an identifier string - so they're exported
// directly for use outside Hono (plain Node scripts, other frameworks,
// background jobs, etc.), not just through the `rateLimiter` middleware.
export { checkTokenBucket } from "./algorithms/token-bucket";
export type { HeaderStyle } from "./headers";

export { rateLimiter } from "./middleware";
export type { RateLimiterConfig } from "./middleware";
export { NodeRedisStore } from "./store/redis-store";
export type { RateLimitStore } from "./store/types";

export { UpstashRedisStore } from "./store/upstash-store";

export type {
  FixedWindowConfig,
  LeakyBucketConfig,
  RateLimitAlgorithmConfig,
  RateLimitResult,
  SlidingWindowConfig,
  TokenBucketConfig,
} from "./types";
