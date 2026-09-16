/**
 * Result of a single rate limit check, normalized across all algorithms.
 *
 * `remaining` and `resetSeconds` are the standard pair used for the
 * RateLimit-* headers. `retryAfterSeconds` is only set by pacing-based
 * algorithms (leaky bucket) on rejection, since GCRA answers "how long
 * until you can try again" rather than "how many are left" - and maps
 * directly onto the standard HTTP `Retry-After` header.
 */
export interface RateLimitResult {
  /** Whether this request is allowed to proceed. */
  allowed: boolean;
  /** Count remaining. Set by fixed window, sliding window, token bucket. */
  remaining?: number;
  /** Seconds until this key's limit meaningfully resets or refills. */
  resetSeconds: number;
  /** Seconds to wait before retrying. Only set by leaky bucket (GCRA) on rejection. */
  retryAfterSeconds?: number;
}

/** Fields every algorithm's config shares. */
interface BaseAlgorithmConfig {
  /** Unique name for this rule; namespaces its Redis keys from other rules. */
  ruleName: string;
  /** Cost of a single request, in whatever unit the algorithm counts. Defaults to 1. */
  cost?: number;
}

export interface TokenBucketConfig extends BaseAlgorithmConfig {
  algorithm: "tokenBucket";
  /** Maximum tokens the bucket can hold (max burst size). */
  capacity: number;
  /** Tokens added back to the bucket per second. */
  refillRate: number;
}

export interface FixedWindowConfig extends BaseAlgorithmConfig {
  algorithm: "fixedWindow";
  /** Max requests allowed per window. */
  limit: number;
  /** Length of the window, in seconds. */
  windowSeconds: number;
}

export interface SlidingWindowConfig extends BaseAlgorithmConfig {
  algorithm: "slidingWindow";
  /** Max requests allowed per window. */
  limit: number;
  /** Length of the window, in seconds. */
  windowSeconds: number;
}

export interface LeakyBucketConfig extends BaseAlgorithmConfig {
  algorithm: "leakyBucket";
  /** Max burst size allowed above the steady rate. */
  capacity: number;
  /** Sustained requests allowed per second. */
  rate: number;
}

/**
 * Discriminated union of every algorithm's config, tagged by `algorithm`.
 * Picking `algorithm: "tokenBucket"` requires `capacity` + `refillRate`;
 * TypeScript rejects the wrong field set for whichever algorithm is chosen.
 */
export type RateLimitAlgorithmConfig =
  | TokenBucketConfig
  | FixedWindowConfig
  | SlidingWindowConfig
  | LeakyBucketConfig;
