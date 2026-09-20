import type { RateLimitStore } from "../store/types";
import type { RateLimitResult, TokenBucketConfig } from "../types";
import { buildKey } from "../key";

/**
 * Lazily refills a bucket of tokens based on elapsed time, entirely
 * inside one atomic Redis operation. See the module README for the
 * plain-language walkthrough of the algorithm.
 */
const TOKEN_BUCKET_SCRIPT = `
local capacity   = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local cost       = tonumber(ARGV[3])

local time = redis.call('TIME')
local now = tonumber(time[1])

local bucket = redis.call('HMGET', KEYS[1], 'tokens', 'lastRefill')
local tokens = tonumber(bucket[1])
local lastRefill = tonumber(bucket[2])

if tokens == nil then
  tokens = capacity
  lastRefill = now
end

local elapsed = now - lastRefill
tokens = math.min(capacity, tokens + (elapsed * rate))

local allowed = tokens >= cost
if allowed then
  tokens = tokens - cost
end

redis.call('HMSET', KEYS[1], 'tokens', tokens, 'lastRefill', now)
redis.call('EXPIRE', KEYS[1], math.ceil(capacity / rate))

-- Redis truncates Lua numbers to integers on return, silently dropping
-- the fractional part - return as a string to preserve partial-refill precision.
return { allowed and 1 or 0, tostring(tokens) }
`;

/** Runs a token bucket check for one identifier under one rule. */
export async function checkTokenBucket(
  store: RateLimitStore,
  identifier: string,
  config: TokenBucketConfig,
): Promise<RateLimitResult> {
  const key = await buildKey(config.ruleName, "tokenbucket", identifier);
  const cost = config.cost ?? 1;

  const [allowed, tokensRemainingRaw] = await store.eval<[number, string]>(
    TOKEN_BUCKET_SCRIPT,
    [key],
    [config.capacity, config.rate, cost],
  );

  const tokensRemaining = Number.parseFloat(tokensRemainingRaw);

  const resetSeconds = Math.ceil(
    (config.capacity - tokensRemaining) / config.rate,
  );

  return {
    allowed: allowed === 1,
    remaining: tokensRemaining,
    resetSeconds: Math.max(0, resetSeconds),
  };
}
