/* eslint-disable node/no-process-env, no-console */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { Redis } from "ioredis";
//
// ALGO=none|fixedWindow|slidingWindow|tokenBucket|leakyBucket
// ID_MODE=single (one hot key) | random (new key per request)
// ONERROR=fail-open|fail-closed
import { randomUUID } from "node:crypto";

import { NodeRedisStore, rateLimiter } from "../src";

const algo = process.env.ALGO ?? "none";
const idMode = process.env.ID_MODE ?? "single";
const onError = (process.env.ONERROR ?? "fail-open") as
  | "fail-open"
  | "fail-closed";

const app = new Hono();
const store = new NodeRedisStore({ client: new Redis() });

// Huge limits so we measure the cost of the check itself on the "allowed" path.
const algoConfigs: Record<string, object> = {
  fixedWindow: {
    algorithm: "fixedWindow",
    limit: 100_000_000,
    windowSeconds: 60,
  },
  slidingWindow: {
    algorithm: "slidingWindow",
    limit: 100_000_000,
    windowSeconds: 60,
  },
  tokenBucket: { algorithm: "tokenBucket", capacity: 100_000_000, rate: 1000 },
  leakyBucket: { algorithm: "leakyBucket", capacity: 100_000_000, rate: 1000 },
};

if (algo !== "none") {
  app.use(
    "/api/*",
    rateLimiter({
      ...algoConfigs[algo],
      ruleName: "bench",
      identifier: () => (idMode === "random" ? randomUUID() : "hot-key"),
      store,
      onError,
    } as Parameters<typeof rateLimiter>[0]),
  );
}

app.get("/api/ping", c => c.json({ ok: true }));

serve({ fetch: app.fetch, port: 3000 });
console.log(
  `bench server: ALGO=${algo} ID_MODE=${idMode} ONERROR=${onError} on :3000`,
);
