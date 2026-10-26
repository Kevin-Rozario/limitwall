import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

import type { RateLimitStore } from "../src/store/types";

import { rateLimiter } from "../src/middleware";
import { NodeRedisStore } from "../src/store/redis-store";
import {
  type RedisFixture,
  startRedisFixture,
  stopRedisFixture,
} from "./redis-fixture";

class ThrowingStore implements RateLimitStore {
  async eval(): Promise<never> {
    throw new Error("store unreachable");
  }
}

let fixture: RedisFixture;

beforeAll(async () => {
  fixture = await startRedisFixture();
}, 60000);

beforeEach(async () => {
  await fixture.redis.flushall();
});

afterAll(async () => {
  await stopRedisFixture(fixture);
});

it("fail-open proceeds with no RateLimit headers when the store throws", async () => {
  const app = new Hono();
  app.use(
    rateLimiter({
      algorithm: "fixedWindow",
      ruleName: "mw-fail-open",
      limit: 1,
      windowSeconds: 60,
      identifier: () => "user",
      store: new ThrowingStore(),
      onError: "fail-open",
    }),
  );
  app.get("/", c => c.text("ok"));

  const res = await app.request("/");

  expect(res.status).toBe(200);
  expect(await res.text()).toBe("ok");
  expect(res.headers.get("RateLimit-Limit")).toBeNull();
  expect(res.headers.get("RateLimit-Remaining")).toBeNull();
  expect(res.headers.get("RateLimit-Reset")).toBeNull();
});

it("fail-closed returns 503 and does not call next when the store throws", async () => {
  let nextRan = false;
  const app = new Hono();
  app.use(
    rateLimiter({
      algorithm: "fixedWindow",
      ruleName: "mw-fail-closed",
      limit: 1,
      windowSeconds: 60,
      identifier: () => "user",
      store: new ThrowingStore(),
      onError: "fail-closed",
    }),
  );
  app.get("/", (c) => {
    nextRan = true;
    return c.text("ok");
  });

  const res = await app.request("/");

  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ error: "Rate limiter unavailable" });
  expect(nextRan).toBe(false);
});

it("allows a request within the limit and sets draft-6 headers", async () => {
  const store = new NodeRedisStore({ client: fixture.redis });
  let nextRan = false;
  const app = new Hono();
  app.use(
    rateLimiter({
      algorithm: "fixedWindow",
      ruleName: "mw-allow",
      limit: 5,
      windowSeconds: 60,
      identifier: () => "user",
      store,
      onError: "fail-closed",
    }),
  );
  app.get("/", (c) => {
    nextRan = true;
    return c.text("ok");
  });

  const res = await app.request("/");

  expect(res.status).toBe(200);
  expect(nextRan).toBe(true);
  expect(res.headers.get("RateLimit-Limit")).toBe("5");
  expect(res.headers.get("RateLimit-Remaining")).toBe("4");
  expect(res.headers.get("RateLimit-Reset")).toBeTruthy();
});

it("rejects with default 429 JSON when the limit is exceeded", async () => {
  const store = new NodeRedisStore({ client: fixture.redis });
  const app = new Hono();
  app.use(
    rateLimiter({
      algorithm: "fixedWindow",
      ruleName: "mw-429",
      limit: 1,
      windowSeconds: 60,
      identifier: () => "user",
      store,
      onError: "fail-closed",
    }),
  );
  app.get("/", c => c.text("ok"));

  await app.request("/");
  const res = await app.request("/");

  expect(res.status).toBe(429);
  expect(await res.json()).toEqual({ error: "Too many requests" });
  expect(res.headers.get("RateLimit-Limit")).toBe("1");
  expect(res.headers.get("RateLimit-Remaining")).toBe("0");
});

it("uses a custom message response on reject and still sets RateLimit headers", async () => {
  const store = new NodeRedisStore({ client: fixture.redis });
  const app = new Hono();
  app.use(
    rateLimiter({
      algorithm: "fixedWindow",
      ruleName: "mw-message",
      limit: 1,
      windowSeconds: 60,
      identifier: () => "user",
      store,
      onError: "fail-closed",
      message: c => c.json({ error: "custom" }, 429),
    }),
  );
  app.get("/", c => c.text("ok"));

  await app.request("/");
  const res = await app.request("/");

  expect(res.status).toBe(429);
  expect(await res.json()).toEqual({ error: "custom" });
  expect(res.headers.get("RateLimit-Limit")).toBe("1");
});

it("emits a single RateLimit header when headerStyle is draft-7", async () => {
  const store = new NodeRedisStore({ client: fixture.redis });
  const app = new Hono();
  app.use(
    rateLimiter({
      algorithm: "fixedWindow",
      ruleName: "mw-draft-7",
      limit: 8,
      windowSeconds: 60,
      identifier: () => "user",
      store,
      onError: "fail-closed",
      headerStyle: "draft-7",
    }),
  );
  app.get("/", c => c.text("ok"));

  const res = await app.request("/");

  expect(res.headers.get("RateLimit")).toMatch(/^limit=8, remaining=7, reset=/);
  expect(res.headers.get("RateLimit-Limit")).toBeNull();
});

it("sets Retry-After on a rejected leaky bucket request", async () => {
  const store = new NodeRedisStore({ client: fixture.redis });
  const app = new Hono();
  app.use(
    rateLimiter({
      algorithm: "leakyBucket",
      ruleName: "mw-retry",
      capacity: 1,
      rate: 1,
      identifier: () => "user",
      store,
      onError: "fail-closed",
    }),
  );
  app.get("/", c => c.text("ok"));

  await app.request("/");
  const res = await app.request("/");

  expect(res.status).toBe(429);
  expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
});
