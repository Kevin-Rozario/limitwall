import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

import type { RateLimitStore } from "../src/store/types";

import { combineRules } from "../src/compose";
import { buildKey } from "../src/key";
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

it("throws when created with an empty rule list", () => {
  expect(() => combineRules([])).toThrow(/at least one rule/);
});

it("allows the request when every rule allows", async () => {
  const store = new NodeRedisStore({ client: fixture.redis });
  let nextRan = false;
  const app = new Hono();
  app.use(
    combineRules([
      {
        algorithm: "fixedWindow",
        ruleName: "compose-allow-a",
        limit: 5,
        windowSeconds: 60,
        identifier: () => "user",
        store,
        onError: "fail-closed",
      },
      {
        algorithm: "fixedWindow",
        ruleName: "compose-allow-b",
        limit: 5,
        windowSeconds: 60,
        identifier: () => "user",
        store,
        onError: "fail-closed",
      },
    ]),
  );
  app.get("/", (c) => {
    nextRan = true;
    return c.text("ok");
  });

  const res = await app.request("/");

  expect(res.status).toBe(200);
  expect(nextRan).toBe(true);
});

it("returns 429 when a later rule rejects", async () => {
  const store = new NodeRedisStore({ client: fixture.redis });
  const app = new Hono();
  app.use(
    combineRules([
      {
        algorithm: "fixedWindow",
        ruleName: "compose-later-a",
        limit: 10,
        windowSeconds: 60,
        identifier: () => "user",
        store,
        onError: "fail-closed",
      },
      {
        algorithm: "fixedWindow",
        ruleName: "compose-later-b",
        limit: 1,
        windowSeconds: 60,
        identifier: () => "user",
        store,
        onError: "fail-closed",
      },
    ]),
  );
  app.get("/", c => c.text("ok"));

  await app.request("/");
  const res = await app.request("/");

  expect(res.status).toBe(429);
  expect(res.headers.get("RateLimit-Limit")).toBe("1");
});

it("does not charge a later rule after an earlier reject", async () => {
  const store = new NodeRedisStore({ client: fixture.redis });
  const app = new Hono();
  app.use(
    combineRules([
      {
        algorithm: "fixedWindow",
        ruleName: "compose-short-a",
        limit: 1,
        windowSeconds: 60,
        identifier: () => "user",
        store,
        onError: "fail-closed",
      },
      {
        algorithm: "fixedWindow",
        ruleName: "compose-short-b",
        limit: 10,
        windowSeconds: 60,
        identifier: () => "user",
        store,
        onError: "fail-closed",
      },
    ]),
  );
  app.get("/", c => c.text("ok"));

  await app.request("/");
  await app.request("/");

  const secondKey = await buildKey("compose-short-b", "fixedwindow", "user");
  expect(await fixture.redis.get(secondKey)).toBe("1");
});

it("fail-closed on an earlier rule returns 503 and skips later rules", async () => {
  const store = new NodeRedisStore({ client: fixture.redis });
  let nextRan = false;
  const app = new Hono();
  app.use(
    combineRules([
      {
        algorithm: "fixedWindow",
        ruleName: "compose-closed-a",
        limit: 10,
        windowSeconds: 60,
        identifier: () => "user",
        store: new ThrowingStore(),
        onError: "fail-closed",
      },
      {
        algorithm: "fixedWindow",
        ruleName: "compose-closed-b",
        limit: 10,
        windowSeconds: 60,
        identifier: () => "user",
        store,
        onError: "fail-closed",
      },
    ]),
  );
  app.get("/", (c) => {
    nextRan = true;
    return c.text("ok");
  });

  const res = await app.request("/");
  const secondKey = await buildKey("compose-closed-b", "fixedwindow", "user");

  expect(res.status).toBe(503);
  expect(nextRan).toBe(false);
  expect(await fixture.redis.get(secondKey)).toBeNull();
});

it("fail-open on an earlier rule continues to later rules", async () => {
  const store = new NodeRedisStore({ client: fixture.redis });
  let nextRan = false;
  const app = new Hono();
  app.use(
    combineRules([
      {
        algorithm: "fixedWindow",
        ruleName: "compose-open-a",
        limit: 10,
        windowSeconds: 60,
        identifier: () => "user",
        store: new ThrowingStore(),
        onError: "fail-open",
      },
      {
        algorithm: "fixedWindow",
        ruleName: "compose-open-b",
        limit: 10,
        windowSeconds: 60,
        identifier: () => "user",
        store,
        onError: "fail-closed",
      },
    ]),
  );
  app.get("/", (c) => {
    nextRan = true;
    return c.text("ok");
  });

  const res = await app.request("/");

  expect(res.status).toBe(200);
  expect(nextRan).toBe(true);
  expect(res.headers.get("RateLimit-Limit")).toBe("10");
});

it("uses the lowest remaining on allow", async () => {
  const store = new NodeRedisStore({ client: fixture.redis });
  const app = new Hono();
  app.use(
    combineRules([
      {
        algorithm: "fixedWindow",
        ruleName: "compose-rem-a",
        limit: 10,
        windowSeconds: 60,
        identifier: () => "user",
        store,
        onError: "fail-closed",
      },
      {
        algorithm: "fixedWindow",
        ruleName: "compose-rem-b",
        limit: 3,
        windowSeconds: 60,
        identifier: () => "user",
        store,
        onError: "fail-closed",
      },
    ]),
  );
  app.get("/", c => c.text("ok"));

  const res = await app.request("/");

  expect(res.status).toBe(200);
  expect(res.headers.get("RateLimit-Limit")).toBe("3");
  expect(res.headers.get("RateLimit-Remaining")).toBe("2");
});

it("falls back to the last evaluated rule when remaining is omitted", async () => {
  const store = new NodeRedisStore({ client: fixture.redis });
  const app = new Hono();
  app.use(
    combineRules([
      {
        algorithm: "leakyBucket",
        ruleName: "compose-gcra-a",
        capacity: 10,
        rate: 1,
        identifier: () => "user",
        store,
        onError: "fail-closed",
      },
      {
        algorithm: "leakyBucket",
        ruleName: "compose-gcra-b",
        capacity: 4,
        rate: 1,
        identifier: () => "user",
        store,
        onError: "fail-closed",
      },
    ]),
  );
  app.get("/", c => c.text("ok"));

  const res = await app.request("/");

  expect(res.status).toBe(200);
  expect(res.headers.get("RateLimit-Limit")).toBe("4");
});
