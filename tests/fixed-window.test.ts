import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

import { checkFixedWindow } from "../src/algorithms/fixed-window";
import { NodeRedisStore } from "../src/store/redis-store";
import {
  type RedisFixture,
  startRedisFixture,
  stopRedisFixture,
} from "./redis-fixture";

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

it("allows requests within the limit", async () => {
  const store = new NodeRedisStore({ client: fixture.redis });
  const config = {
    ruleName: "fw-1",
    algorithm: "fixedWindow" as const,
    limit: 3,
    windowSeconds: 60,
  };

  const result = await checkFixedWindow(store, "user-1", config);
  expect(result.allowed).toBe(true);
  expect(result.remaining).toBe(2);
});

it("rejects once the limit is hit within the window", async () => {
  const store = new NodeRedisStore({ client: fixture.redis });
  const config = {
    ruleName: "fw-2",
    algorithm: "fixedWindow" as const,
    limit: 2,
    windowSeconds: 60,
  };

  await checkFixedWindow(store, "user-2", config);
  await checkFixedWindow(store, "user-2", config);
  const result = await checkFixedWindow(store, "user-2", config);

  expect(result.allowed).toBe(false);
});

it("resets once the window expires", async () => {
  const store = new NodeRedisStore({ client: fixture.redis });
  const config = {
    ruleName: "fw-3",
    algorithm: "fixedWindow" as const,
    limit: 1,
    windowSeconds: 1,
  };

  await checkFixedWindow(store, "user-3", config);
  const blocked = await checkFixedWindow(store, "user-3", config);
  expect(blocked.allowed).toBe(false);

  await new Promise(resolve => setTimeout(resolve, 1100));

  const afterReset = await checkFixedWindow(store, "user-3", config);
  expect(afterReset.allowed).toBe(true);
});

it("rejects concurrent requests beyond the limit - proves atomicity", async () => {
  const store = new NodeRedisStore({ client: fixture.redis });
  const config = {
    ruleName: "fw-4",
    algorithm: "fixedWindow" as const,
    limit: 5,
    windowSeconds: 60,
  };

  const results = await Promise.all(
    Array.from({ length: 10 }, () => checkFixedWindow(store, "user-4", config)),
  );

  expect(results.filter(r => r.allowed).length).toBe(5);
});
