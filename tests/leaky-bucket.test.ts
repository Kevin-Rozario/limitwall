import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

import { checkLeakyBucket } from "../src/algorithms/leaky-bucket";
import { RedisStore } from "../src/store/redis-store";
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

it("allows a request within capacity", async () => {
  const store = new RedisStore({ client: fixture.redis });
  const config = {
    ruleName: "lb-1",
    algorithm: "leakyBucket" as const,
    capacity: 3,
    rate: 1,
  };

  const result = await checkLeakyBucket(store, "user-1", config);
  expect(result.allowed).toBe(true);
});

it("rejects a burst beyond capacity and reports a wait time", async () => {
  const store = new RedisStore({ client: fixture.redis });
  const config = {
    ruleName: "lb-2",
    algorithm: "leakyBucket" as const,
    capacity: 2,
    rate: 1,
  };

  await checkLeakyBucket(store, "user-2", config);
  await checkLeakyBucket(store, "user-2", config);
  const blocked = await checkLeakyBucket(store, "user-2", config);

  expect(blocked.allowed).toBe(false);
  expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
});

it("paces requests evenly instead of allowing a full re-burst", async () => {
  const store = new RedisStore({ client: fixture.redis });
  const config = {
    ruleName: "lb-3",
    algorithm: "leakyBucket" as const,
    capacity: 1,
    rate: 2,
  };

  await checkLeakyBucket(store, "user-3", config);
  const blocked = await checkLeakyBucket(store, "user-3", config);
  expect(blocked.allowed).toBe(false);

  // one emission interval at rate=2 is 0.5s - wait a bit past that
  await new Promise(resolve => setTimeout(resolve, 600));

  const afterWait = await checkLeakyBucket(store, "user-3", config);
  expect(afterWait.allowed).toBe(true);
});

it("rejects concurrent requests beyond the burst - proves atomicity", async () => {
  const store = new RedisStore({ client: fixture.redis });
  const config = {
    ruleName: "lb-4",
    algorithm: "leakyBucket" as const,
    capacity: 5,
    rate: 1,
  };

  const results = await Promise.all(
    Array.from({ length: 10 }, () => checkLeakyBucket(store, "user-4", config)),
  );

  expect(results.filter(r => r.allowed).length).toBe(5);
});
