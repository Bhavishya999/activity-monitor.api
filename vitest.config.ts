import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "src/**/__tests__/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    env: { LOG_LEVEL: "silent", TEST_DATABASE_URL: process.env["TEST_DATABASE_URL"] ?? "postgres://gam:gam@localhost:5432/gam_test" },
  },
});
