import { Hono } from "hono";
import { expect, it } from "vitest";

import type { RateLimitStore } from "../src/store/types";

import { rateLimiter } from "../src/middleware";

/** A store whose calls never settle, like a connection to a dead Redis. */
const hangingStore: RateLimitStore = {
  eval: <T>() => new Promise<T>(() => {}),
};

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
