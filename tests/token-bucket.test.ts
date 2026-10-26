import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

import { checkTokenBucket } from "../src/algorithms/token-bucket";
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

it("allows a request within capacity", async () => {
  const store = new NodeRedisStore({ client: fixture.redis });
  const config = {
    ruleName: "tb-1",
    algorithm: "tokenBucket" as const,
    capacity: 5,
    rate: 1,
  };

  const result = await checkTokenBucket(store, "user-1", config);
  expect(result.allowed).toBe(true);
  expect(result.remaining).toBe(4);
});

it("rejects once the bucket is empty", async () => {
  const store = new NodeRedisStore({ client: fixture.redis });
  const config = {
    ruleName: "tb-2",
    algorithm: "tokenBucket" as const,
    capacity: 3,
    rate: 1,
  };

  for (let i = 0; i < 3; i++) await checkTokenBucket(store, "user-2", config);
  const result = await checkTokenBucket(store, "user-2", config);

  expect(result.allowed).toBe(false);
});

it("refills over time", async () => {
  const store = new NodeRedisStore({ client: fixture.redis });
  const config = {
    ruleName: "tb-3",
    algorithm: "tokenBucket" as const,
    capacity: 2,
    rate: 5,
  };

  await checkTokenBucket(store, "user-3", config);
  await checkTokenBucket(store, "user-3", config);
  const blocked = await checkTokenBucket(store, "user-3", config);
  expect(blocked.allowed).toBe(false);

  await new Promise(resolve => setTimeout(resolve, 1100));

  const afterRefill = await checkTokenBucket(store, "user-3", config);
  expect(afterRefill.allowed).toBe(true);
});

it("treats omitted cost as 1", async () => {
  const store = new NodeRedisStore({ client: fixture.redis });
  const config = {
    ruleName: "tb-cost-default",
    algorithm: "tokenBucket" as const,
    capacity: 3,
    rate: 1,
  };

  const first = await checkTokenBucket(store, "user-cost-1", config);
  const second = await checkTokenBucket(store, "user-cost-1", config);
  const third = await checkTokenBucket(store, "user-cost-1", config);
  const fourth = await checkTokenBucket(store, "user-cost-1", config);

  expect(first.remaining).toBe(2);
  expect(second.remaining).toBe(1);
  expect(third.remaining).toBe(0);
  expect(fourth.allowed).toBe(false);
});

it("spends an explicit cost greater than 1", async () => {
  const store = new NodeRedisStore({ client: fixture.redis });
  const config = {
    ruleName: "tb-cost-explicit",
    algorithm: "tokenBucket" as const,
    capacity: 5,
    rate: 1,
    cost: 2,
  };

  const first = await checkTokenBucket(store, "user-cost-2", config);
  const second = await checkTokenBucket(store, "user-cost-2", config);
  const third = await checkTokenBucket(store, "user-cost-2", config);

  expect(first.allowed).toBe(true);
  expect(first.remaining).toBe(3);
  expect(second.allowed).toBe(true);
  expect(second.remaining).toBe(1);
  expect(third.allowed).toBe(false);
});

it("rejects concurrent requests beyond capacity - proves atomicity", async () => {
  const store = new NodeRedisStore({ client: fixture.redis });
  const config = {
    ruleName: "tb-4",
    algorithm: "tokenBucket" as const,
    capacity: 5,
    rate: 1,
  };

  const results = await Promise.all(
    Array.from({ length: 10 }, () => checkTokenBucket(store, "user-4", config)),
  );

  expect(results.filter(r => r.allowed).length).toBe(5);
});
