import type { RateLimitStore } from "../store/types";
import type { RateLimitResult, LeakyBucketConfig } from "../types";
import { buildKey } from "../key";

/**
 * Implements leaky bucket as GCRA (Generic Cell Rate Algorithm): tracks
 * one "theoretical arrival time" per identifier instead of a token
 * count, producing smooth, evenly-paced traffic rather than the bursty
 * traffic token bucket allows.
 */
const LEAKY_BUCKET_SCRIPT = `
local capacity = tonumber(ARGV[1])
local rate     = tonumber(ARGV[2])
local cost     = tonumber(ARGV[3])

local emissionInterval = 1 / rate
local burstOffset = emissionInterval * capacity

local time = redis.call('TIME')
local now = tonumber(time[1]) + (tonumber(time[2]) / 1000000)

local tat = tonumber(redis.call('GET', KEYS[1]))
if tat == nil or tat < now then
  tat = now
end

local newTat = tat + (emissionInterval * cost)
local allowAt = newTat - burstOffset
local allowed = allowAt <= now

if allowed then
  redis.call('SET', KEYS[1], newTat, 'EX', math.ceil(burstOffset + emissionInterval))
  return { 1, 0 }
else
  return { 0, allowAt - now }
end
`;

/** Runs a leaky bucket (GCRA) check for one identifier under one rule. */
export async function checkLeakyBucket(
  store: RateLimitStore,
  identifier: string,
  config: LeakyBucketConfig,
): Promise<RateLimitResult> {
  const key = await buildKey(config.ruleName, "leakybucket", identifier);
  const cost = config.cost ?? 1;

  const [allowed, waitSeconds] = await store.eval<[number, number]>(
    LEAKY_BUCKET_SCRIPT,
    [key],
    [config.capacity, config.rate, cost],
  );

  const isAllowed = allowed === 1;

  return {
    allowed: isAllowed,
    resetSeconds: Math.ceil(waitSeconds),
    retryAfterSeconds: isAllowed ? undefined : Math.ceil(waitSeconds),
  };
}
