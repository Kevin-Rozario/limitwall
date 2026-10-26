import type { RateLimitStore } from "./store/types";
import type { RateLimitAlgorithmConfig, RateLimitResult } from "./types";

import { checkFixedWindow } from "./algorithms/fixed-window";
import { checkLeakyBucket } from "./algorithms/leaky-bucket";
import { checkSlidingWindow } from "./algorithms/sliding-window";
import { checkTokenBucket } from "./algorithms/token-bucket";

/** Algorithm config plus the store the check should run against. */
export type RunnableConfig = RateLimitAlgorithmConfig & {
  store: RateLimitStore;
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

/** Runs the configured algorithm's check function. */
export async function runCheck(
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
