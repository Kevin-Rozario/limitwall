import type { Redis } from "@upstash/redis";
import type { RateLimitStore } from "./types";

/**
 * Store backend for edge/serverless runtimes (Cloudflare Workers, Deno,
 * Vercel Edge) via Upstash's REST API, which needs no persistent
 * connection. Use RedisStore instead on regular Node servers.
 *
 * Note: unlike ioredis, the Upstash SDK has no built-in script-caching
 * mechanism equivalent to `defineCommand` — every call sends the full
 * script text over HTTP. This is an accepted tradeoff for edge runtimes,
 * not a bug: REST-over-HTTP has per-call overhead regardless.
 */
export class UpstashStore implements RateLimitStore {
  private readonly client: Redis;

  constructor(options: { client: Redis }) {
    this.client = options.client;
  }

  async eval<T>(
    script: string,
    keys: string[],
    args: (string | number)[],
  ): Promise<T> {
    const result = await this.client.eval(script, keys, args);
    return result as T;
  }
}
