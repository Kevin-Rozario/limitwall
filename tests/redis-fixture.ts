import { GenericContainer, type StartedTestContainer } from "testcontainers";
import Redis from "ioredis";

export interface RedisFixture {
  redis: Redis;
  container: StartedTestContainer;
}

/** Starts a real, disposable Redis container for a test suite. */
export async function startRedisFixture(): Promise<RedisFixture> {
  const container = await new GenericContainer("redis:7-alpine")
    .withExposedPorts(6379)
    .start();

  const redis = new Redis(container.getMappedPort(6379), container.getHost());

  return { redis, container };
}

/** Tears down a fixture created by startRedisFixture. */
export async function stopRedisFixture(fixture: RedisFixture): Promise<void> {
  await fixture.redis.quit();
  await fixture.container.stop();
}
