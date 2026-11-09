import type { RateLimitStore } from "./store/types";
import type { RateLimitAlgorithmConfig, RateLimitResult } from "./types";

import { checkFixedWindow } from "./algorithms/fixed-window";
import { checkLeakyBucket } from "./algorithms/leaky-bucket";
import { checkSlidingWindow } from "./algorithms/sliding-window";
import { checkTokenBucket } from "./algorithms/token-bucket";

/** How long a store call may take before it counts as a failure. */
export const DEFAULT_TIMEOUT_MS = 1000;

/** Algorithm config plus the store the check should run against. */
export type RunnableConfig = RateLimitAlgorithmConfig & {
  store: RateLimitStore;
  /** Max time to wait for the store, in milliseconds. Defaults to 1000. */
  timeoutMs?: number;
};

/** Resolves the configured limit/capacity, regardless of which algorithm is active. */
export function getLimitValue(config: RateLimitAlgorithmConfig): number {
  switch (config.algorithm) {
    case "tokenBucket":
    case "leakyBucket":
      return config.capacity;
    case "fixedWindow":
    case "slidingWindow":
      return config.limit;
  }
}

/** Rejects if `promise` does not settle within `ms` milliseconds. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Rate limit check timed out after ${ms}ms`)),
      ms,
    );
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Runs the configured algorithm's check function. */
function runAlgorithm(
  config: RunnableConfig,
  identifier: string,
): Promise<RateLimitResult> {
  switch (config.algorithm) {
    case "tokenBucket":
      return checkTokenBucket(config.store, identifier, config);
    case "fixedWindow":
      return checkFixedWindow(config.store, identifier, config);
    case "slidingWindow":
      return checkSlidingWindow(config.store, identifier, config);
    case "leakyBucket":
      return checkLeakyBucket(config.store, identifier, config);
  }
}

/** Runs the configured algorithm's check, failing if the store is too slow. */
export function runCheck(
  config: RunnableConfig,
  identifier: string,
): Promise<RateLimitResult> {
  return withTimeout(
    runAlgorithm(config, identifier),
    config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
}
