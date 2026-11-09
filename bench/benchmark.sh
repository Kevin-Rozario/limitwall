#!/usr/bin/env bash
# Usage (from the limitwall folder): bash bench/run-all.sh
# Needs: Redis in Docker (set CONTAINER below), pnpm deps installed.

CONTAINER="${CONTAINER:-$(docker ps -q --filter ancestor=redis:7-alpine | head -1)}"
OUT="bench/results.txt"

stop_server() {
  pkill -f "bench/server.ts" >/dev/null 2>&1
  sleep 1
}

run() {
  local algo="$1" mode="$2"

  stop_server
  docker exec "$CONTAINER" redis-cli flushall >/dev/null
  local base
  base=$(docker exec "$CONTAINER" redis-cli info memory | grep -w used_memory | tr -d '\r' | cut -d: -f2)

  ALGO="$algo" ID_MODE="$mode" npx tsx bench/server.ts >/dev/null 2>&1 &
  sleep 4

  local json
  json=$(npx autocannon -c 100 -d 15 -j http://localhost:3000/api/ping 2>/dev/null)

  local dbsize mem
  dbsize=$(docker exec "$CONTAINER" redis-cli dbsize | tr -d '\r')
  mem=$(docker exec "$CONTAINER" redis-cli info memory | grep -w used_memory | tr -d '\r' | cut -d: -f2)
  stop_server

  echo "$json" | ALGO="$algo" MODE="$mode" BASE="$base" DBSIZE="$dbsize" MEM="$mem" node -e '
    let s = "";
    process.stdin.on("data", d => (s += d)).on("end", () => {
      const r = JSON.parse(s);
      const e = process.env;
      const keys = Number(e.DBSIZE);
      const bytesPerKey = keys > 0 ? Math.round((Number(e.MEM) - Number(e.BASE)) / keys) : 0;
      console.log([
        e.ALGO.padEnd(14),
        e.MODE.padEnd(7),
        `req/s ${Math.round(r.requests.average)}`,
        `p50 ${r.latency.p50}ms`,
        `p99 ${r.latency.p99}ms`,
        `non2xx ${r.non2xx}`,
        `errors ${r.errors}`,
        `keys ${keys}`,
        `bytes/key ${bytesPerKey}`,
      ].join(" | "));
    });
  ' | tee -a "$OUT"
}

echo "=== $(date) ===" | tee -a "$OUT"

run none single
for algo in fixedWindow slidingWindow tokenBucket leakyBucket; do
  run "$algo" single
  run "$algo" random
done

echo "Done. Results saved in $OUT"