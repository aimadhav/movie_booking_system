import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email().max(320).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128),
});

export const loginSchema = registerSchema;
