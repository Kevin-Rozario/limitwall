import Redis from "ioredis";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

import { checkFixedWindow } from "../src/algorithms/fixed-window";
import { checkLeakyBucket } from "../src/algorithms/leaky-bucket";
import { checkSlidingWindow } from "../src/algorithms/sliding-window";
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

const CLIENTS = 20;
const PER_CLIENT = 50;
const LIMIT = 100;

type Checker = (store: NodeRedisStore) => Promise<{ allowed: boolean }>;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Opens `n` independent connections, runs `fn` on each, then closes them. */
async function withClients<T>(
  n: number,
  fn: (store: NodeRedisStore) => Promise<T>,
): Promise<T[]> {
  const clients = Array.from(
    { length: n },
    () =>
      new Redis(
        fixture.container.getMappedPort(6379),
        fixture.container.getHost(),
      ),
  );

  try {
    return await Promise.all(
      clients.map(client => fn(new NodeRedisStore({ client }))),
    );
  }
  finally {
    await Promise.all(clients.map(client => client.quit()));
  }
}

/** Reads the current time in whole seconds from Redis, the same clock the Lua scripts use. */
async function redisSecond(): Promise<number> {
  const [seconds] = await fixture.redis.time();
  return Number(seconds);
}

/** Polls until Redis's clock is at `phase` seconds within a `windowSeconds` window. */
async function waitForPhase(
  windowSeconds: number,
  phase: number,
): Promise<void> {
  while ((await redisSecond()) % windowSeconds !== phase) await sleep(15);
}

const algorithmChecks: Array<[string, Checker]> = [
  [
    "fixedWindow",
    store =>
      checkFixedWindow(store, "user", {
        ruleName: "mc-fw",
        algorithm: "fixedWindow",
        limit: LIMIT,
        windowSeconds: 3600,
      }),
  ],
  [
    "slidingWindow",
    store =>
      checkSlidingWindow(store, "user", {
        ruleName: "mc-sw",
        algorithm: "slidingWindow",
        limit: LIMIT,
        windowSeconds: 3600,
      }),
  ],
  [
    "tokenBucket",
    store =>
      checkTokenBucket(store, "user", {
        ruleName: "mc-tb",
        algorithm: "tokenBucket",
        capacity: LIMIT,
        rate: 0.0001,
      }),
  ],
  [
    "leakyBucket",
    store =>
      checkLeakyBucket(store, "user", {
        ruleName: "mc-lb",
        algorithm: "leakyBucket",
        capacity: LIMIT,
        rate: 0.0001,
      }),
  ],
];

it.each(algorithmChecks)(
  "%s allows exactly the limit across many connections",
  async (_name, check) => {
    const allowedPerClient = await withClients(CLIENTS, async (store) => {
      const results = await Promise.all(
        Array.from({ length: PER_CLIENT }, () => check(store)),
      );
      return results.filter(result => result.allowed).length;
    });

    const totalAllowed = allowedPerClient.reduce((sum, n) => sum + n, 0);
    expect(totalAllowed).toBe(LIMIT);
  },
  60000,
);

it("sliding window still blocks right after a window boundary", async () => {
  const store = new NodeRedisStore({ client: fixture.redis });
  const windowSeconds = 4;
  const config = {
    ruleName: "sw-boundary",
    algorithm: "slidingWindow" as const,
    limit: 4,
    windowSeconds,
  };

  await waitForPhase(windowSeconds, windowSeconds - 1);
  for (let i = 0; i < 4; i++) {
    const result = await checkSlidingWindow(store, "user", config);
    expect(result.allowed).toBe(true);
  }

  await waitForPhase(windowSeconds, 0);
  const afterBoundary = await checkSlidingWindow(store, "user", config);
  expect(afterBoundary.allowed).toBe(false);
}, 30000);

it("token bucket refills at sub-second precision", async () => {
  const store = new NodeRedisStore({ client: fixture.redis });
  const config = {
    ruleName: "tb-precision",
    algorithm: "tokenBucket" as const,
    capacity: 5,
    rate: 5,
  };

  for (let i = 0; i < 5; i++) await checkTokenBucket(store, "user", config);

  const startedAt = Date.now();
  let waitedMs = -1;
  while (Date.now() - startedAt < 3000) {
    const result = await checkTokenBucket(store, "user", config);
    if (result.allowed) {
      waitedMs = Date.now() - startedAt;
      break;
    }
    await sleep(25);
  }

  expect(waitedMs).toBeGreaterThan(0);
  expect(waitedMs).toBeLessThan(500);
}, 15000);

it("sliding window script only touches the key it is given", () => {
  const source = readFileSync("src/algorithms/sliding-window.ts", "utf8");
  expect(source).not.toMatch(/KEYS\[1\]\s*\.\./);
});
