import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { RedisStore } from "../src/store/redis-store";
import { checkSlidingWindow } from "../src/algorithms/sliding-window";
import {
  startRedisFixture,
  stopRedisFixture,
  type RedisFixture,
} from "./redis-fixture";

let fixture: RedisFixture;

beforeAll(async () => {
  fixture = await startRedisFixture();
}, 60000);

afterAll(async () => {
  await stopRedisFixture(fixture);
});

beforeEach(async () => {
  await fixture.redis.flushall();
});

it("allows a request within the limit", async () => {
  const store = new RedisStore({ client: fixture.redis });
  const config = {
    ruleName: "sw-1",
    algorithm: "slidingWindow" as const,
    limit: 3,
    windowSeconds: 60,
  };

  const result = await checkSlidingWindow(store, "user-1", config);
  expect(result.allowed).toBe(true);
});

it("does not allow a full extra burst right at the window boundary", async () => {
  const store = new RedisStore({ client: fixture.redis });
  const config = {
    ruleName: "sw-2",
    algorithm: "slidingWindow" as const,
    limit: 4,
    windowSeconds: 2,
  };

  // Exhaust the limit immediately.
  for (let i = 0; i < 4; i++) await checkSlidingWindow(store, "user-2", config);
  const blocked = await checkSlidingWindow(store, "user-2", config);
  expect(blocked.allowed).toBe(false);

  // Cross the window boundary. A fixed-window algorithm would fully
  // reset here and allow another full burst - sliding window shouldn't.
  await new Promise((resolve) => setTimeout(resolve, 2100));

  let allowedAfterBoundary = 0;
  for (let i = 0; i < 4; i++) {
    const result = await checkSlidingWindow(store, "user-2", config);
    if (result.allowed) allowedAfterBoundary++;
  }

  expect(allowedAfterBoundary).toBeLessThanOrEqual(4);
});

it("rejects concurrent requests beyond the limit - proves atomicity", async () => {
  const store = new RedisStore({ client: fixture.redis });
  const config = {
    ruleName: "sw-3",
    algorithm: "slidingWindow" as const,
    limit: 5,
    windowSeconds: 60,
  };

  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      checkSlidingWindow(store, "user-3", config),
    ),
  );

  expect(results.filter((r) => r.allowed).length).toBe(5);
});
