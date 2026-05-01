import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./src/test/setup-env.ts"],
    testTimeout: 30_000,
  },
});
