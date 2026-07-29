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
    env: {
      DATABASE_URL: process.env.DATABASE_URL,
      JWT_SECRET: "integration-test-secret-that-is-long-enough",
      RESERVATION_TTL_MINUTES: "10",
    },
  },
});
