import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Testcontainers needs headroom to pull and start a real Redis container.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
