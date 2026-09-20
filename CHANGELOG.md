# Changelog

## 1.0.2

No functional or source code changes. Fixes the automated release pipeline: the publish job's Node version was bumped to satisfy npm's Trusted Publishing (OIDC) requirements after a `npm@latest` upgrade step broke on an older Node version.

## 1.0.1

No functional or source code changes. Published to validate the automated tag-triggered release pipeline end-to-end (later replaced with OIDC Trusted Publishing in 1.0.2's release process).

## 1.0.0

Initial stable release.

### Algorithms

- Fixed window
- Sliding window
- Token bucket
- Leaky bucket (implemented as GCRA)

### Stores

- `NodeRedisStore` - regular Node.js servers, via `ioredis`
- `UpstashRedisStore` - edge/serverless runtimes (Cloudflare Workers, Deno, Vercel Edge), via `@upstash/redis`

### Core

- `rateLimiter()` Hono middleware, config-driven per rule
- Algorithm check functions (`checkTokenBucket`, `checkFixedWindow`, `checkSlidingWindow`, `checkLeakyBucket`) exported directly for use outside Hono
- All checks run as atomic Lua scripts - safe under concurrent requests
- Identifiers are hashed (SHA-256, via Web Crypto) before being used in Redis keys
- Required, explicit `onError: "fail-open" | "fail-closed"` - no silent default
- `RateLimit-*` response headers (both IETF draft-6 and draft-7 styles), plus `Retry-After` on rejected leaky-bucket requests

### Known limitations

- `leakyBucket` does not expose a meaningful `remaining`/`reset` value on allowed requests (GCRA has no discrete count to report) - only `Retry-After` on rejection is meaningful for this algorithm
- `ioredis` peer dependency is pinned to `^5`; `^6` is not yet tested
- No Cloudflare Durable Objects store yet
- No built-in multi-rule composition (`combineRules()`) - stack multiple `rateLimiter()` middlewares instead

## 0.1.0

Initial development release, published while the four algorithms and stores were still being built and tested. Superseded by 1.0.0.
