import type { RateLimitStore } from "../store/types";
import type { RateLimitResult, SlidingWindowConfig } from "../types";

import { buildKey } from "../key";

/**
 * Blends the current window's count with a weighted portion of the
 * previous window's count, so traffic can't double up right at a
 * fixed-window boundary.
 *
 * Both window counters live as fields of ONE hash stored at KEYS[1], so
 * the script only touches the key it was given. That keeps it safe on
 * Redis Cluster, where every key a script touches must be declared.
 */
const SLIDING_WINDOW_SCRIPT = `
local limit = tonumber(ARGV[1])
local windowSeconds = tonumber(ARGV[2])

local time = redis.call('TIME')
local now = tonumber(time[1]) + (tonumber(time[2]) / 1000000)

local currentWindow = math.floor(now / windowSeconds)
local elapsedInWindow = now - (currentWindow * windowSeconds)
local weight = (windowSeconds - elapsedInWindow) / windowSeconds

local currentField = 'w' .. currentWindow
local previousField = 'w' .. (currentWindow - 1)

local previousCount = tonumber(redis.call('HGET', KEYS[1], previousField)) or 0
local currentCount = tonumber(redis.call('HGET', KEYS[1], currentField)) or 0

local estimatedTotal = (previousCount * weight) + currentCount + 1
local allowed = estimatedTotal <= limit

if allowed then
  redis.call('HINCRBY', KEYS[1], currentField, 1)
end

-- Drop the counter from two windows ago so the hash never grows.
redis.call('HDEL', KEYS[1], 'w' .. (currentWindow - 2))
redis.call('EXPIRE', KEYS[1], windowSeconds * 2)

local remaining = math.max(0, math.floor(limit - estimatedTotal))
local resetSeconds = math.ceil(windowSeconds - elapsedInWindow)

return { allowed and 1 or 0, remaining, resetSeconds }
`;

/** Runs a sliding window check for one identifier under one rule. */
export async function checkSlidingWindow(
  store: RateLimitStore,
  identifier: string,
  config: SlidingWindowConfig,
): Promise<RateLimitResult> {
  const key = await buildKey(config.ruleName, "slidingwindow", identifier);

  const [allowed, remaining, resetSeconds] = await store.eval<
    [number, number, number]
  >(SLIDING_WINDOW_SCRIPT, [key], [config.limit, config.windowSeconds]);

  return {
    allowed: allowed === 1,
    remaining,
    resetSeconds,
  };
}
