import { z } from "zod";
import { existsSync } from "node:fs";

if (process.env.NODE_ENV !== "production" && existsSync(".env")) {
  process.loadEnvFile(".env");
}

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  RESERVATION_TTL_MINUTES: z.coerce.number().int().positive().max(30).default(10),
  WORKER_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
});

export const env = schema.parse(process.env);
