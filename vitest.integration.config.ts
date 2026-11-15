import { defineConfig } from "vitest/config";
import { existsSync } from "node:fs";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Copy .env.example to .env before integration tests.");
}

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.DATABASE_URL,
      JWT_SECRET: "integration-test-secret-that-is-long-enough",
      RESERVATION_TTL_MINUTES: "10",
      PAYMENT_WEBHOOK_SECRET: "integration-webhook-secret-that-is-long-enough",
      ENABLE_PAYMENT_LAB: "true",
    },
  },
});
