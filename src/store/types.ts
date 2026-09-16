/**
 * The minimal contract every storage backend must satisfy.
 *
 * Deliberately thin: each algorithm owns its own atomic Lua script, so
 * a store's only job is "run this script for me, atomically." This is
 * what lets RedisStore (persistent connection) and UpstashStore (REST
 * over HTTP) work behind the exact same interface.
 */
export interface RateLimitStore {
  /**
   * Runs a Lua script atomically and returns its result.
   * @param script The raw Lua script text.
   * @param keys   Redis KEYS[] — the keys the script will touch.
   * @param args   Redis ARGV[] — plain values the script needs.
   */
  eval: <T>(
    script: string,
    keys: string[],
    args: (string | number)[],
  ) => Promise<T>;
}
