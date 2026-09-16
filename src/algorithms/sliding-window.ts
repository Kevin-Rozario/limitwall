import type { RateLimitStore } from "../store/types";
import type { RateLimitResult, SlidingWindowConfig } from "../types";
import { buildKey } from "../key";

/**
 * Blends the current window's count with a weighted portion of the
 * previous window's count, so traffic can't double up right at a
 * fixed-window boundary.
 */
const SLIDING_WINDOW_SCRIPT = `
local limit = tonumber(ARGV[1])
local windowSeconds = tonumber(ARGV[2])

local time = redis.call('TIME')
local now = tonumber(time[1])

local currentWindow = math.floor(now / windowSeconds)
local previousWindow = currentWindow - 1

local currentKey = KEYS[1] .. ':' .. currentWindow
local previousKey = KEYS[1] .. ':' .. previousWindow

local previousCount = tonumber(redis.call('GET', previousKey)) or 0
local elapsedInWindow = now % windowSeconds
local weight = (windowSeconds - elapsedInWindow) / windowSeconds

local currentCount = redis.call('INCR', currentKey)
if currentCount == 1 then
  redis.call('EXPIRE', currentKey, windowSeconds * 2)
end

local estimatedTotal = (previousCount * weight) + currentCount
local allowed = estimatedTotal <= limit

if not allowed then
  redis.call('DECR', currentKey)
end

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
