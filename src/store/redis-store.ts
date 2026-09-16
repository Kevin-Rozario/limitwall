import type { Redis } from "ioredis";
import type { RateLimitStore } from "./types";

/**
 * Store backend for regular Node.js servers, backed by a persistent
 * connection via `ioredis`. Not for edge runtimes — use UpstashStore
 * there instead, since ioredis depends on Node's networking APIs.
 *
 * Registers each unique script once via `defineCommand`, so ioredis
 * automatically uses the cached `EVALSHA` form after the first call
 * instead of resending the full script text every request.
 */
export class RedisStore implements RateLimitStore {
  private readonly client: Redis;
  private readonly definedCommands = new Set<string>();

  constructor(options: { client: Redis }) {
    this.client = options.client;
  }

  async eval<T>(
    script: string,
    keys: string[],
    args: (string | number)[],
  ): Promise<T> {
    const commandName = "limitwall_" + hashScript(script);

    if (!this.definedCommands.has(commandName)) {
      this.client.defineCommand(commandName, {
        numberOfKeys: keys.length,
        lua: script,
      });
      this.definedCommands.add(commandName);
    }

    // @ts-expect-error - commandName is registered dynamically above
    const result = await this.client[commandName](...keys, ...args.map(String));
    return result as T;
  }
}

/** Cheap, stable identifier for a script's text - not cryptographic, just needs to be unique per script. */
function hashScript(script: string): string {
  let hash = 0;
  for (let i = 0; i < script.length; i++) {
    hash = (hash << 5) - hash + script.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
