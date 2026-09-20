# limitwall

Rate limiting middleware for [Hono](https://hono.dev), backed by Redis. Supports four algorithms - fixed window, sliding window, token bucket, and leaky bucket (GCRA) behind one config-driven middleware, with atomic Lua-script checks so counts stay correct under real concurrent traffic.

Works on regular Node servers (via `ioredis`) and edge/serverless runtimes like Cloudflare Workers (via Upstash's REST-based Redis client).

## Features

- **Four algorithms** - pick whichever fits your traffic shape, per rule
- **Atomic by design** - every check runs as a single Lua script inside Redis, so concurrent requests can't race past the limit
- **Edge-ready** - the Upstash store works anywhere `fetch` exists, no persistent connection required
- **Privacy-conscious keys** - identifiers (IPs, user IDs, etc.) are hashed before ever touching Redis
- **No silent defaults on failure** - you explicitly choose fail-open or fail-closed behavior when Redis is unreachable
- **Standard headers** - both IETF `RateLimit-*` header drafts supported, plus `Retry-After`

## Install

```bash
pnpm install limitwall hono

# pick the store(s) you need:
pnpm install ioredis          # for regular Node servers
pnpm install @upstash/redis   # for edge/serverless runtimes
```

## Quick start - Node + Redis

```ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { Redis } from "ioredis";

import { rateLimiter, RedisStore } from "limitwall";

const app = new Hono();
const store = new RedisStore({ client: new Redis() });

app.use(
  "/api/*",
  rateLimiter({
    algorithm: "tokenBucket",
    ruleName: "api",
    capacity: 10,
    refillRate: 0.5,
    identifier: (c) => c.req.header("x-forwarded-for") ?? "unknown",
    store,
    onError: "fail-open",
  }),
);

serve(app);
```

## Quick start - Cloudflare Workers + Upstash

```ts
import { Redis } from "@upstash/redis/cloudflare";
import { Hono } from "hono";

import { rateLimiter, UpstashStore } from "limitwall";

const app = new Hono<{
  Bindings: { UPSTASH_URL: string; UPSTASH_TOKEN: string };
}>();

app.use("/api/*", async (c, next) => {
  const store = new UpstashStore({
    client: new Redis({ url: c.env.UPSTASH_URL, token: c.env.UPSTASH_TOKEN }),
  });

  return rateLimiter({
    algorithm: "leakyBucket",
    ruleName: "api",
    capacity: 5,
    rate: 2,
    identifier: (c) => c.req.header("cf-connecting-ip") ?? "unknown",
    store,
    onError: "fail-closed",
  })(c, next);
});

export default app;
```

## Algorithms

| Algorithm       | Config fields            | Behavior                                                                                                                          |
| --------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `fixedWindow`   | `limit`, `windowSeconds` | Simplest. Resets on the dot every window; allows a burst right at the boundary.                                                   |
| `slidingWindow` | `limit`, `windowSeconds` | Blends the current and previous window's counts, avoiding the boundary-burst problem.                                             |
| `tokenBucket`   | `capacity`, `refillRate` | Bucket refills continuously; allows saved-up bursts up to `capacity`.                                                             |
| `leakyBucket`   | `capacity`, `rate`       | Implemented as GCRA. Smooths traffic into an even pace rather than allowing bursts. See note below on `remaining`/`reset` values. |

Every algorithm also accepts `ruleName` (required - namespaces its Redis keys) and `cost` (optional, defaults to `1`).

> **Note on `leakyBucket`:** unlike the other three algorithms, GCRA doesn't track a discrete "count remaining" - it tracks a single theoretical arrival time. As a result, `RateLimit-Remaining` and `RateLimit-Reset` are not meaningful on **allowed** `leakyBucket` requests and will read `0`. This is expected, not a bug. The value that _is_ meaningful for this algorithm is `Retry-After`, which is only set on **rejected** requests and tells the caller exactly how long to wait.

## Config reference

```ts
rateLimiter({
  algorithm: "tokenBucket" | "fixedWindow" | "slidingWindow" | "leakyBucket",
  ruleName: string,
  // ...algorithm-specific fields, see table above
  cost?: number,

  identifier: (c: Context) => string,   // required - what to rate limit by
  store: RateLimitStore,                // RedisStore or UpstashStore
  onError: "fail-open" | "fail-closed", // required - no silent default
  headerStyle?: "draft-6" | "draft-7",  // defaults to "draft-6"
  message?: (c: Context) => Response,   // overrides the default 429 body
});
```

## Response headers

On every request:

- `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (draft-6, default), or
- `RateLimit: limit=..., remaining=..., reset=...` (draft-7, if configured)

On a rejected leaky-bucket request, `Retry-After` is also set, telling the client exactly how long to wait. See the note under [Algorithms](#algorithms) - `RateLimit-Remaining`/`RateLimit-Reset` are not meaningful for `leakyBucket` outside of that rejection case.

## Development

```bash
pnpm install
pnpm run build      # tsup -> dist/
pnpm run test       # vitest, spins up real Redis via Testcontainers
pnpm run lint       # eslint (antfu config)
```

Tests use [Testcontainers](https://node.testcontainers.org/) to run against a real, disposable Redis instance - Docker must be running locally.

## License

MIT © Kevin Rozario
