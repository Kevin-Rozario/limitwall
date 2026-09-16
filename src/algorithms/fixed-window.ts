import type { RateLimitStore } from "../store/types";
import type { FixedWindowConfig, RateLimitResult } from "../types";

import { buildKey } from "../key";

/**
 * Counts requests within a fixed time slot and resets when the slot's
 * TTL expires. Simplest algorithm; allows a burst right at the window
 * boundary - use sliding window if that's a problem for your use case.
 */
const FIXED_WINDOW_SCRIPT = `
local limit = tonumber(ARGV[1])
local windowSeconds = tonumber(ARGV[2])

local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], windowSeconds)
end

local ttl = redis.call('TTL', KEYS[1])
local allowed = current <= limit
local remaining = math.max(0, limit - current)

return { allowed and 1 or 0, remaining, ttl }
`;

/** Runs a fixed window check for one identifier under one rule. */
export async function checkFixedWindow(
  store: RateLimitStore,
  identifier: string,
  config: FixedWindowConfig,
): Promise<RateLimitResult> {
  const key = await buildKey(config.ruleName, "fixedwindow", identifier);

  const [allowed, remaining, ttl] = await store.eval<[number, number, number]>(
    FIXED_WINDOW_SCRIPT,
    [key],
    [config.limit, config.windowSeconds],
  );

  return {
    allowed: allowed === 1,
    remaining,
    resetSeconds: ttl,
  };
}
