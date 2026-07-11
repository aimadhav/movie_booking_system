import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  RESERVATION_TTL_MINUTES: z.coerce.number().int().positive().max(30).default(10),
});

export const env = schema.parse(process.env);

