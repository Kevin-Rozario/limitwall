import { Hono } from "hono";
import { expect, it } from "vitest";

import type { RateLimitStore } from "../src/store/types";

import { combineRules } from "../src/compose";
import { rateLimiter } from "../src/middleware";

/** A store whose calls never settle, like a connection to a dead Redis. */
const hangingStore: RateLimitStore = {
  eval: <T>() => new Promise<T>(() => {}),
};

/** A store that always allows a fixed window check and counts its calls. */
function countingStore() {
  const store = {
    calls: 0,
    async eval<T>(): Promise<T> {
      store.calls++;
      return [1, 9, 60] as T;
    },
  };
  return store;
}

function buildComposedApp(
  onError: "fail-open" | "fail-closed",
  laterStore: RateLimitStore,
) {
  const app = new Hono();

  app.use(
    "/api/*",
    combineRules([
      {
        algorithm: "tokenBucket",
        ruleName: "timeout-first",
        capacity: 5,
        rate: 1,
        identifier: () => "user",
        store: hangingStore,
        onError,
        timeoutMs: 50,
      },
      {
        algorithm: "fixedWindow",
        ruleName: "timeout-second",
        limit: 10,
        windowSeconds: 60,
        identifier: () => "user",
        store: laterStore,
        onError: "fail-closed",
      },
    ]),
  );
  app.get("/api/ping", c => c.text("ok"));

  return app;
}

function buildApp(onError: "fail-open" | "fail-closed") {
  const app = new Hono();

  app.use(
    "/api/*",
    rateLimiter({
      algorithm: "tokenBucket",
      ruleName: "timeout",
      capacity: 5,
      rate: 1,
      identifier: () => "user",
      store: hangingStore,
      onError,
      timeoutMs: 50,
    }),
  );
  app.get("/api/ping", c => c.text("ok"));

  return app;
}

it("fail-open serves the request quickly when the store hangs", async () => {
  const startedAt = Date.now();
  const response = await buildApp("fail-open").request("/api/ping");

  expect(response.status).toBe(200);
  expect(Date.now() - startedAt).toBeLessThan(500);
});

it("fail-closed returns 503 quickly when the store hangs", async () => {
  const startedAt = Date.now();
  const response = await buildApp("fail-closed").request("/api/ping");

  expect(response.status).toBe(503);
  expect(Date.now() - startedAt).toBeLessThan(500);
});

it("combineRules returns 503 and skips later rules when a fail-closed rule times out", async () => {
  const laterStore = countingStore();
  const startedAt = Date.now();
  const response = await buildComposedApp("fail-closed", laterStore).request(
    "/api/ping",
  );

  expect(response.status).toBe(503);
  expect(laterStore.calls).toBe(0);
  expect(Date.now() - startedAt).toBeLessThan(500);
});

it("combineRules skips a timed-out fail-open rule and evaluates later rules", async () => {
  const laterStore = countingStore();
  const startedAt = Date.now();
  const response = await buildComposedApp("fail-open", laterStore).request(
    "/api/ping",
  );

  expect(response.status).toBe(200);
  expect(laterStore.calls).toBe(1);
  expect(response.headers.get("RateLimit-Limit")).toBe("10");
  expect(Date.now() - startedAt).toBeLessThan(500);
});
