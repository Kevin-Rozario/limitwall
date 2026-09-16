import type { Context } from "hono";

import { createMiddleware } from "hono/factory";

import type { RateLimitStore } from "./store/types";
import type { RateLimitAlgorithmConfig, RateLimitResult } from "./types";

import { checkFixedWindow } from "./algorithms/fixed-window";
import { checkLeakyBucket } from "./algorithms/leaky-bucket";
import { checkSlidingWindow } from "./algorithms/sliding-window";
import { checkTokenBucket } from "./algorithms/token-bucket";
import { buildRateLimitHeaders, type HeaderStyle } from "./headers";

/** Full config for `rateLimiter()`: one algorithm's config, plus shared options. */
export type RateLimiterConfig = RateLimitAlgorithmConfig & {
  /** Extracts the identifier to rate limit by (IP, user ID, API key, etc.). */
  identifier: (c: Context) => string;
  store: RateLimitStore;
  /** Required, explicit behavior when the store is unreachable — no silent default. */
  onError: "fail-open" | "fail-closed";
  headerStyle?: HeaderStyle;
  /** Overrides the default 429 JSON body. */
  message?: (c: Context) => Response;
};

/** Resolves the configured limit/capacity, regardless of which algorithm is active. */
function getLimitValue(config: RateLimiterConfig): number {
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
async function runCheck(
  config: RateLimiterConfig,
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

/** Creates a Hono rate-limiting middleware for the given config. */
export function rateLimiter(config: RateLimiterConfig) {
  return createMiddleware(async (c, next) => {
    const identifier = config.identifier(c);

    let result: RateLimitResult;
    try {
      result = await runCheck(config, identifier);
    }
    catch {
      // Store unreachable - do exactly what was explicitly configured.
      if (config.onError === "fail-open") {
        await next();
        return;
      }
      c.status(503);
      return c.json({ error: "Rate limiter unavailable" });
    }

    const headers = buildRateLimitHeaders(
      getLimitValue(config),
      result,
      config.headerStyle,
    );
    for (const [key, value] of Object.entries(headers)) {
      c.header(key, value);
    }

    if (!result.allowed) {
      if (config.message)
        return config.message(c);
      c.status(429);
      return c.json({ error: "Too many requests" });
    }

    await next();
  });
}
