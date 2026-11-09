# Changelog

## 1.2.0

### Added

- `timeoutMs` option (default 1000 ms): a store call that takes longer counts as a failure, and `onError` applies. Previously an unreachable Redis could hang requests for 10-16 s because of the ioredis connect and retry defaults.
- Concurrency tests: 1,000 requests over 20 separate Redis connections allow exactly the configured limit, for all four algorithms.
- Sliding-window boundary test and token-bucket refill-precision test.
- Benchmark scripts in `bench/` (`bash bench/benchmark.sh`).

### Fixed

- Token bucket used whole-second Redis time, so a drained bucket at 5 tokens/s took up to about 1 s to refill instead of 200 ms. It now uses microsecond time (measured: about 218 ms).
- Sliding window now keeps both window counters in one hash under its single declared key, so the script touches only declared keys (Redis Cluster safe by construction; not yet tested on a real cluster). The key format changed, so sliding-window counters reset once on upgrade.

### Changed

- Token bucket `remaining` now has sub-second precision, so it may read e.g. `1.0009` instead of exactly `1` between rapid calls.

## 1.1.0

### Added

- `combineRules()` - one middleware that evaluates several rules in order. Short-circuits on the first reject (later rules are not charged). On allow, `RateLimit-*` headers come from the rule with the lowest remaining, or the last evaluated rule when none report remaining.
- Tests for `rateLimiter()`: fail-open, fail-closed, draft-6/draft-7 headers, custom 429 `message`, and leaky-bucket `Retry-After`.

### Breaking (types only)

- `cost` is valid only on `tokenBucket` and `leakyBucket`. Passing it on `fixedWindow` or `slidingWindow` is now a TypeScript error. Runtime never used `cost` on window algorithms.

### Docs

- Token bucket field is `rate`, not `refillRate`.

Each composed rule is still one Redis round trip (not a single multi-key Lua script). Stacking `rateLimiter()` middlewares remains supported.

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

## 0.1.0

Initial development release, published while the four algorithms and stores were still being built and tested. Superseded by 1.0.0.
